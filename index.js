/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const DEFAULT_TAB = "about:newtab";
const LOOKUP_KEY = "$ref";

const INCOMPATIBLE_ADDON_IDS = [
  "pulse@mozilla.com",
  "snoozetabs@mozilla.com",
  "jid1-NeEaf3sAHdKHPA@jetpack" // PageShot
];

const IDENTITY_COLORS = [
 { name: "blue", color: "#00a7e0" },
 { name: "turquoise", color: "#01bdad" },
 { name: "green", color: "#7dc14c" },
 { name: "yellow", color: "#ffcb00" },
 { name: "orange", color: "#f89c24" },
 { name: "red", color: "#d92215" },
 { name: "pink", color: "#ee5195" },
 { name: "purple", color: "#7a2f7a" },
];

const IDENTITY_ICONS = [
  { name: "fingerprint", image: "chrome://browser/skin/usercontext/personal.svg" },
  { name: "briefcase", image: "chrome://browser/skin/usercontext/work.svg" },
  { name: "dollar", image: "chrome://browser/skin/usercontext/banking.svg" },
  { name: "cart", image: "chrome://browser/skin/usercontext/shopping.svg" },
  // All of these do not exist in gecko
  { name: "gift", image: "gift" },
  { name: "vacation", image: "vacation" },
  { name: "food", image: "food" },
  { name: "fruit", image: "fruit" },
  { name: "pet", image: "pet" },
  { name: "tree", image: "tree" },
  { name: "chill", image: "chill" },
  { name: "circle", image: "circle" },
];

const IDENTITY_COLORS_STANDARD = [
  "blue", "orange", "green", "pink",
];

const IDENTITY_ICONS_STANDARD = [
  "fingerprint", "briefcase", "dollar", "cart",
];

const PREFS = [
  [ "privacy.userContext.enabled", true ],
  [ "privacy.userContext.ui.enabled", false ],
  [ "privacy.usercontext.about_newtab_segregation.enabled", true ],
];

const { AddonManager } = require("resource://gre/modules/AddonManager.jsm");
const { attachTo, detachFrom } = require("sdk/content/mod");
const { Cu } = require("chrome");
const { ContextualIdentityService } = require("resource://gre/modules/ContextualIdentityService.jsm");
const { getFavicon } = require("sdk/places/favicon");
const { LightweightThemeManager } = Cu.import("resource://gre/modules/LightweightThemeManager.jsm", {});
const Metrics = require("./testpilot-metrics");
const { modelFor } = require("sdk/model/core");
const prefService = require("sdk/preferences/service");
const self = require("sdk/self");
const { Services }  = require("resource://gre/modules/Services.jsm");
const ss = require("sdk/simple-storage");
const { study } = require("./study");
const { Style } = require("sdk/stylesheet/style");
const tabs = require("sdk/tabs");
const tabsUtils = require("sdk/tabs/utils");
const uuid = require("sdk/util/uuid");
const { viewFor } = require("sdk/view/core");
const webExtension = require("sdk/webextension");
const windows = require("sdk/windows");
const windowUtils = require("sdk/window/utils");

Cu.import("resource:///modules/CustomizableUI.jsm");
Cu.import("resource:///modules/CustomizableWidgets.jsm");
Cu.import("resource:///modules/sessionstore/SessionStore.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// ContextualIdentityProxy

const ContextualIdentityProxy = {
  getIdentities() {
    let response;
    if ("getPublicIdentities" in ContextualIdentityService) {
      response = ContextualIdentityService.getPublicIdentities();
    } else {
      response = ContextualIdentityService.getIdentities();
    }

    return response.map((identity) => {
      return this._convert(identity);
    });
  },

  getIdentityFromId(userContextId) {
    let response;
    if ("getPublicIdentityFromId" in ContextualIdentityService) {
      response = ContextualIdentityService.getPublicIdentityFromId(userContextId);
    } else {
      response = ContextualIdentityService.getIdentityFromId(userContextId);
    }
    if (response) {
      return this._convert(response);
    }
    return response;
  },

  _convert(identity) {
    return {
      name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
      icon: identity.icon,
      color: identity.color,
      userContextId: identity.userContextId,
    };
  },
};

// ----------------------------------------------------------------------------
// ContainerService

const ContainerService = {
  _identitiesState: {},
  _windowMap: new Map(),
  _containerWasEnabled: false,
  _onBackgroundConnectCallback: null,

  async init(installation, reason) {
    // If we are just been installed, we must store some information for the
    // uninstallation. This object contains also a version number, in case we
    // need to implement a migration in the future.
    // In 1.1.1 and less we deleted savedConfiguration on upgrade so we need to rebuild
    if (!("savedConfiguration" in ss.storage) ||
        !("prefs" in ss.storage.savedConfiguration) ||
        (installation && reason !== "upgrade")) {
      let preInstalledIdentities = []; // eslint-disable-line prefer-const
      ContextualIdentityProxy.getIdentities().forEach(identity => {
        preInstalledIdentities.push(identity.userContextId);
      });

      const object = {
        version: 1,
        prefs: {},
        metricsUUID: uuid.uuid().toString(),
        preInstalledIdentities: preInstalledIdentities
      };

      PREFS.forEach(pref => {
        object.prefs[pref[0]] = prefService.get(pref[0]);
      });

      ss.storage.savedConfiguration = object;

      if (prefService.get("privacy.userContext.enabled") !== true) {
        // Maybe rename the Banking container.
        const identity = ContextualIdentityProxy.getIdentityFromId(3);
        if (identity && identity.l10nID === "userContextBanking.label") {
          ContextualIdentityService.update(identity.userContextId,
                                         "Finance",
                                         identity.icon,
                                         identity.color);
        }

        // Let's create the default containers in case there are none.
        if (ss.storage.savedConfiguration.preInstalledIdentities.length === 0) {
          // Note: we have to create them in this way because there is no way to
          // reuse the same ID and the localized strings.
          ContextualIdentityService.create("Personal", "fingerprint", "blue");
          ContextualIdentityService.create("Work", "briefcase", "orange");
          ContextualIdentityService.create("Finance", "dollar", "green");
          ContextualIdentityService.create("Shopping", "cart", "pink");
        }
      }
    }

    // TOCHECK should this run on all code
    ContextualIdentityProxy.getIdentities().forEach(identity => {
      const newIcon = this._fromIconToName(identity.icon);
      const newColor = this._fromColorToName(identity.color);
      if (newIcon !== identity.icon || newColor !== identity.color) {
        ContextualIdentityService.update(identity.userContextId,
                                       ContextualIdentityService.getUserContextLabel(identity.userContextId),
                                       newIcon,
                                       newColor);
      }
    });

    // Let's see if containers were enabled before this addon.
    this._containerWasEnabled =
      ss.storage.savedConfiguration.prefs["privacy.userContext.enabled"];

    // Enabling preferences

    PREFS.forEach((pref) => {
      prefService.set(pref[0], pref[1]);
    });

    this._metricsUUID = ss.storage.savedConfiguration.metricsUUID;

    // Disabling the customizable container panel.
    CustomizableUI.destroyWidget("containers-panelmenu");

    // Message routing

    // only these methods are allowed. We have a 1:1 mapping between messages
    // and methods. These methods must return a promise.
    const methods = [
      "hideTabs",
      "showTabs",
      "sortTabs",
      "getTabs",
      "showTab",
      "moveTabsToWindow",
      "queryIdentitiesState",
      "getIdentity",
      "getPreference",
      "sendTelemetryPayload",
      "getTheme",
      "getShieldStudyVariation",
      "refreshNeeded",
      "forgetIdentityAndRefresh",
      "checkIncompatibleAddons"
    ];

    // Map of identities.
    ContextualIdentityProxy.getIdentities().forEach(identity => {
      this._remapTabsIfMissing(identity.userContextId);
    });

    // Let's restore the hidden tabs from the previous session.
    if (prefService.get("browser.startup.page") === 3 &&
        "identitiesData" in ss.storage) {
      ContextualIdentityProxy.getIdentities().forEach(identity => {
        if (identity.userContextId in ss.storage.identitiesData &&
            "hiddenTabs" in ss.storage.identitiesData[identity.userContextId]) {
          this._identitiesState[identity.userContextId].hiddenTabs =
            ss.storage.identitiesData[identity.userContextId].hiddenTabs;
        }
      });
    }

    tabs.on("open", tab => {
      this._hideAllPanels();
      this._restyleTab(tab);
      this._remapTab(tab);
    });

    tabs.on("close", tab => {
      this._hideAllPanels();
      this._remapTab(tab);
    });

    tabs.on("activate", tab => {
      this._hideAllPanels();
      this._restyleActiveTab(tab).catch(() => {});
      this._configureActiveWindows();
      this._remapTab(tab);
    });

    // Modify CSS and other stuff for each window.

    this._configureWindows().catch(() => {});

    windows.browserWindows.on("open", window => {
      this._configureWindow(viewFor(window)).catch(() => {});
    });

    windows.browserWindows.on("close", window => {
      this.closeWindow(viewFor(window));
    });

    // WebExtension startup

    try {
      const api = await webExtension.startup();
      api.browser.runtime.onMessage.addListener((message, sender, sendReply) => {
        if ("method" in message && methods.indexOf(message.method) !== -1) {
          sendReply(this[message.method](message));
        }
      });

      this.registerBackgroundConnection(api);
    } catch (e) {
      throw new Error("WebExtension startup failed. Unable to continue.");
    }

    this._sendEvent = new Metrics({
      type: "sdk",
      id: self.id,
      version: self.version
    }).sendEvent;

    // Begin-Of-Hack
    ContextualIdentityService.workaroundForCookieManager = function(method, userContextId) {
      let identity = method.call(ContextualIdentityService, userContextId);
      if (!identity && userContextId) {
        identity = {
          userContextId,
          icon: "",
          color: "",
          name: "Pending to be deleted",
          public: true,
        };
      }

      return identity;
    };

    if (!this._oldGetIdentityFromId) {
      this._oldGetIdentityFromId = ContextualIdentityService.getIdentityFromId;
    }
    ContextualIdentityService.getIdentityFromId = function(userContextId) {
      return this.workaroundForCookieManager(ContainerService._oldGetIdentityFromId, userContextId);
    };

    if ("getPublicIdentityFromId" in ContextualIdentityService) {
      if (!this._oldGetPublicIdentityFromId) {
        this._oldGetPublicIdentityFromId = ContextualIdentityService.getPublicIdentityFromId;
      }
      ContextualIdentityService.getPublicIdentityFromId = function(userContextId) {
        return this.workaroundForCookieManager(ContainerService._oldGetPublicIdentityFromId, userContextId);
      };
    }
    // End-Of-Hack

    Services.obs.addObserver(this, "lightweight-theme-changed", false);

    if (self.id === "@shield-study-containers") {
      study.startup(reason);
      this.shieldStudyVariation = study.variation;
    }
  },

  registerBackgroundConnection(api) {
    // This is only used for theme notifications and new tab
    api.browser.runtime.onConnect.addListener((port) => {
      this._onBackgroundConnectCallback = (message, topic) => {
        port.postMessage({
          type: topic,
          message
        });
      };
    });
  },

  triggerBackgroundCallback(message, topic) {
    if (this._onBackgroundConnectCallback) {
      this._onBackgroundConnectCallback(message, topic);
    }
  },

  async observe(subject, topic) {
    if (topic === "lightweight-theme-changed") {
      try {
        const theme = await this.getTheme();
        this.triggerBackgroundCallback(theme, topic);
      } catch (e) {
        throw new Error("Unable to get theme");
      }
    }
  },

  getTheme() {
    const defaultTheme = "firefox-compact-light@mozilla.org";
    return new Promise(function (resolve) {
      let theme = defaultTheme;
      if (LightweightThemeManager.currentTheme && LightweightThemeManager.currentTheme.id) {
        theme = LightweightThemeManager.currentTheme.id;
      }
      resolve(theme);
    });
  },

  getShieldStudyVariation() {
    return this.shieldStudyVariation;
  },

  // utility methods

  _containerTabCount(userContextId) {
    // Returns the total of open and hidden tabs with this userContextId
    let containerTabsCount = 0;
    containerTabsCount += this._identitiesState[userContextId].openTabs;
    containerTabsCount += this._identitiesState[userContextId].hiddenTabs.length;
    return containerTabsCount;
  },

  _totalContainerTabsCount() {
    // Returns the number of total open tabs across ALL containers
    let totalContainerTabsCount = 0;
    for (const userContextId in this._identitiesState) {
      totalContainerTabsCount += this._identitiesState[userContextId].openTabs;
    }
    return totalContainerTabsCount;
  },

  _totalNonContainerTabsCount() {
    // Returns the number of open tabs NOT IN a container
    let totalNonContainerTabsCount = 0;
    for (const tab of tabs) {
      if (this._getUserContextIdFromTab(tab) === 0) {
        ++totalNonContainerTabsCount;
      }
    }
    return totalNonContainerTabsCount;
  },

  _containersCounts() {
    let containersCounts = { // eslint-disable-line prefer-const
      "shown": 0,
      "hidden": 0,
      "total": 0
    };
    for (const userContextId in this._identitiesState) {
      if (this._identitiesState[userContextId].openTabs > 0) {
        ++containersCounts.shown;
        ++containersCounts.total;
        continue;
      } else if (this._identitiesState[userContextId].hiddenTabs.length > 0) {
        ++containersCounts.hidden;
        ++containersCounts.total;
        continue;
      }
    }
    return containersCounts;
  },

  // In FF 50-51, the icon is the full path, in 52 and following
  // releases, we have IDs to be used with a svg file. In this function
  // we map URLs to svg IDs.

  // Helper methods for converting colors to names and names to colors.

  _fromNameToColor(name) {
    return this._fromNameOrColor(name, "color");
  },

  _fromColorToName(color) {
    return this._fromNameOrColor(color, "name");
  },

  _fromNameOrColor(what, attribute) {
    for (let color of IDENTITY_COLORS) { // eslint-disable-line prefer-const
      if (what === color.color || what === color.name) {
        return color[attribute];
      }
    }
    return "";
  },

  // Helper methods for converting icons to names and names to icons.

  _fromIconToName(icon) {
    return this._fromNameOrIcon(icon, "name", "circle");
  },

  _fromNameOrIcon(what, attribute, defaultValue) {
    for (let icon of IDENTITY_ICONS) { // eslint-disable-line prefer-const
      if (what === icon.image || what === icon.name) {
        return icon[attribute];
      }
    }
    return defaultValue;
  },

  // Tab Helpers

  _getUserContextIdFromTab(tab) {
    return parseInt(viewFor(tab).getAttribute("usercontextid") || 0, 10);
  },

  async _createTabObject(tab) {
    let url;
    try {
      url = await getFavicon(tab.url);
    } catch (e) {
      url = "";
    }
    return {
      title: tab.title,
      url: tab.url,
      favicon: url,
      id: tab.id,
      active: true,
      pinned: tabsUtils.isPinned(viewFor(tab))
    };
  },

  _matchTabsByContainer(userContextId) {
    const matchedTabs = [];
    for (const tab of tabs) {
      if (userContextId === this._getUserContextIdFromTab(tab)) {
        matchedTabs.push(tab);
      }
    }
    return matchedTabs;
  },

  _createIdentityState() {
    return {
      hiddenTabs: [],
      openTabs: 0
    };
  },

  _remapTabsIfMissing(userContextId) {
    // We already know this userContextId.
    if (userContextId in this._identitiesState) {
      return;
    }

    this._identitiesState[userContextId] = this._createIdentityState();
    this._remapTabsFromUserContextId(userContextId);
  },

  _remapTabsFromUserContextId(userContextId) {
    this._identitiesState[userContextId].openTabs = this._matchTabsByContainer(userContextId).length;
  },

  _remapTab(tab) {
    const userContextId = this._getUserContextIdFromTab(tab);
    if (userContextId) {
      this._remapTabsFromUserContextId(userContextId);
    }
  },

  _isKnownContainer(userContextId) {
    return userContextId in this._identitiesState;
  },

  async _closeTabs(tabsToClose) {
    // We create a new tab only if the current operation closes all the
    // existing ones.
    if (tabs.length === tabsToClose.length) {
      await this.openTab({});
    }

    for (const tab of tabsToClose) {
      // after .close() window is null. Let's take it now.
      const window = viewFor(tab.window);

      tab.close();

      // forget about this tab. 0 is the index of the forgotten tab and 0
      // means the last one.
      try {
        SessionStore.forgetClosedTab(window, 0);
      } catch (e) {} // eslint-disable-line no-empty
    }
  },

  _recentBrowserWindow() {
    const browserWin = windowUtils.getMostRecentBrowserWindow();

    // This should not really happen.
    if (!browserWin || !browserWin.gBrowser) {
      return Promise.resolve(null);
    }

    return Promise.resolve(browserWin);
  },

  _syncTabs() {
    // Let's store all what we have.
    ss.storage.identitiesData = this._identitiesState;
  },

  sendTelemetryPayload(args = {}) {
    // when pings come from popup, delete "method" prop
    delete args.method;
    let payload = { // eslint-disable-line prefer-const
      "uuid": this._metricsUUID
    };
    Object.assign(payload, args);

    /* This is to masage the data whilst it is still active in the SDK side */
    const containersCounts = this._containersCounts();
    Object.keys(payload).forEach((keyName) => {
      let value = payload[keyName];
      if (value === LOOKUP_KEY) {
        switch (keyName) {
        case "clickedContainerTabCount":
          value = this._containerTabCount(payload.userContextId);
          break;
        case "shownContainersCount":
          value = containersCounts.shown;
          break;
        case "hiddenContainersCount":
          value = containersCounts.hidden;
          break;
        case "totalContainersCount":
          value = containersCounts.total;
          break;
        }
      }
      payload[keyName] = value;
    });

    this._sendEvent(payload);
  },

  checkIncompatibleAddons() {
    return new Promise(resolve => {
      AddonManager.getAddonsByIDs(INCOMPATIBLE_ADDON_IDS, (addons) => {
        addons = addons.filter((a) => a && a.isActive);
        const incompatibleAddons = addons.length !== 0;
        if (incompatibleAddons) {
          this.sendTelemetryPayload({
            "event": "incompatible-addons-detected"
          });
        }
        resolve(incompatibleAddons);
      });
    });
  },

  // Tabs management

  async hideTabs(args) {
    if (!("userContextId" in args)) {
      return new Error("hideTabs must be called with userContextId argument.");
    }

    this._remapTabsIfMissing(args.userContextId);
    if (!this._isKnownContainer(args.userContextId)) {
      return null;
    }

    this.sendTelemetryPayload({
      "event": "hide-tabs",
      "userContextId": args.userContextId,
      "clickedContainerTabCount": LOOKUP_KEY,
      "shownContainersCount": LOOKUP_KEY,
      "hiddenContainersCount": LOOKUP_KEY,
      "totalContainersCount": LOOKUP_KEY
    });

    const tabsToClose = [];

    const tabObjects = await Promise.all(this._matchTabsByContainer(args.userContextId).map((tab) => {
      tabsToClose.push(tab);
      return this._createTabObject(tab);
    }));

    tabObjects.forEach((object) => {
      // This tab is going to be closed. Let's mark this tabObject as
      // non-active.
      object.active = false;

      this._identitiesState[args.userContextId].hiddenTabs.push(object);
    });

    await this._closeTabs(tabsToClose);

    return this._syncTabs();
  },

  async showTabs(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("showTabs must be called with userContextId argument.");
    }

    this._remapTabsIfMissing(args.userContextId);
    if (!this._isKnownContainer(args.userContextId)) {
      return Promise.resolve(null);
    }

    this.sendTelemetryPayload({
      "event": "show-tabs",
      "userContextId": args.userContextId,
      "clickedContainerTabCount": LOOKUP_KEY,
      "shownContainersCount": LOOKUP_KEY,
      "hiddenContainersCount": LOOKUP_KEY,
      "totalContainersCount": LOOKUP_KEY
    });

    const promises = [];

    const hiddenTabs = this._identitiesState[args.userContextId].hiddenTabs;
    this._identitiesState[args.userContextId].hiddenTabs = [];

    for (let object of hiddenTabs) { // eslint-disable-line prefer-const
      promises.push(this.openTab({
        userContextId: args.userContextId,
        url: object.url,
        nofocus: args.nofocus || false,
        pinned: object.pinned,
      }));
    }

    this._identitiesState[args.userContextId].hiddenTabs = [];

    await Promise.all(promises);
    return this._syncTabs();
  },

  sortTabs() {
    const containersCounts = this._containersCounts();
    this.sendTelemetryPayload({
      "event": "sort-tabs",
      "shownContainersCount": containersCounts.shown,
      "totalContainerTabsCount": this._totalContainerTabsCount(),
      "totalNonContainerTabsCount": this._totalNonContainerTabsCount()
    });
    return new Promise(resolve => {
      for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
        // First the pinned tabs, then the normal ones.
        this._sortTabsInternal(window, true);
        this._sortTabsInternal(window, false);
      }
      resolve(null);
    });
  },

  _sortTabsInternal(window, pinnedTabs) {
    // From model to XUL window.
    const xulWindow = viewFor(window);

    const tabs = tabsUtils.getTabs(xulWindow);
    let pos = 0;

    // Let's collect UCIs/tabs for this window.
    const map = new Map;
    for (const tab of tabs) {
      if (pinnedTabs && !tabsUtils.isPinned(tab)) {
        // We don't have, or we already handled all the pinned tabs.
        break;
      }

      if (!pinnedTabs && tabsUtils.isPinned(tab)) {
        // pinned tabs must be consider as taken positions.
        ++pos;
        continue;
      }

      const userContextId = this._getUserContextIdFromTab(tab);
      if (!map.has(userContextId)) {
        map.set(userContextId, []);
      }
      map.get(userContextId).push(tab);
    }

    // Let's sort the map.
    const sortMap = new Map([...map.entries()].sort((a, b) => a[0] > b[0]));

    // Let's move tabs.
    sortMap.forEach(tabs => {
      for (const tab of tabs) {
        xulWindow.gBrowser.moveTabTo(tab, pos++);
      }
    });
  },

  async getTabs(args) {
    if (!("userContextId" in args)) {
      return new Error("getTabs must be called with userContextId argument.");
    }

    this._remapTabsIfMissing(args.userContextId);
    if (!this._isKnownContainer(args.userContextId)) {
      return [];
    }

    const promises = [];
    this._matchTabsByContainer(args.userContextId).forEach((tab) => {
      promises.push(this._createTabObject(tab));
    });

    const list = await Promise.all(promises);
    return list.concat(this._identitiesState[args.userContextId].hiddenTabs);
  },

  showTab(args) {
    return new Promise((resolve, reject) => {
      if (!("tabId" in args)) {
        reject("showTab must be called with tabId argument.");
        return;
      }

      for (const tab of tabs) {
        if (tab.id === args.tabId) {
          tab.window.activate();
          tab.activate();
          break;
        }
      }

      resolve(null);
    });
  },

  moveTabsToWindow(args) {
    return new Promise((resolve, reject) => {
      if (!("userContextId" in args)) {
        reject("moveTabsToWindow must be called with userContextId argument.");
        return;
      }

      this._remapTabsIfMissing(args.userContextId);
      if (!this._isKnownContainer(args.userContextId)) {
        return Promise.resolve(null);
      }

      this.sendTelemetryPayload({
        "event": "move-tabs-to-window",
        "userContextId": args.userContextId,
        "clickedContainerTabCount": this._containerTabCount(args.userContextId),
      });

      const list = this._matchTabsByContainer(args.userContextId);

      // Nothing to do
      if (list.length === 0 &&
          this._identitiesState[args.userContextId].hiddenTabs.length === 0) {
        resolve(null);
        return;
      }

      windows.browserWindows.open({
        url: "about:blank",
        onOpen: window => {
          const newBrowserWindow = viewFor(window);
          let pos = 0;

          // Let's move the tab to the new window.
          for (let tab of list) { // eslint-disable-line prefer-const
            newBrowserWindow.gBrowser.adoptTab(viewFor(tab), pos++, false);
          }

          // Let's show the hidden tabs.
          for (let object of this._identitiesState[args.userContextId].hiddenTabs) { // eslint-disable-line prefer-const
            newBrowserWindow.gBrowser.addTab(object.url || DEFAULT_TAB, { userContextId: args.userContextId });
          }

          this._identitiesState[args.userContextId].hiddenTabs = [];

          // Let's close all the normal tab in the new window. In theory it
          // should be only the first tab, but maybe there are addons doing
          // crazy stuff.
          for (let tab of window.tabs) { // eslint-disable-line prefer-const
            const userContextId = this._getUserContextIdFromTab(tab);
            if (args.userContextId !== userContextId) {
              newBrowserWindow.gBrowser.removeTab(viewFor(tab));
            }
          }
          resolve(null);
        },
      });
    });
  },

  openTab(args) {
    return this.triggerBackgroundCallback(args, "open-tab");
  },

  // Identities management
  queryIdentitiesState() {
    return new Promise(resolve => {
      const identities = {};

      ContextualIdentityProxy.getIdentities().forEach(identity => {
        this._remapTabsIfMissing(identity.userContextId);
        const convertedIdentity = {
          hasHiddenTabs: !!this._identitiesState[identity.userContextId].hiddenTabs.length,
          hasOpenTabs: !!this._identitiesState[identity.userContextId].openTabs
        };

        identities[identity.userContextId] = convertedIdentity;
      });

      resolve(identities);
    });
  },

  queryIdentities() {
    return new Promise(resolve => {
      const identities = ContextualIdentityProxy.getIdentities();
      identities.forEach(identity => {
        this._remapTabsIfMissing(identity.userContextId);
      });

      resolve(identities);
    });
  },

  // Preferences

  getPreference(args) {
    if (!("pref" in args)) {
      return Promise.reject("getPreference must be called with pref argument.");
    }

    return Promise.resolve(prefService.get(args.pref));
  },

  // Styling the window

  _configureWindows() {
    const promises = [];
    for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
      promises.push(this._configureWindow(viewFor(window)));
    }
    return Promise.all(promises);
  },

  _configureWindow(window) {
    return this._getOrCreateContainerWindow(window).configure();
  },

  _configureActiveWindows() {
    const promises = [];
    for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
      promises.push(this._configureActiveWindow(viewFor(window)));
    }
    return Promise.all(promises);
  },

  _configureActiveWindow(window) {
    return this._getOrCreateContainerWindow(window).configureActive();
  },

  closeWindow(window) {
    this._windowMap.delete(window);
  },

  _getOrCreateContainerWindow(window) {
    if (!(this._windowMap.has(window))) {
      this._windowMap.set(window, new ContainerWindow(window));
    }

    return this._windowMap.get(window);
  },

  refreshNeeded() {
    return this._configureWindows();
  },

  _restyleActiveTab(tab) {
    if (!tab) {
      return Promise.resolve(null);
    }

    const userContextId = ContainerService._getUserContextIdFromTab(tab);
    const identity = ContextualIdentityProxy.getIdentityFromId(userContextId);
    const hbox = viewFor(tab.window).document.getElementById("userContext-icons");

    if (!identity) {
      hbox.setAttribute("data-identity-color", "");
      return Promise.resolve(null);
    }

    hbox.setAttribute("data-identity-color", identity.color);

    const label = viewFor(tab.window).document.getElementById("userContext-label");
    label.setAttribute("value", identity.name);
    label.style.color = ContainerService._fromNameToColor(identity.color);

    const indicator = viewFor(tab.window).document.getElementById("userContext-indicator");
    indicator.setAttribute("data-identity-icon", identity.icon);
    indicator.style.listStyleImage = "";

    return this._restyleTab(tab);
  },

  _restyleTab(tab) {
    if (!tab) {
      return Promise.resolve(null);
    }
    const userContextId = ContainerService._getUserContextIdFromTab(tab);
    const identity = ContextualIdentityProxy.getIdentityFromId(userContextId);
    if (!identity) {
      return Promise.resolve(null);
    }
    return Promise.resolve(viewFor(tab).setAttribute("data-identity-color", identity.color));
  },

  // Uninstallation
  uninstall(reason) {
    const data = ss.storage.savedConfiguration;
    if (!data) {
      throw new DOMError("ERROR - No saved configuration!!");
    }

    if (data.version !== 1) {
      throw new DOMError("ERROR - Unknown version!!");
    }

    if (reason !== "upgrade") {
      PREFS.forEach(pref => {
        if (pref[0] in data.prefs) {
          prefService.set(pref[0], data.prefs[pref[0]]);
        }
      });
    }

    // Note: We cannot go back renaming the Finance identity back to Banking:
    // the locale system doesn't work with renamed containers.

    // Restore the customizable container panel.
    const widget = CustomizableWidgets.find(widget => widget.id === "containers-panelmenu");
    if (widget) {
      CustomizableUI.createWidget(widget);
    }

    for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
      // Let's close all the container tabs.
      // Note: We cannot use _closeTabs() because at this point tab.window is
      // null.
      if (!this._containerWasEnabled && reason !== "upgrade") {
        for (let tab of window.tabs) { // eslint-disable-line prefer-const
          if (this._getUserContextIdFromTab(tab)) {
            tab.close();
            try {
              SessionStore.forgetClosedTab(viewFor(window), 0);
            } catch(e) {} // eslint-disable-line no-empty
          }
        }
      }

      this._getOrCreateContainerWindow(viewFor(window)).shutdown();
    }

    // all the configuration must go away now.
    this._windowMap = new Map();

    if (reason !== "upgrade") {
      // Let's forget all the previous closed tabs.
      this._forgetIdentity();

      const preInstalledIdentities = data.preInstalledIdentities;
      ContextualIdentityProxy.getIdentities().forEach(identity => {
        if (!preInstalledIdentities.includes(identity.userContextId)) {
          ContextualIdentityService.remove(identity.userContextId);
        } else {
          // Let's cleanup all the cookies for this container.
          Services.obs.notifyObservers(null, "clear-origin-attributes-data",
                                       JSON.stringify({ userContextId: identity.userContextId }));
        }
      });

      // Let's delete the configuration.
      delete ss.storage.savedConfiguration;
    }

    // Begin-Of-Hack
    if (this._oldGetIdentityFromId) {
      ContextualIdentityService.getIdentityFromId = this._oldGetIdentityFromId;
    }

    if (this._oldGetPublicIdentityFromId) {
      ContextualIdentityService.getPublicIdentityFromId = this._oldGetPublicIdentityFromId;
    }
    // End-Of-Hack
  },

  forgetIdentityAndRefresh(args) {
    this._forgetIdentity(args.userContextId);
    return this.refreshNeeded();
  },

  _forgetIdentity(userContextId = 0) {
    for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
      window = viewFor(window);
      const closedTabData = JSON.parse(SessionStore.getClosedTabData(window));
      for (let i = closedTabData.length - 1; i >= 0; --i) {
        if (!closedTabData[i].state.userContextId) {
          continue;
        }

        if (userContextId === 0 ||
            closedTabData[i].state.userContextId === userContextId) {
          try {
            SessionStore.forgetClosedTab(window, i);
          } catch(e) {} // eslint-disable-line no-empty
        }
      }
    }
  },
};

// ----------------------------------------------------------------------------
// ContainerWindow

// This object is used to configure a single window.
function ContainerWindow(window) {
  this._init(window);
}

ContainerWindow.prototype = {
  _window: null,
  _style: null,
  _panelElement: null,
  _timeoutStore: new Map(),
  _elementCache: new Map(),
  _tooltipCache: new Map(),
  _tabsElement: null,

  _init(window) {
    this._window = window;
    this._tabsElement = this._window.document.getElementById("tabbrowser-tabs");
    this._style = Style({ uri: self.data.url("usercontext.css") });
    attachTo(this._style, this._window);
  },

  configure() {
    return Promise.all([
      this._configureActiveTab(),
      this._configureFileMenu(),
      this._configureAllTabsMenu(),
      this._configureTabStyle(),
      this.configureActive(),
    ]);
  },

  configureActive() {
    return this._configureContextMenu();
  },

  _configureTabStyle() {
    const promises = [];
    for (let tab of modelFor(this._window).tabs) { // eslint-disable-line prefer-const
      promises.push(ContainerService._restyleTab(tab));
    }
    return Promise.all(promises);
  },

  _configureActiveTab() {
    const tab = modelFor(this._window).tabs.activeTab;
    return ContainerService._restyleActiveTab(tab);
  },

  _configureFileMenu() {
    return this._configureMenu("menu_newUserContext", null, e => {
      const userContextId = parseInt(e.target.getAttribute("data-usercontextid"), 10);
      ContainerService.openTab({
        userContextId: userContextId,
        source: "file-menu"
      });
    });
  },

  _configureAllTabsMenu() {
    return this._configureMenu("alltabs_containersTab", null, e => {
      const userContextId = parseInt(e.target.getAttribute("data-usercontextid"), 10);
      ContainerService.showTabs({
        userContextId,
        nofocus: true,
        window: this._window,
      }).then(() => {
        return ContainerService.openTab({
          userContextId,
          source: "alltabs-menu"
        });
      }).catch(() => {});
    });
  },

  _configureContextMenu() {
    return Promise.all([
      this._configureMenu("context-openlinkinusercontext-menu",
        () => {
          // This userContextId is what we want to exclude.
          const tab = modelFor(this._window).tabs.activeTab;
          return ContainerService._getUserContextIdFromTab(tab);
        },
        e => {
          // This is a super internal method. Hopefully it will be stable in the
          // next FF releases.
          this._window.gContextMenu.openLinkInTab(e);

          const userContextId = parseInt(e.target.getAttribute("data-usercontextid"), 10);
          ContainerService.showTabs({
            userContextId,
            nofocus: true,
            window: this._window,
          });
        }
      ),
      this._configureContextMenuOpenLink(),
    ]);
  },

  _configureContextMenuOpenLink() {
    return new Promise(resolve => {
      const self = this;
      this._window.gSetUserContextIdAndClick = function(event) {
        const tab = modelFor(self._window).tabs.activeTab;
        const userContextId = ContainerService._getUserContextIdFromTab(tab);
        event.target.setAttribute("data-usercontextid", userContextId);
        self._window.gContextMenu.openLinkInTab(event);
      };

      let item = this._window.document.getElementById("context-openlinkincontainertab");
      item.setAttribute("oncommand", "gSetUserContextIdAndClick(event)");

      item = this._window.document.getElementById("context-openlinkintab");
      item.setAttribute("oncommand", "gSetUserContextIdAndClick(event)");

      resolve();
    });
  },

  // Generic menu configuration.
  _configureMenu(menuId, excludedContainerCb, clickCb) {
    const menu = this._window.document.getElementById(menuId);
    if (!this._disableElement(menu)) {
      // Delete stale menu that isn't native elements
      while (menu.firstChild) {
        menu.removeChild(menu.firstChild);
      }
    }

    const menupopup = this._window.document.createElementNS(XUL_NS, "menupopup");
    menu.appendChild(menupopup);

    menupopup.addEventListener("command", clickCb);
    return this._createMenu(menupopup, excludedContainerCb);
  },

  _createMenu(target, excludedContainerCb) {
    while (target.hasChildNodes()) {
      target.removeChild(target.firstChild);
    }

    return new Promise((resolve, reject) => {
      ContainerService.queryIdentities().then(identities => {
        const fragment = this._window.document.createDocumentFragment();

        const excludedUserContextId = excludedContainerCb ? excludedContainerCb() : 0;
        if (excludedUserContextId) {
          const bundle = this._window.document.getElementById("bundle_browser");

          const menuitem = this._window.document.createElementNS(XUL_NS, "menuitem");
          menuitem.setAttribute("data-usercontextid", "0");
          menuitem.setAttribute("label", bundle.getString("userContextNone.label"));
          menuitem.setAttribute("accesskey", bundle.getString("userContextNone.accesskey"));

          fragment.appendChild(menuitem);

          const menuseparator = this._window.document.createElementNS(XUL_NS, "menuseparator");
          fragment.appendChild(menuseparator);
        }

        identities.forEach(identity => {
          if (identity.userContextId === excludedUserContextId) {
            return;
          }

          const menuitem = this._window.document.createElementNS(XUL_NS, "menuitem");
          menuitem.setAttribute("label", identity.name);
          menuitem.classList.add("menuitem-iconic");
          menuitem.setAttribute("data-usercontextid", identity.userContextId);
          menuitem.setAttribute("data-identity-color", identity.color);
          menuitem.setAttribute("data-identity-icon", identity.icon);
          fragment.appendChild(menuitem);
        });

        target.appendChild(fragment);
        resolve();
      }).catch(() => {reject();});
    });
  },

  // This timer is used to hide the panel auto-magically if it's not used in
  // the following X seconds. This is need to avoid the leaking of the panel
  // when the mouse goes out of of the 'plus' button.
  _createTimeout(key, callback, timeoutTime) {
    this._cleanTimeout(key);
    this._timeoutStore.set(key, this._window.setTimeout(() => {
      callback();
      this._timeoutStore.delete(key);
    }, timeoutTime));
  },

  _cleanAllTimeouts() {
    for (let key of this._timeoutStore.keys()) { // eslint-disable-line prefer-const
      this._cleanTimeout(key);
    }
  },

  _cleanTimeout(key) {
    if (this._timeoutStore.has(key)) {
      this._window.clearTimeout(this._timeoutStore.get(key));
      this._timeoutStore.delete(key);
    }
  },

  shutdown() {
    // CSS must be removed.
    detachFrom(this._style, this._window);

    this._shutdownPlusButtonMenu();
    this._shutdownFileMenu();
    this._shutdownAllTabsMenu();
    this._shutdownContextMenu();

    this._shutdownContainers();
  },

  _shutDownPlusButtonMenuElement(buttonElement) {
    if (buttonElement) {
      this._shutdownElement(buttonElement);
      buttonElement.setAttribute("tooltip", this._tooltipCache.get(buttonElement));

      buttonElement.removeEventListener("mouseover", this);
      buttonElement.removeEventListener("click", this);
      buttonElement.removeEventListener("mouseout", this);
    }
  },

  _shutdownFileMenu() {
    this._shutdownMenu("menu_newUserContext");
  },

  _shutdownAllTabsMenu() {
    this._shutdownMenu("alltabs_containersTab");
  },

  _shutdownContextMenu() {
    this._shutdownMenu("context-openlinkinusercontext-menu");
  },

  _shutdownMenu(menuId) {
    const menu = this._window.document.getElementById(menuId);
    this._shutdownElement(menu);
  },

  _shutdownElement(element) {
    // Let's remove our elements.
    while (element.firstChild) {
      element.firstChild.remove();
    }

    const elementCache = this._elementCache.get(element);
    if (elementCache) {
      for (let e of elementCache) { // eslint-disable-line prefer-const
        element.appendChild(e);
      }
    }
  },

  _disableElement(element) {
    // Nothing to disable.
    if (!element || this._elementCache.has(element)) {
      return false;
    }
    const cacheArray = [];

    // Let's store the previous elements so that we can repopulate it in case
    // the addon is uninstalled.
    while (element.firstChild) {
      cacheArray.push(element.removeChild(element.firstChild));
    }

    this._elementCache.set(element, cacheArray);

    return true;
  },

  _shutdownContainers() {
    ContextualIdentityProxy.getIdentities().forEach(identity => {
      if (IDENTITY_ICONS_STANDARD.indexOf(identity.icon) !== -1 &&
          IDENTITY_COLORS_STANDARD.indexOf(identity.color) !== -1) {
        return;
      }

      if (IDENTITY_ICONS_STANDARD.indexOf(identity.icon) === -1) {
        if (identity.userContextId <= IDENTITY_ICONS_STANDARD.length) {
          identity.icon = IDENTITY_ICONS_STANDARD[identity.userContextId - 1];
        } else {
          identity.icon = IDENTITY_ICONS_STANDARD[0];
        }
      }

      if (IDENTITY_COLORS_STANDARD.indexOf(identity.color) === -1) {
        if (identity.userContextId <= IDENTITY_COLORS_STANDARD.length) {
          identity.color = IDENTITY_COLORS_STANDARD[identity.userContextId - 1];
        } else {
          identity.color = IDENTITY_COLORS_STANDARD[0];
        }
      }

      ContextualIdentityService.update(identity.userContextId,
                                       identity.name,
                                       identity.icon,
                                       identity.color);
    });
  }
};

// uninstall/install events ---------------------------------------------------

exports.main = function (options) {
  const installation = options.loadReason === "install" ||
                       options.loadReason === "downgrade" ||
                       options.loadReason === "enable" ||
                       options.loadReason === "upgrade";

  // Let's start :)
  ContainerService.init(installation, options.loadReason);
};

exports.onUnload = function (reason) {
  if (reason === "disable" ||
      reason === "downgrade" ||
      reason === "uninstall" ||
      reason === "upgrade") {
    ContainerService.uninstall(reason);
  }
};
