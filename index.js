/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const DEFAULT_TAB = "about:newtab";

const SHOW_MENU_TIMEOUT = 100;
const HIDE_MENU_TIMEOUT = 300;

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
  { name: "circle", image: "" }, // this doesn't exist in m-b
];

const PREFS = [
  [ "privacy.userContext.enabled", true ],
  [ "privacy.userContext.ui.enabled", false ],
  [ "privacy.usercontext.about_newtab_segregation.enabled", true ],
];

const { attachTo, detachFrom } = require("sdk/content/mod");
const { Cu } = require("chrome");
const { ContextualIdentityService } = require("resource://gre/modules/ContextualIdentityService.jsm");
const { getFavicon } = require("sdk/places/favicon");
const Metrics = require("./testpilot-metrics");
const { modelFor } = require("sdk/model/core");
const prefService = require("sdk/preferences/service");
const self = require("sdk/self");
const ss = require("sdk/simple-storage");
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

// ----------------------------------------------------------------------------
// ContainerService

const ContainerService = {
  _identitiesState: {},
  _windowMap: {},

  init(installation) {
    // If we are just been installed, we must store some information for the
    // uninstallation. This object contains also a version number, in case we
    // need to implement a migration in the future.
    if (installation) {
      const object = {
        version: 1,
        prefs: {},
        metricsUUID: uuid.uuid().toString(),
      };

      PREFS.forEach(pref => {
        object.prefs[pref[0]] = prefService.get(pref[0]);
      });

      ss.storage.savedConfiguration = object;
    }

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
      "openTab",
      "moveTabsToWindow",
      "queryIdentities",
      "getIdentity",
      "createIdentity",
      "removeIdentity",
      "updateIdentity",
      "getPreference",
      "sendTelemetryPayload"
    ];

    // Map of identities.
    ContextualIdentityService.getIdentities().forEach(identity => {
      this._remapTabsIfMissing(identity.userContextId);
    });

    // Let's restore the hidden tabs from the previous session.
    if (prefService.get("browser.startup.page") === 3 &&
        "identitiesData" in ss.storage) {
      ContextualIdentityService.getIdentities().forEach(identity => {
        if (identity.userContextId in ss.storage.identitiesData &&
            "hiddenTabs" in ss.storage.identitiesData[identity.userContextId]) {
          this._identitiesState[identity.userContextId].hiddenTabs =
            ss.storage.identitiesData[identity.userContextId].hiddenTabs;
        }
      });
    }

    tabs.on("open", tab => {
      const userContextId = this._getUserContextIdFromTab(tab);
      if (userContextId) {
        ++this._identitiesState[userContextId].openTabs;
      }
      this._hideAllPanels();
      this._restyleTab(tab);
    });

    tabs.on("close", tab => {
      const userContextId = this._getUserContextIdFromTab(tab);
      if (userContextId && this._identitiesState[userContextId].openTabs) {
        --this._identitiesState[userContextId].openTabs;
      }
      this._hideAllPanels();
    });

    tabs.on("activate", tab => {
      this._hideAllPanels();
      this._restyleActiveTab(tab).catch(() => {});
    });

    // Modify CSS and other stuff for each window.

    this.configureWindows().catch(() => {});

    windows.browserWindows.on("open", window => {
      this.configureWindow(viewFor(window)).catch(() => {});
    });

    windows.browserWindows.on("close", window => {
      this.closeWindow(viewFor(window));
    });

    // WebExtension startup

    webExtension.startup().then(api => {
      api.browser.runtime.onMessage.addListener((message, sender, sendReply) => {
        if ("method" in message && methods.indexOf(message.method) !== -1) {
          sendReply(this[message.method](message));
        }
      });
    }).catch(() => {
      throw new Error("WebExtension startup failed. Unable to continue.");
    });

    this._sendEvent = new Metrics({
      type: "sdk",
      id: self.id,
      version: self.version
    }).sendEvent;

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

  _convert(identity) {
    // Let's convert the known colors to their color names.
    return {
      name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
      image: this._fromIconToName(identity.icon),
      color: this._fromColorToName(identity.color),
      userContextId: identity.userContextId,
      hasHiddenTabs: !!this._identitiesState[identity.userContextId].hiddenTabs.length,
      hasOpenTabs: !!this._identitiesState[identity.userContextId].openTabs
    };
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

  _fromNameToIcon(name) {
    return this._fromNameOrIcon(name, "image", "");
  },

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

  _createTabObject(tab) {
    return { title: tab.title, url: tab.url, id: tab.id, active: true };
  },

  _containerTabIterator(userContextId, cb) {
    for (let tab of tabs) { // eslint-disable-line prefer-const
      if (userContextId === this._getUserContextIdFromTab(tab)) {
        cb(tab);
      }
    }
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
    this._containerTabIterator(userContextId, () => {
      ++this._identitiesState[userContextId].openTabs;
    });
  },

  _isKnownContainer(userContextId) {
    return userContextId in this._identitiesState;
  },

  _closeTabs(tabsToClose) {
    // We create a new tab only if the current operation closes all the
    // existing ones.
    let promise;
    if (tabs.length !== tabsToClose.length) {
      promise = Promise.resolve(null);
    } else {
      promise = this.openTab({});
    }

    return promise.then(() => {
      for (let tab of tabsToClose) { // eslint-disable-line prefer-const
        tab.close();
      }
    }).catch(() => null);
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

    this._sendEvent(payload);
  },

  // Tabs management

  hideTabs(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("hideTabs must be called with userContextId argument.");
    }

    this._remapTabsIfMissing(args.userContextId);
    if (!this._isKnownContainer(args.userContextId)) {
      return Promise.resolve(null);
    }

    const containersCounts = this._containersCounts();
    this.sendTelemetryPayload({
      "event": "hide-tabs",
      "userContextId": args.userContextId,
      "clickedContainerTabCount": this._containerTabCount(args.userContextId),
      "shownContainersCount": containersCounts.shown,
      "hiddenContainersCount": containersCounts.hidden,
      "totalContainersCount": containersCounts.total
    });

    const tabsToClose = [];

    this._containerTabIterator(args.userContextId, tab => {
      const object = this._createTabObject(tab);

      // This tab is going to be closed. Let's mark this tabObject as
      // non-active.
      object.active = false;

      getFavicon(object.url).then(url => {
        object.favicon = url;
      }).catch(() => {
        object.favicon = "";
      });

      this._identitiesState[args.userContextId].hiddenTabs.push(object);
      tabsToClose.push(tab);
    });

    return this._closeTabs(tabsToClose).then(() => {
      return this._syncTabs();
    });
  },

  showTabs(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("showTabs must be called with userContextId argument.");
    }

    this._remapTabsIfMissing(args.userContextId);
    if (!this._isKnownContainer(args.userContextId)) {
      return Promise.resolve(null);
    }

    const containersCounts = this._containersCounts();
    this.sendTelemetryPayload({
      "event": "show-tabs",
      "userContextId": args.userContextId,
      "clickedContainerTabCount": this._containerTabCount(args.userContextId),
      "shownContainersCount": containersCounts.shown,
      "hiddenContainersCount": containersCounts.hidden,
      "totalContainersCount": containersCounts.total
    });

    const promises = [];

    for (let object of this._identitiesState[args.userContextId].hiddenTabs) { // eslint-disable-line prefer-const
      promises.push(this.openTab({ userContextId: args.userContextId, url: object.url }));
    }

    this._identitiesState[args.userContextId].hiddenTabs = [];

    return Promise.all(promises).then(() => {
      return this._syncTabs();
    });
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
    for (let tab of tabs) { // eslint-disable-line prefer-const
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
      for (let tab of tabs) { // eslint-disable-line prefer-const
        xulWindow.gBrowser.moveTabTo(tab, pos++);
      }
    });
  },

  getTabs(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("getTabs must be called with userContextId argument.");
    }

    this._remapTabsIfMissing(args.userContextId);
    if (!this._isKnownContainer(args.userContextId)) {
      return Promise.resolve([]);
    }

    return new Promise((resolve, reject) => {
      const list = [];
      this._containerTabIterator(args.userContextId, tab => {
        list.push(this._createTabObject(tab));
      });

      const promises = [];

      for (let object of list) { // eslint-disable-line prefer-const
        promises.push(getFavicon(object.url).then(url => {
          object.favicon = url;
        }).catch(() => {
          object.favicon = "";
        }));
      }

      Promise.all(promises).then(() => {
        resolve(list.concat(this._identitiesState[args.userContextId].hiddenTabs));
      }).catch((e) => {
        reject(e);
      });
    });
  },

  showTab(args) {
    return new Promise((resolve, reject) => {
      if (!("tabId" in args)) {
        reject("showTab must be called with tabId argument.");
        return;
      }

      for (let tab of tabs) { // eslint-disable-line prefer-const
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

      this.sendTelemetryPayload({
        "event": "move-tabs-to-window",
        "userContextId": args.userContextId,
        "clickedContainerTabCount": this._containerTabCount(args.userContextId),
      });

      // Let's create a list of the tabs.
      const list = [];
      this._containerTabIterator(args.userContextId, tab => {
        list.push(tab);
      });

      // Nothing to do
      if (list.length === 0) {
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
    return this._recentBrowserWindow().then(browserWin => {
      const userContextId = ("userContextId" in args) ? args.userContextId : 0;
      const source = ("source" in args) ? args.source : null;

      // Only send telemetry for tabs opened by UI - i.e., not via showTabs
      if (source) {
        this.sendTelemetryPayload({
          "event": "open-tab",
          "eventSource": source,
          "userContextId": userContextId,
          "clickedContainerTabCount": this._containerTabCount(userContextId)
        });
      }

      const tab = browserWin.gBrowser.addTab(args.url || DEFAULT_TAB, { userContextId });
      browserWin.gBrowser.selectedTab = tab;
      browserWin.focusAndSelectUrlBar();
      return true;
    }).catch(() => false);
  },

  // Identities management

  queryIdentities() {
    return new Promise(resolve => {
      const identities = [];

      ContextualIdentityService.getIdentities().forEach(identity => {
        this._remapTabsIfMissing(identity.userContextId);
        const convertedIdentity = this._convert(identity);
        identities.push(convertedIdentity);
      });

      resolve(identities);
    });
  },

  getIdentity(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("getIdentity must be called with userContextId argument.");
    }

    const identity = ContextualIdentityService.getIdentityFromId(args.userContextId);
    return Promise.resolve(identity ? this._convert(identity) : null);
  },

  createIdentity(args) {
    this.sendTelemetryPayload({
      "event": "add-container",
    });

    for (let arg of [ "name", "color", "icon"]) { // eslint-disable-line prefer-const
      if (!(arg in args)) {
        return Promise.reject("createIdentity must be called with " + arg + " argument.");
      }
    }

    const color = this._fromNameToColor(args.color);
    const icon = this._fromNameToIcon(args.icon);

    const identity = ContextualIdentityService.create(args.name, icon, color);

    this._identitiesState[identity.userContextId] = this._createIdentityState();

    this._refreshNeeded().then(() => {
      return this._convert(identity);
    }).catch(() => {
      return this._convert(identity);
    });
  },

  updateIdentity(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("updateIdentity must be called with userContextId argument.");
    }

    this.sendTelemetryPayload({
      "event": "edit-container",
      "userContextId": args.userContextId
    });

    const identity = ContextualIdentityService.getIdentityFromId(args.userContextId);
    for (let arg of [ "name", "color", "icon"]) { // eslint-disable-line prefer-const
      if ((arg in args)) {
        identity[arg] = args[arg];
      }
    }

    const color = this._fromNameToColor(identity.color);
    const icon = this._fromNameToIcon(identity.icon);

    const updated = ContextualIdentityService.update(args.userContextId,
                                                     identity.name,
                                                     icon, color);

    this._refreshNeeded().then(() => {
      return updated;
    }).catch(() => {
      return updated;
    });
  },

  removeIdentity(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("removeIdentity must be called with userContextId argument.");
    }

    this.sendTelemetryPayload({
      "event": "delete-container",
      "userContextId": args.userContextId
    });

    const tabsToClose = [];
    this._containerTabIterator(args.userContextId, tab => {
      tabsToClose.push(tab);
    });

    return this._closeTabs(tabsToClose).then(() => {
      const removed = ContextualIdentityService.remove(args.userContextId);
      return this._refreshNeeded().then(() => removed );
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

  configureWindows() {
    const promises = [];
    for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
      promises.push(this.configureWindow(viewFor(window)));
    }
    return Promise.all(promises);
  },

  configureWindow(window) {
    return this._getOrCreateContainerWindow(window).configure();
  },

  closeWindow(window) {
    const id = windowUtils.getInnerId(window);
    delete this._windowMap[id];
  },

  _getOrCreateContainerWindow(window) {
    const id = windowUtils.getInnerId(window);
    if (!(id in this._windowMap)) {
      this._windowMap[id] = new ContainerWindow(window);
    }

    return this._windowMap[id];
  },

  _refreshNeeded() {
    return this.configureWindows();
  },

  _hideAllPanels() {
    for (let id in this._windowMap) { // eslint-disable-line prefer-const
      this._windowMap[id].hidePanel();
    }
  },

  _restyleActiveTab(tab) {
    if (!tab) {
      return Promise.resolve(null);
    }

    const userContextId = ContainerService._getUserContextIdFromTab(tab);
    return ContainerService.getIdentity({userContextId}).then(identity => {
      if (!identity) {
        return;
      }

      const hbox = viewFor(tab.window).document.getElementById("userContext-icons");
      hbox.setAttribute("data-identity-color", identity.color);

      const label = viewFor(tab.window).document.getElementById("userContext-label");
      label.setAttribute("value", identity.name);
      label.style.color = ContainerService._fromNameToColor(identity.color);

      const indicator = viewFor(tab.window).document.getElementById("userContext-indicator");
      indicator.setAttribute("data-identity-icon", identity.image);
      indicator.style.listStyleImage = "";
    }).then(() => {
      return this._restyleTab(tab);
    });
  },

  _restyleTab(tab) {
    if (!tab) {
      return Promise.resolve(null);
    }
    const userContextId = ContainerService._getUserContextIdFromTab(tab);
    return ContainerService.getIdentity({userContextId}).then(identity => {
      if (!identity) {
        return;
      }
      viewFor(tab).setAttribute("data-identity-color", identity.color);
    });
  },

  // Uninstallation
  uninstall() {
    const data = ss.storage.savedConfiguration;
    if (!data) {
      throw new DOMError("ERROR - No saved configuration!!");
    }

    if (data.version !== 1) {
      throw new DOMError("ERROR - Unknown version!!");
    }

    PREFS.forEach(pref => {
      if (pref[0] in data.prefs) {
        prefService.set(pref[0], data.prefs[pref[0]]);
      }
    });

    // Restore the customizable container panel.
    const widget = CustomizableWidgets.find(widget => widget.id === "containers-panelmenu");
    if (widget) {
      CustomizableUI.createWidget(widget);
    }

    // Let's delete the configuration.
    delete ss.storage.savedConfiguration;

    for (let window of windows.browserWindows) { // eslint-disable-line prefer-const
      this._getOrCreateContainerWindow(viewFor(window)).shutdown();
    }

    // all the configuration must go away now.
    this._windowMap = {};

    // Let's close all the container tabs (note: we don't care if containers
    // are supported but the current FF version).
    const tabsToClose = [];
    for (let tab of tabs) { // eslint-disable-line prefer-const
      if (this._getUserContextIdFromTab(tab)) {
        tabsToClose.push(tab);
      }
    }
    this._closeTabs(tabsToClose);
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
  _plusButton: null,
  _overflowPlusButton: null,
  _tabsElement: null,

  _init(window) {
    this._window = window;
    this._tabsElement = this._window.document.getElementById("tabbrowser-tabs");
    this._plusButton = this._window.document.getAnonymousElementByAttribute(this._tabsElement, "anonid", "tabs-newtab-button");
    this._overflowPlusButton = this._window.document.getElementById("new-tab-button");
    this._style = Style({ uri: self.data.url("usercontext.css") });
    attachTo(this._style, this._window);
  },

  configure() {
    return Promise.all([
      this._configurePlusButtonMenu(),
      this._configureActiveTab(),
      this._configureFileMenu(),
      this._configureContextMenu(),
      this._configureTabStyle(),
    ]);
  },

  handleEvent(e) {
    let el = e.target;
    switch (e.type) {
    case "mouseover":
      this._createTimeout("show", () => {
        this.showPopup(el);
      }, SHOW_MENU_TIMEOUT);
      break;
    case "click":
      this.hidePanel();
      break;
    case "mouseout":
      while(el) {
        if (el === this._panelElement ||
            el === this._plusButton ||
            el === this._overflowPlusButton) {
          // Clear show timeout so we don't hide and reshow
          this._cleanTimeout("show");
          this._createTimeout("hidden", () => {
            this.hidePanel();
          }, HIDE_MENU_TIMEOUT);
          return;
        }
        el = el.parentElement;
      }
      break;
    }
  },

  showPopup(buttonElement) {
    this._cleanAllTimeouts();
    this._panelElement.openPopup(buttonElement);
  },

  _configurePlusButtonMenuElement(buttonElement) {
    // Let's remove the tooltip because it can go over our panel.
    this._tooltipCache.set(buttonElement, buttonElement.getAttribute("tooltip"));
    buttonElement.setAttribute("tooltip", "");
    this._disableElement(buttonElement);

    buttonElement.addEventListener("mouseover", this);
    buttonElement.addEventListener("click", this);
    buttonElement.addEventListener("mouseout", this);
  },

  _configurePlusButtonMenu() {
    const mainPopupSetElement = this._window.document.getElementById("mainPopupSet");

    // Let's remove all the previous panels.
    if (this._panelElement) {
      this._panelElement.remove();
    }

    this._panelElement = this._window.document.createElementNS(XUL_NS, "panel");
    this._panelElement.setAttribute("id", "new-tab-overlay");
    this._panelElement.setAttribute("position", "bottomcenter topleft");
    this._panelElement.setAttribute("side", "top");
    this._panelElement.setAttribute("flip", "side");
    this._panelElement.setAttribute("type", "arrow");
    this._panelElement.setAttribute("animate", "open");
    this._panelElement.setAttribute("consumeoutsideclicks", "never");
    mainPopupSetElement.appendChild(this._panelElement);

    this._configurePlusButtonMenuElement(this._plusButton);
    this._configurePlusButtonMenuElement(this._overflowPlusButton);

    this._panelElement.addEventListener("mouseout", this);

    this._panelElement.addEventListener("mouseover", () => {
      this._cleanAllTimeouts();
    });

    return ContainerService.queryIdentities().then(identities => {
      identities.forEach(identity => {
        const menuItemElement = this._window.document.createElementNS(XUL_NS, "menuitem");
        this._panelElement.appendChild(menuItemElement);
        menuItemElement.className = "menuitem-iconic";
        menuItemElement.setAttribute("label", identity.name);
        menuItemElement.setAttribute("data-usercontextid", identity.userContextId);
        menuItemElement.setAttribute("data-identity-icon", identity.image);
        menuItemElement.setAttribute("data-identity-color", identity.color);

        menuItemElement.addEventListener("command", (e) => {
          ContainerService.openTab({
            userContextId: identity.userContextId,
            source: "tab-bar"
          });
          e.stopPropagation();
        });

        menuItemElement.addEventListener("mouseover", () => {
          this._cleanAllTimeouts();
        });

        menuItemElement.addEventListener("mouseout", this);

        this._panelElement.appendChild(menuItemElement);
      });
    }).catch(() => {
      this.hidePanel();
    });
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

  _configureContextMenu() {
    return this._configureMenu("context-openlinkinusercontext-menu",
      () => {
        // This userContextId is what we want to exclude.
        const tab = modelFor(this._window).tabs.activeTab;
        return ContainerService._getUserContextIdFromTab(tab);
      },
      e => {
        // This is a super internal method. Hopefully it will be stable in the
        // next FF releases.
        this._window.gContextMenu.openLinkInTab(e);
      }
    );
  },

  // Generic menu configuration.
  _configureMenu(menuId, excludedContainerCb, clickCb) {
    const menu = this._window.document.getElementById(menuId);
    this._disableElement(menu);
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
          menuitem.setAttribute("data-identity-icon", identity.image);
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

  hidePanel() {
    this._cleanAllTimeouts();
    this._panelElement.hidePopup();
  },

  shutdown() {
    // CSS must be removed.
    detachFrom(this._style, this._window);

    this._shutdownPlusButtonMenu();
    this._shutdownFileMenu();
    this._shutdownContextMenu();
  },

  _shutDownPlusButtonMenuElement(buttonElement) {
    this._shutdownElement(buttonElement);
    buttonElement.setAttribute("tooltip", this._tooltipCache.get(buttonElement));

    buttonElement.removeEventListener("mouseover", this);
    buttonElement.removeEventListener("click", this);
    buttonElement.removeEventListener("mouseout", this);
  },

  _shutdownPlusButtonMenu() {
    this._shutDownPlusButtonMenuElement(this._plusButton);
    this._shutDownPlusButtonMenuElement(this._overflowPlusButton);
  },

  _shutdownFileMenu() {
    this._shutdownMenu("menu_newUserContext");
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
};

// uninstall/install events ---------------------------------------------------

exports.main = function (options) {
  const installation = options.loadReason === "install" ||
                       options.loadReason === "downgrade" ||
                       options.loadReason === "enable" ||
                       options.loadReason === "upgrade";

  // Let's start :)
  ContainerService.init(installation);
};

exports.onUnload = function (reason) {
  if (reason === "disable" ||
      reason === "downgrade" ||
      reason === "uninstall" ||
      reason === "upgrade") {
    ContainerService.uninstall();
  }
};
