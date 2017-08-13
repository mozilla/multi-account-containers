"use strict";

const PREFS = [
  {
    name: "privacy.userContext.enabled",
    value: true,
    type: "bool"
  },
  {
    name: "privacy.userContext.longPressBehavior",
    value: 2,
    type: "int"
  },
  {
    name: "privacy.userContext.ui.enabled",
    value: true, // Post web ext we will be setting this true
    type: "bool"
  },
  {
    name: "privacy.usercontext.about_newtab_segregation.enabled",
    value: true,
    type: "bool"
  },
];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
const { TextDecoder, TextEncoder } = Cu.import('resource://gre/modules/commonjs/toolkit/loader.js', {});

XPCOMUtils.defineLazyModuleGetter(this, "OS",
                                  "resource://gre/modules/osfile.jsm");

const JETPACK_DIR_BASENAME = "jetpack";
const EXTENSION_ID = "@testpilot-containers";

function filename() {
  let storeFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  storeFile.append(JETPACK_DIR_BASENAME);
  storeFile.append(EXTENSION_ID);
  storeFile.append("simple-storage");
  storeFile.append("store.json");
  return storeFile.path;
}

async function getConfig() {
  const bytes = await OS.File.read(filename());
  let raw = new TextDecoder().decode(bytes) || "";
  let savedConfig = {savedConfiguration: {}};
  if (raw) {
    savedConfig = JSON.parse(raw);
  }

  return savedConfig;
}

async function initConfig() {
  const savedConfig = await getConfig();
  savedConfig.savedConfiguration.version = 2;
  if (!("prefs" in savedConfig.savedConfiguration)) {
    savedConfig.savedConfiguration.prefs = {};
    PREFS.forEach((pref) => {
      if ("int" === pref.type) {
        savedConfig.savedConfiguration.prefs[pref.name] = Services.prefs.getIntPref(pref.name, pref.name);
      } else {
        savedConfig.savedConfiguration.prefs[pref.name] = Services.prefs.getBoolPref(pref.name, pref.value);
      }
    });
  }
  const serialized = JSON.stringify(savedConfig);
  let bytes = new TextEncoder().encode(serialized) || "";
  await OS.File.writeAtomic(filename(), bytes, { });
}

function setPrefs() {
  PREFS.forEach((pref) => {
    if ("int" === pref.type) {
      Services.prefs.setIntPref(pref.name, pref.value);
    } else {
      Services.prefs.setBoolPref(pref.name, pref.value);
    }
  });
}

async function install() {
  await initConfig();
  setPrefs();
}

async function uninstall(aData, aReason) {
  if (aReason == ADDON_UNINSTALL
      || aReason == ADDON_DISABLE) {
    const config = await getConfig();
    const storedPrefs = config.savedConfiguration.prefs;
    PREFS.forEach((pref) => {
      if (pref.name in storedPrefs) {
        if ("int" === pref.type) {
          Services.prefs.setIntPref(pref.name, storedPrefs[pref.name]);
        } else {
          Services.prefs.setBoolPref(pref.name, storedPrefs[pref.name]);
        }
      }
    });
  }
}

function startup({webExtension}) {
  // Reset prefs that may have changed, or are legacy
  setPrefs();
  // Start the embedded webextension.
  webExtension.startup().then(api => {
  });
}

function shutdown(data) {
}

