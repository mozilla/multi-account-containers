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
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cc = Components.classes;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
const { TextDecoder, TextEncoder } = Cu.import("resource://gre/modules/commonjs/toolkit/loader.js", {});

XPCOMUtils.defineLazyModuleGetter(this, "OS",
                                  "resource://gre/modules/osfile.jsm");

const JETPACK_DIR_BASENAME = "jetpack";
const EXTENSION_ID = "@testpilot-containers";

function loadStyles(resourceURI) {
  const styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"]
                            .getService(Ci.nsIStyleSheetService);
  const styleURI = styleSheet(resourceURI);
  const sheetType = styleSheetService.AGENT_SHEET;
  styleSheetService.loadAndRegisterSheet(styleURI, sheetType);
}

function styleSheet(resourceURI) {
  return Services.io.newURI("data/usercontext.css", null, resourceURI);
}

function unloadStyles(resourceURI) {
  const styleURI = styleSheet(resourceURI);
  const styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"]
                  .getService(Ci.nsIStyleSheetService);
  const sheetType = styleSheetService.AGENT_SHEET;
  if (styleSheetService.sheetRegistered(styleURI, sheetType)) {
    styleSheetService.unregisterSheet(styleURI, sheetType);
  }
}

function filename() {
  const storeFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  storeFile.append(JETPACK_DIR_BASENAME);
  storeFile.append(EXTENSION_ID);
  storeFile.append("simple-storage");
  storeFile.append("store.json");
  return storeFile.path;
}

async function getConfig() {
  const bytes = await OS.File.read(filename());
  const raw = new TextDecoder().decode(bytes) || "";
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
  const bytes = new TextEncoder().encode(serialized) || "";
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

// eslint-disable-next-line no-unused-vars
async function install() {
  await initConfig();
  setPrefs();
}

// eslint-disable-next-line no-unused-vars
async function uninstall(aData, aReason) {
  if (aReason === ADDON_UNINSTALL
      || aReason === ADDON_DISABLE) {
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

// eslint-disable-next-line no-unused-vars
function startup({webExtension, resourceURI}) {
  const version = Services.appinfo.version;
  const versionMatch = version.match(/^([0-9]+)\./)[1];
  if (versionMatch === "55"
      || versionMatch === "56") {
    loadStyles(resourceURI);
  }
  // Reset prefs that may have changed, or are legacy
  setPrefs();
  // Start the embedded webextension.
  webExtension.startup();
}

// eslint-disable-next-line no-unused-vars
function shutdown({resourceURI}) {
  unloadStyles(resourceURI);
}

