const { AddonManager } = require('resource://gre/modules/AddonManager.jsm');
const { ClientID } = require('resource://gre/modules/ClientID.jsm');
const Events = require('sdk/system/events');
const { Services } = require('resource://gre/modules/Services.jsm');
const { storage } = require('sdk/simple-storage');
const {
  TelemetryController
} = require('resource://gre/modules/TelemetryController.jsm');
const {
  TelemetryEnvironment
} = require ('resource://gre/modules/TelemetryEnvironment.jsm');
const { Request } = require('sdk/request');


const EVENT_SEND_METRIC = 'testpilot::send-metric';
const startTime = (Services.startup.getStartupInfo().process);

function makeTimestamp(timestamp) {
  return Math.round((timestamp - startTime) / 1000);
}

function experimentPing(event) {
  const timestamp = new Date();
  const { subject, data } = event;
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    return console.error(`Dropping bad metrics packet: ${err}`);
  }

  AddonManager.getAddonByID(subject, addon => {
    const payload = {
      test: subject,
      version: addon.version,
      timestamp: makeTimestamp(timestamp),
      variants: storage.experimentVariants &&
        subject in storage.experimentVariants
        ? storage.experimentVariants[subject]
        : null,
      payload: parsed
    };
    TelemetryController.submitExternalPing('testpilottest', payload, {
      addClientId: true,
      addEnvironment: true
    });

    // TODO: DRY up this ping centre code here and in lib/Telemetry.
    const environment = TelemetryEnvironment.currentEnvironment;
    const pcPayload = {
      // 'method' is used by testpilot-metrics library.
      // 'event' was used before that library existed.
      event_type: parsed.event || parsed.method,
      client_time: makeTimestamp(parsed.timestamp || timestamp),
      addon_id: subject,
      addon_version: addon.version,
      firefox_version: environment.build.version,
      os_name: environment.system.os.name,
      os_version: environment.system.os.version,
      locale: environment.settings.locale,
      // Note: these two keys are normally inserted by the ping-centre client.
      client_id: ClientID.getCachedClientID(),
      topic: 'testpilot'
    };
    // Add any other extra top-level keys = require(the payload, possibly including
    // 'object' or 'category', among others.
    Object.keys(parsed).forEach(f => {
      // Ignore the keys we've already added to `pcPayload`.
      const ignored = ['event', 'method', 'timestamp'];
      if (!ignored.includes(f)) {
        pcPayload[f] = parsed[f];
      }
    });

    const req = new Request({
      url: 'https://tiles.services.mozilla.com/v3/links/ping-centre',
      contentType: 'application/json',
      content: JSON.stringify(pcPayload)
    });
    req.post();
  });
}

function Experiment() {
  // If the user has @testpilot-addon, it already bound
  // experimentPing to testpilot::send-metric,
  // so we don't need to bind this one
  AddonManager.getAddonByID('@testpilot-addon', addon => {
    if (!addon) {
      Events.on(EVENT_SEND_METRIC, experimentPing);
    }
  });
}

module.exports = Experiment;
