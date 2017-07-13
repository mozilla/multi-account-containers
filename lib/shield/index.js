"use strict";

// Chrome privileged
const {Cu} = require("chrome");
const { Services } = Cu.import("resource://gre/modules/Services.jsm");
const { TelemetryController } = Cu.import("resource://gre/modules/TelemetryController.jsm");
const CID = Cu.import("resource://gre/modules/ClientID.jsm");

// sdk
const { merge } = require("sdk/util/object");
const querystring = require("sdk/querystring");
const { prefs } = require("sdk/simple-prefs");
const prefSvc = require("sdk/preferences/service");
const { setInterval } = require("sdk/timers");
const tabs = require("sdk/tabs");
const { URL } = require("sdk/url");

const { EventTarget } = require("./event-target");
const { emit } = require("sdk/event/core");
const self = require("sdk/self");

const DAY = 86400*1000;

// ongoing within-addon fuses / timers
let lastDailyPing = Date.now();

/* Functional, self-contained utils */

// equal probability choices from a list "choices"
function chooseVariation(choices,rng=Math.random()) {
  let l = choices.length;
  return choices[Math.floor(l*Math.random())];
}

function dateToUTC(date) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
}

function generateTelemetryIdIfNeeded() {
  let id = TelemetryController.clientID;
  /* istanbul ignore next */
  if (id == undefined) {
    return CID.ClientIDImpl._doLoadClientID()
  } else {
    return Promise.resolve(id)
  }
}

function userId () {
  return prefSvc.get("toolkit.telemetry.cachedClientID","unknown");
}

var Reporter = new EventTarget().on("report",
  (d) => prefSvc.get('shield.debug') && console.log("report",d)
);

function report(data, src="addon", bucket="shield-study") {
  data = merge({}, data , {
    study_version: self.version,
    about: {
      _src: src,
      _v: 2
    }
  });
  if (prefSvc.get('shield.testing')) data.testing = true

  emit(Reporter, "report", data);
  let telOptions = {addClientId: true, addEnvironment: true}
  return TelemetryController.submitExternalPing(bucket, data, telOptions);
}

function survey (url, queryArgs={}) {
  if (! url) return

  let U = new URL(url);
  let q = U.search;
  if (q) {
    url = U.href.split(q)[0];
    q = querystring.parse(querystring.unescape(q.slice(1)));
  } else {
    q = {};
  }
  // get user info.
  let newArgs = merge({},
    q,
    queryArgs
  );
  let searchstring = querystring.stringify(newArgs);
  url = url + "?" + searchstring;
  return url;
}


function setOrGetFirstrun () {
  let firstrun = prefs["shield.firstrun"];
  if (firstrun === undefined) {
    firstrun = prefs["shield.firstrun"] = String(dateToUTC(new Date())) // in utc, user set
  }
  return Number(firstrun)
}

function reuseVariation (choices) {
  return prefs["shield.variation"];
}

function setVariation (choice) {
  prefs["shield.variation"] = choice
  return choice
}

function die (addonId=self.id) {
  /* istanbul ignore else */
  if (prefSvc.get("shield.fakedie")) return;
  /* istanbul ignore next */
  require("sdk/addon/installer").uninstall(addonId);
}

// TODO: GRL vulnerable to clock time issues #1
function expired (xconfig, now = Date.now() ) {
  return ((now - Number(xconfig.firstrun))/ DAY) > xconfig.days;
}

function resetShieldPrefs () {
  delete prefs['shield.firstrun'];
  delete prefs['shield.variation'];
}

function cleanup () {
  prefSvc.keys(`extensions.${self.preferencesBranch}`).forEach (
  (p) => {
    delete prefs[p];
  })
}

function telemetrySubset (xconfig) {
  return {
    study_name: xconfig.name,
    branch: xconfig.variation,
  }
}

class Study extends EventTarget {
  constructor (config) {
    super();
    this.config = merge({
      name: self.addonId,
      variations: {'observe-only': () => {}},
      surveyUrls: {},
      days: 7
    },config);

    this.config.firstrun = setOrGetFirstrun();

    let variation = reuseVariation();
    if (variation === undefined) {
      variation = this.decideVariation();
      if (!(variation in this.config.variations)) {
        // chaijs doesn't think this is an instanceof Error
        // freaktechnik and gregglind debugged for a while.
        // sdk errors might not be 'Errors' or chai is wack, who knows.
        // https://dxr.mozilla.org/mozilla-central/search?q=regexp%3AError%5Cs%3F(%3A%7C%3D)+path%3Aaddon-sdk%2Fsource%2F&redirect=false would list
        throw new Error("Study Error: chosen variation must be in config.variations")
      }
      setVariation(variation);
    }
    this.config.variation = variation;

    this.flags = {
      ineligibleDie: undefined
    };
    this.states = [];
    // all these work, but could be cleaner.  I hate the `bind` stuff.
    this.on(
      "change", (function (newstate) {
        prefSvc.get('shield.debug') && console.log(newstate, this.states);
        this.states.push(newstate);
        emit(this, newstate);  // could have checks here.
      }).bind(this)
    )
    this.on(
      "starting", (function () {
        this.changeState("modifying");
      }).bind(this)
    )
    this.on(
      "maybe-installing", (function () {
        if (!this.isEligible()) {
          this.changeState("ineligible-die");
        } else {
          this.changeState("installed")
        }
      }).bind(this)
    )
    this.on(
      "ineligible-die", (function () {
        try {this.whenIneligible()} catch (err) {/*ok*/} finally { /*ok*/ }
        this.flags.ineligibleDie = true;
        this.report(merge({}, telemetrySubset(this.config), {study_state: "ineligible"}), "shield");
        this.final();
        die();
      }).bind(this)
    )
    this.on(
      "installed", (function () {
        try {this.whenInstalled()} catch (err) {/*ok*/} finally { /*ok*/ }
        this.report(merge({}, telemetrySubset(this.config), {study_state: "install"}), "shield");
        this.changeState("modifying");
      }).bind(this)
    )
    this.on(
      "modifying", (function () {
        var mybranchname = this.variation;
        this.config.variations[mybranchname]();  // do the effect
        this.changeState("running");
      }).bind(this)
    )
    this.on(  // the one 'many'
      "running", (function () {
        // report success
        this.report(merge({}, telemetrySubset(this.config), {study_state: "running"}), "shield");
        this.final();
      }).bind(this)
    )
    this.on(
      "normal-shutdown", (function () {
        this.flags.dying = true;
        this.report(merge({}, telemetrySubset(this.config), {study_state: "shutdown"}), "shield");
        this.final();
      }).bind(this)
    )
    this.on(
      "end-of-study", (function () {
        if (this.flags.expired) {  // safe to call multiple times
          this.final();
          return;
        } else {
          // first time seen.
          this.flags.expired = true;
          try {this.whenComplete()} catch (err) { /*ok*/ } finally { /*ok*/ }
          this.report(merge({}, telemetrySubset(this.config) ,{study_state: "end-of-study"}), "shield");
          // survey for end of study
          let that = this;
          generateTelemetryIdIfNeeded().then(()=>that.showSurvey("end-of-study"));
          try {this.cleanup()} catch (err) {/*ok*/} finally { /*ok*/ }
          this.final();
          die();
        }
      }).bind(this)
    )
    this.on(
      "user-uninstall-disable", (function () {
        if (this.flags.dying) {
          this.final();
          return;
        }
        this.flags.dying = true;
        this.report(merge({}, telemetrySubset(this.config), {study_state: "user-ended-study"}), "shield");
        let that = this;
        generateTelemetryIdIfNeeded().then(()=>that.showSurvey("user-ended-study"));
        try {this.cleanup()} catch (err) {/*ok*/} finally { /*ok*/ }
        this.final();
        die();
      }).bind(this)
    )
  }

  get state () {
    let n = this.states.length;
    return n ? this.states[n-1]  : undefined
  }

  get variation () {
    return this.config.variation;
  }

  get firstrun () {
    return this.config.firstrun;
  }

  dieIfExpired () {
    let xconfig = this.config;
    if (expired(xconfig)) {
      emit(this, "change", "end-of-study");
      return true
    } else {
      return false
    }
  }

  alivenessPulse (last=lastDailyPing) {
    // check for new day, phone home if true.
    let t = Date.now();
    if ((t - last) >= DAY) {
      lastDailyPing = t;
      // phone home
      emit(this,"change","running");
    }
    // check expiration, and die with report if needed
    return this.dieIfExpired();
  }

  changeState (newstate) {
    emit(this,'change', newstate);
  }

  final () {
    emit(this,'final', {});
  }

  startup (reason) {
    // https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Listening_for_load_and_unload

    // check expiry first, before anything, quit and die if so

    // check once, right away, short circuit both install and startup
    // to prevent modifications from happening.
    if (this.dieIfExpired()) return this

    switch (reason) {
      case "install":
        emit(this, "change", "maybe-installing");
        break;

      case "enable":
      case "startup":
      case "upgrade":
      case "downgrade":
        emit(this, "change", "starting");
    }

    if (! this._pulseTimer) this._pulseTimer = setInterval(this.alivenessPulse.bind(this), 5*60*1000 /*5 minutes */)
    return this;
  }

  shutdown (reason) {
    // https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Listening_for_load_and_unload
    if (this.flags.ineligibleDie ||
      this.flags.expired ||
      this.flags.dying
    ) { return this }        // special cases.

    switch (reason) {
      case "uninstall":
      case "disable":
        emit(this, "change", "user-uninstall-disable");
        break;

      // 5. usual end of session.
      case "shutdown":
      case "upgrade":
      case "downgrade":
        emit(this, "change", "normal-shutdown")
        break;
    }
    return this;
  }

  cleanup () {
    // do the simple prefs and simplestorage cleanup
    // extend by extension
    resetShieldPrefs();
    cleanup();
  }

  isEligible () {
    return true;
  }

  whenIneligible () {
    // empty function unless overrided
  }

  whenInstalled () {
    // empty unless overrided
  }

  whenComplete () {
    // when the study expires
  }

  /**
    * equal choice from varations, by default.  override to get unequal
    */
  decideVariation (rng=Math.random()) {
    return chooseVariation(Object.keys(this.config.variations), rng);
  }

  get surveyQueryArgs () {
    return {
      variation: this.variation,
      xname: this.config.name,
      who: userId(),
      updateChannel: Services.appinfo.defaultUpdateChannel,
      fxVersion: Services.appinfo.version,
    }
  }

  showSurvey(reason) {
    let partial = this.config.surveyUrls[reason];

    let queryArgs = this.surveyQueryArgs;
    queryArgs.reason = reason;
    if (partial) {
      let url = survey(partial, queryArgs);
      tabs.open(url);
      return url
    } else {
      return
    }
  }

  report () {  // convenience only
    return report.apply(null, arguments);
  }
}

module.exports = {
  chooseVariation: chooseVariation,
  die: die,
  expired: expired,
  generateTelemetryIdIfNeeded: generateTelemetryIdIfNeeded,
  report: report,
  Reporter: Reporter,
  resetShieldPrefs: resetShieldPrefs,
  Study:  Study,
  cleanup: cleanup,
  survey: survey
}
