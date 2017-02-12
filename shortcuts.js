const AppConstants = require("resource://gre/modules/AppConstants.jsm");
const { Cc, Ci } = require("chrome");
const {Services} = require("resource://gre/modules/Services.jsm");

const NEW_TAB_TIMEOUT = 300;

function getBrowserURL() {
  return "chrome://browser/content/browser.xul";
}

function whereToOpenLink(e, ignoreButton, ignoreAlt) {
  // This method must treat a null event like a left click without modifier keys (i.e.
  // e = { shiftKey:false, ctrlKey:false, metaKey:false, altKey:false, button:0 })
  // for compatibility purposes.
  if (!e)
    return "current";

  const shift = e.shiftKey;
  const ctrl =  e.ctrlKey;
  const meta =  e.metaKey;
  const alt  =  e.altKey && !ignoreAlt;

  // ignoreButton allows "middle-click paste" to use function without always opening in a new window.
  const middle = !ignoreButton && e.button === 1;
  const middleUsesTabs = Services.prefs.getBoolPref("browser.tabs.opentabfor.middleclick", true);

  // Don't do anything special with right-mouse clicks.  They're probably clicks on context menu items.

  const metaKey = AppConstants.platform === "macosx" ? meta : ctrl;
  if (metaKey || (middle && middleUsesTabs))
    return shift ? "tabshifted" : "tab";

  if (alt && Services.prefs.getBoolPref("browser.altClickSave", false))
    return "save";

  if (shift || (middle && !middleUsesTabs))
    return "window";

  return "current";
}

function BrowserOpenTab(event, win) {
  let where = "tab";
  let relatedToCurrent = false;
  //let doc = event.target.ownerDocument;
  //let win = doc.defaultView;

  if (event) {
    where = whereToOpenLink(event, false, true);

    switch (where) {
    case "tab":
    case "tabshifted":
        // When accel-click or middle-click are used, open the new tab as
        // related to the current tab.
      relatedToCurrent = true;
      break;
    case "current":
      where = "tab";
      break;
    }
  }

  openUILinkIn(win.BROWSER_NEW_TAB_URL, where, { relatedToCurrent }, undefined, undefined, win);
}
function openUILinkIn(url, where, aAllowThirdPartyFixup, aPostData, aReferrerURI, win) {
  let params;

  if (arguments.length === 3 && typeof arguments[2] === "object") {
    params = aAllowThirdPartyFixup;
  } else {
    params = {
      allowThirdPartyFixup: aAllowThirdPartyFixup,
      postData: aPostData,
      referrerURI: aReferrerURI,
      referrerPolicy: Ci.nsIHttpChannel.REFERRER_POLICY_UNSET
    };
  }

  params.fromChrome = true;

  openLinkIn(url, where, params, win);
}

function openLinkIn(url, where, params, win) {
  if (!where || !url)
    return;

  const aAllowThirdPartyFixup = params.allowThirdPartyFixup;
  const aPostData             = params.postData;
  const aCharset              = params.charset;
  const aReferrerURI          = params.referrerURI;
  const aReferrerPolicy       = ("referrerPolicy" in params ?
      params.referrerPolicy : Ci.nsIHttpChannel.REFERRER_POLICY_UNSET);
  let aRelatedToCurrent     = params.relatedToCurrent;
  const aAllowMixedContent    = params.allowMixedContent;
  const aInBackground         = params.inBackground;
  const aDisallowInheritPrincipal = params.disallowInheritPrincipal;
  const aIsPrivate            = params.private;
  const aSkipTabAnimation     = params.skipTabAnimation;
  const aAllowPinnedTabHostChange = !!params.allowPinnedTabHostChange;
  const aNoReferrer           = params.noReferrer;
  const aAllowPopups          = !!params.allowPopups;
  const aUserContextId        = params.userContextId;
  const aIndicateErrorPageLoad = params.indicateErrorPageLoad;
  const aPrincipal            = params.originPrincipal;
  const aForceAboutBlankViewerInCurrent =
      params.forceAboutBlankViewerInCurrent;

  //if (where === "save") {
  //  // TODO(1073187): propagate referrerPolicy.

  //  // ContentClick.jsm passes isContentWindowPrivate for saveURL instead of passing a CPOW initiatingDoc
  //  if ("isContentWindowPrivate" in params) {
  //    saveURL(url, null, null, true, true, aNoReferrer ? null : aReferrerURI, null, params.isContentWindowPrivate);
  //  } else {
  //    if (!aInitiatingDoc) {
  //      Cu.reportError("openUILink/openLinkIn was called with " +
  //        "where === 'save' but without initiatingDoc.  See bug 814264.");
  //      return;
  //    }
  //    saveURL(url, null, null, true, true, aNoReferrer ? null : aReferrerURI, aInitiatingDoc);
  //  }
  //  return;
  //}

  // Establish which window we'll load the link in.
  let w;
  if (where === "current" && params.targetBrowser) {
    w = params.targetBrowser.ownerGlobal;
  } else {
    w = win.top;
  }
  // We don't want to open tabs in popups, so try to find a non-popup window in
  // that case.
  if ((where === "tab" || where === "tabshifted") &&
      w && !w.toolbar.visible) {
    w = win.top;
    aRelatedToCurrent = false;
  }

  if (!w || where === "window") {
    // This propagates to window.arguments.
    const sa = Cc["@mozilla.org/array;1"].
             createInstance(Ci.nsIMutableArray);

    const wuri = Cc["@mozilla.org/supports-string;1"].
               createInstance(Ci.nsISupportsString);
    wuri.data = url;

    let charset = null;
    if (aCharset) {
      charset = Cc["@mozilla.org/supports-string;1"]
                  .createInstance(Ci.nsISupportsString);
      charset.data = "charset=" + aCharset;
    }

    const allowThirdPartyFixupSupports = Cc["@mozilla.org/supports-PRBool;1"].
                                       createInstance(Ci.nsISupportsPRBool);
    allowThirdPartyFixupSupports.data = aAllowThirdPartyFixup;

    let referrerURISupports = null;
    if (aReferrerURI && !aNoReferrer) {
      referrerURISupports = Cc["@mozilla.org/supports-string;1"].
                            createInstance(Ci.nsISupportsString);
      referrerURISupports.data = aReferrerURI.spec;
    }

    const referrerPolicySupports = Cc["@mozilla.org/supports-PRUint32;1"].
                                 createInstance(Ci.nsISupportsPRUint32);
    referrerPolicySupports.data = aReferrerPolicy;

    const userContextIdSupports = Cc["@mozilla.org/supports-PRUint32;1"].
                                 createInstance(Ci.nsISupportsPRUint32);
    userContextIdSupports.data = aUserContextId;

    sa.appendElement(wuri, /* weak =*/ false);
    sa.appendElement(charset, /* weak =*/ false);
    sa.appendElement(referrerURISupports, /* weak =*/ false);
    sa.appendElement(aPostData, /* weak =*/ false);
    sa.appendElement(allowThirdPartyFixupSupports, /* weak =*/ false);
    sa.appendElement(referrerPolicySupports, /* weak =*/ false);
    sa.appendElement(userContextIdSupports, /* weak =*/ false);
    sa.appendElement(aPrincipal, /* weak =*/ false);

    let features = "chrome,dialog=no,all";
    if (aIsPrivate) {
      features += ",private";
    }

    Services.ww.openWindow(w || win, getBrowserURL(), null, features, sa);
    return;
  }

  // We're now committed to loading the link in an existing browser window.

  // Raise the target window before loading the URI, since loading it may
  // result in a new frontmost window (e.g. "javascript:window.open('');").
  w.focus();

  let targetBrowser;
  let loadInBackground;
  let uriObj;

  if (where === "current") {
    targetBrowser = params.targetBrowser || w.gBrowser.selectedBrowser;
    loadInBackground = false;

    try {
      uriObj = Services.io.newURI(url);
    } catch (e) {
      //blank
    }

    if (w.gBrowser.getTabForBrowser(targetBrowser).pinned &&
        !aAllowPinnedTabHostChange) {
      try {
        // nsIURI.host can throw for non-nsStandardURL nsIURIs.
        if (!uriObj || (!uriObj.schemeIs("javascript") &&
                        targetBrowser.currentURI.host !== uriObj.host)) {
          where = "tab";
          loadInBackground = false;
        }
      } catch (err) {
        where = "tab";
        loadInBackground = false;
      }
    }
  } else {
    // 'where' is "tab" or "tabshifted", so we'll load the link in a new tab.
    loadInBackground = aInBackground;
    if (loadInBackground === null) {
      loadInBackground = true;
    }
  }

  let flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
  let tabUsedForLoad;
  switch (where) {
  case "current":

    if (aAllowThirdPartyFixup) {
      flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_THIRD_PARTY_FIXUP;
      flags |= Ci.nsIWebNavigation.LOAD_FLAGS_FIXUP_SCHEME_TYPOS;
    }

    // LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL isn't supported for javascript URIs,
    // i.e. it causes them not to load at all. Callers should strip
    // "javascript:" from pasted strings to protect users from malicious URIs
    // (see stripUnsafeProtocolOnPaste).
    if (aDisallowInheritPrincipal && !(uriObj && uriObj.schemeIs("javascript"))) {
      flags |= Ci.nsIWebNavigation.LOAD_FLAGS_DISALLOW_INHERIT_PRINCIPAL;
    }

    if (aAllowPopups) {
      flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_POPUPS;
    }
    if (aIndicateErrorPageLoad) {
      flags |= Ci.nsIWebNavigation.LOAD_FLAGS_ERROR_LOAD_CHANGES_RV;
    }

    if (aForceAboutBlankViewerInCurrent) {
      targetBrowser.createAboutBlankContentViewer(aPrincipal);
    }

    targetBrowser.loadURIWithFlags(url, {
      triggeringPrincipal: aPrincipal,
      flags,
      referrerURI: aNoReferrer ? null : aReferrerURI,
      referrerPolicy: aReferrerPolicy,
      postData: aPostData,
      userContextId: aUserContextId
    });
    break;
  case "tabshifted":
    loadInBackground = !loadInBackground;
    // fall through
  case "tab":
    tabUsedForLoad = w.gBrowser.loadOneTab(url, {
      referrerURI: aReferrerURI,
      referrerPolicy: aReferrerPolicy,
      charset: aCharset,
      postData: aPostData,
      inBackground: loadInBackground,
      allowThirdPartyFixup: aAllowThirdPartyFixup,
      relatedToCurrent: aRelatedToCurrent,
      skipAnimation: aSkipTabAnimation,
      allowMixedContent: aAllowMixedContent,
      noReferrer: aNoReferrer,
      userContextId: aUserContextId,
      originPrincipal: aPrincipal,
      triggeringPrincipal: aPrincipal
    });
    targetBrowser = tabUsedForLoad.linkedBrowser;
    break;
  }

  // Focus the content, but only if the browser used for the load is selected.
  if (targetBrowser === w.gBrowser.selectedBrowser) {
    targetBrowser.focus();
  }

  if (!loadInBackground && w.isBlankPageURL(url)) {
    w.focusAndSelectUrlBar();
  }
}

const NewTabShortcut = function (window) {
  this.init(window);
};

NewTabShortcut.prototype = {
  init(window) {
    this._window = window;
    const elm = this._window.document.getElementById("key_newNavigatorTab");

    this._key = elm.getAttribute("key");

    this._timeout = NEW_TAB_TIMEOUT;

    this._menupopup = this._window.document.getElementById("alltabs-popup");

    this._window.addEventListener("keydown", this);
    this._window.addEventListener("keyup", this);
  },

  uninint() {
    this._window.removeEventListener("keydown", this);
    this._window.removeEventListener("keyup", this);
  },

  handleEvent(event) {
    const accelKey = AppConstants.platform === "macosx" ? "metaKey" : "ctrlKey";
    if (event.key !== this._key || !event[accelKey]) {
      this._clearTimer();
      return;
    }

    // Lets return early if the userContext is disabled
    if (!Services.prefs.getBoolPref("privacy.userContext.enabled")) {
      return false;
    }

    // Let's see if this is a long press.
    if (event.type === "keydown" && !this._timer) {
      if (event.shiftKey) {
        return;
      }
      this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this._timer.initWithCallback(this, this._timeout, this._timer.TYPE_ONE_SHOT);
    } else if (event.type === "keyup") {
      // Timeout has not expired yet
      if (this._timer) {
        this._clearTimer();
        BrowserOpenTab(event, this._window);

        return false;
      }
    }

    // We suppress the default behavior of accel+T.
    event.preventDefault();
  },

  _clearTimer() {
    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }
  },

  // Timer expired
  notify() {
    this._clearTimer();
    this._openContainerMenu();
  },

  _openContainerMenu() {
    const tabbrowser = this._window.document.getElementById("tabbrowser-tabs");
    const newTabOverflowButton = this._window.document.getElementById("new-tab-button");
    const newTabButton = this._window.document.getAnonymousElementByAttribute(tabbrowser, "anonid", "tabs-newtab-button");

    if (tabbrowser.getAttribute("overflow") === "true") {
      this._window.showPopup(newTabOverflowButton);
    } else {
      this._window.showPopup(newTabButton);
    }
  }
};

exports.NewTabShortcut = NewTabShortcut;
