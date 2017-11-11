"use strict";

const PREFS = [
  {
    name: "privacy.userContext.enabled",
    value: true,
    type: "bool",
    default: false
  },
  {
    name: "privacy.userContext.longPressBehavior",
    value: 2,
    type: "int",
    default: 0
  },
  {
    name: "privacy.userContext.ui.enabled",
    value: true, // Post web ext we will be setting this true
    type: "bool",
    default: true
  },
  {
    name: "privacy.usercontext.about_newtab_segregation.enabled",
    value: true,
    type: "bool",
    default: false
  },
];
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cc = Components.classes;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["TextEncoder", "TextDecoder"]);

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

async function makeFilepath() {
  const storeFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
  storeFile.append(JETPACK_DIR_BASENAME);
  await OS.File.makeDir(storeFile.path, { ignoreExisting: true });
  storeFile.append(EXTENSION_ID);
  await OS.File.makeDir(storeFile.path, { ignoreExisting: true });
  storeFile.append("simple-storage");
  await OS.File.makeDir(storeFile.path, { ignoreExisting: true });
}

async function getConfig() {
  let savedConfig = {savedConfiguration: {}};
  try {
    const bytes = await OS.File.read(filename());
    const raw = new TextDecoder().decode(bytes) || "";
    if (raw) {
      savedConfig = JSON.parse(raw);
    }
  } catch (e) {
    // ignore file read errors, sometimes they happen and I'm not sure if we can fix
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
        savedConfig.savedConfiguration.prefs[pref.name] = Services.prefs.getIntPref(pref.name);
      } else {
        savedConfig.savedConfiguration.prefs[pref.name] = Services.prefs.getBoolPref(pref.name);
      }
    });
  }
  const serialized = JSON.stringify(savedConfig);
  const bytes = new TextEncoder().encode(serialized) || "";
  await makeFilepath();
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
    const storedPrefs = config.savedConfiguration.prefs || {};
    PREFS.forEach((pref) => {
      let value = pref.default;
      if (pref.name in storedPrefs) {
        value = storedPrefs[pref.name];
      }
      if ("int" === pref.type) {
        Services.prefs.setIntPref(pref.name, value);
      } else {
        Services.prefs.setBoolPref(pref.name, value);
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
  install();
  // Start the embedded webextension.
  webExtension.startup();
}

// eslint-disable-next-line no-unused-vars
function shutdown({resourceURI}) {
  unloadStyles(resourceURI);
}

