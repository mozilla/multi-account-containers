/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

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

const { attachTo } = require("sdk/content/mod");
const { ContextualIdentityService } = require("resource://gre/modules/ContextualIdentityService.jsm");
const { getFavicon } = require("sdk/places/favicon");
const { modelFor } = require("sdk/model/core");
const self = require("sdk/self");
const { Style } = require("sdk/stylesheet/style");
const tabs = require("sdk/tabs");
const tabsUtils = require("sdk/tabs/utils");
const { viewFor } = require("sdk/view/core");
const webExtension = require("sdk/webextension");
const windows = require("sdk/windows");
const windowUtils = require("sdk/window/utils");
const shortcuts = require("shortcuts");

// ----------------------------------------------------------------------------
// ContainerService

const ContainerService = {
  _identitiesState: {},
  _windowMap: {},

  init() {
    // Enabling preferences

    const prefs = [
      [ "privacy.userContext.enabled", true ],
      [ "privacy.userContext.ui.enabled", true ],
      [ "privacy.usercontext.about_newtab_segregation.enabled", true ],
      [ "privacy.usercontext.longPressBehavior", 1 ]
    ];

    const prefService = require("sdk/preferences/service");
    prefs.forEach((pref) => {
      prefService.set(pref[0], pref[1]);
    });

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
    ];

    // Map of identities.
    ContextualIdentityService.getIdentities().forEach(identity => {
      this._identitiesState[identity.userContextId] = {
        hiddenTabUrls: [],
        openTabs: 0
      };
    });

    // It can happen that this jsm is loaded after the opening a container tab.
    for (let tab of tabs) { // eslint-disable-line prefer-const
      const userContextId = this._getUserContextIdFromTab(tab);
      if (userContextId) {
        ++this._identitiesState[userContextId].openTabs;
      }
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
  },

  // utility methods

  _convert(identity) {
    // Let's convert the known colors to their color names.
    return {
      name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
      image: this._fromIconToName(identity.icon),
      color: this._fromColorToName(identity.color),
      userContextId: identity.userContextId,
      hasHiddenTabs: !!this._identitiesState[identity.userContextId].hiddenTabUrls.length,
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

  // Tabs management

  hideTabs(args) {
    return new Promise((resolve, reject) => {
      if (!("userContextId" in args)) {
        reject("hideTabs must be called with userContextId argument.");
        return;
      }

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

        this._identitiesState[args.userContextId].hiddenTabUrls.push(object);
        tab.close();
      });

      resolve(null);
    });
  },

  showTabs(args) {
    if (!("userContextId" in args)) {
      return Promise.reject("showTabs must be called with userContextId argument.");
    }

    const promises = [];

    for (let object of this._identitiesState[args.userContextId].hiddenTabUrls) { // eslint-disable-line prefer-const
      promises.push(this.openTab({ userContextId: args.userContextId, url: object.url }));
    }

    this._identitiesState[args.userContextId].hiddenTabUrls = [];

    return Promise.all(promises);
  },

  sortTabs() {
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
    return new Promise((resolve, reject) => {
      if (!("userContextId" in args)) {
        reject("getTabs must be called with userContextId argument.");
        return;
      }

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
        resolve(list.concat(this._identitiesState[args.userContextId].hiddenTabUrls));
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
    return new Promise(resolve => {
      const browserWin = windowUtils.getMostRecentBrowserWindow();

      // This should not really happen.
      if (!browserWin || !browserWin.gBrowser) {
        return Promise.resolve(false);
      }

      let userContextId = 0;
      if ("userContextId" in args) {
        userContextId = args.userContextId;
      }

      const tab = browserWin.gBrowser.addTab(args.url || null, { userContextId });
      browserWin.gBrowser.selectedTab = tab;
      resolve(true);
    });
  },

  // Identities management

  queryIdentities() {
    return new Promise(resolve => {
      const identities = [];

      ContextualIdentityService.getIdentities().forEach(identity => {
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
    for (let arg of [ "name", "color", "icon"]) { // eslint-disable-line prefer-const
      if (!(arg in args)) {
        return Promise.reject("createIdentity must be called with " + arg + " argument.");
      }
    }

    const color = this._fromNameToColor(args.color);
    const icon = this._fromNameToIcon(args.icon);

    const identity = ContextualIdentityService.create(args.name, icon, color);

    this._identitiesState[identity.userContextId] = {
      hiddenTabUrls: [],
      openTabs: 0
    };

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

    this._containerTabIterator(args.userContextId, tab => {
      tab.close();
    });

    const removed = ContextualIdentityService.remove(args.userContextId);

    this._refreshNeeded().then(() => {
      return removed;
    }).catch(() => {
      return removed;
    });
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
    const id = windowUtils.getInnerId(window);
    if (!(id in this._windowMap)) {
      this._windowMap[id] = new ContainerWindow(window);
    }

    return this._windowMap[id].configure();
  },

  closeWindow(window) {
    const id = windowUtils.getInnerId(window);
    delete this._windowMap[id];
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
};

// ----------------------------------------------------------------------------
// ContainerWindow

// This object is used to configure a single window.
function ContainerWindow(window) {
  this._init(window);
}

ContainerWindow.prototype = {
  _window: null,
  _panelElement: null,
  _timeoutId: 0,

  _init(window) {
    this._window = window;
    this._newTabShortcut = new shortcuts.NewTabShortcut(window);
    const style = Style({ uri: self.data.url("usercontext.css") });
    attachTo(style, this._window);
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

  _configurePlusButtonMenu() {
    const tabsElement = this._window.document.getElementById("tabbrowser-tabs");

    const mainPopupSetElement = this._window.document.getElementById("mainPopupSet");
    const button = this._window.document.getAnonymousElementByAttribute(tabsElement, "anonid", "tabs-newtab-button");
    const overflowButton = this._window.document.getElementById("new-tab-button");

    // Let's remove the tooltip because it can go over our panel.
    button.setAttribute("tooltip", "");
    overflowButton.setAttribute("tooltip", "");

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

    const showPopup = (buttonElement) => {
      this._cleanTimeout();
      this._panelElement.openPopup(buttonElement);
    };

    const mouseoutHandle = (e) => {
      let el = e.target;
      while(el) {
        if (el === this._panelElement ||
            el === button ||
            el === overflowButton) {
          this._createTimeout();
          return;
        }
        el = el.parentElement;
      }
    };

    this._window.showPopup = showPopup;

    [button, overflowButton].forEach((buttonElement) => {
      buttonElement.addEventListener("mouseover", () => {
        showPopup(buttonElement);
      });
      buttonElement.addEventListener("click", () => {
        this.hidePanel();
      });
      buttonElement.addEventListener("mouseout", mouseoutHandle);
    });

    this._panelElement.addEventListener("mouseout", mouseoutHandle);

    this._panelElement.addEventListener("mouseover", () => {
      this._cleanTimeout();
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
          ContainerService.openTab({userContextId: identity.userContextId});
          e.stopPropagation();
        });

        menuItemElement.addEventListener("mouseover", () => {
          this._cleanTimeout();
        });

        menuItemElement.addEventListener("mouseout", mouseoutHandle);

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
      ContainerService.openTab({ userContextId });
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
    // containerAddonMagic attribute is a custom attribute we set in order to
    // know if this menu has been already converted.
    if (!menu || menu.hasAttribute("containerAddonMagic")) {
      return Promise.reject(null);
    }

    // We don't want to recreate the menu each time.
    menu.setAttribute("containerAddonMagic", "42");

    while (menu.firstChild) {
      menu.firstChild.remove();
    }

    const menupopup = this._window.document.createElementNS(XUL_NS, "menupopup");
    menu.appendChild(menupopup);

    menupopup.addEventListener("command", clickCb);
    menupopup.addEventListener("popupshowing", e => {
      return this._createMenu(e, excludedContainerCb);
    });

    return Promise.resolve(null);
  },

  _createMenu(event, excludedContainerCb) {
    while (event.target.hasChildNodes()) {
      event.target.removeChild(event.target.firstChild);
    }

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

      event.target.appendChild(fragment);
    }).catch(() => {});

    return true;
  },

  // This timer is used to hide the panel auto-magically if it's not used in
  // the following X seconds. This is need to avoid the leaking of the panel
  // when the mouse goes out of of the 'plus' button.
  _createTimeout() {
    this._cleanTimeout();
    this._timeoutId = this._window.setTimeout(() => {
      this.hidePanel();
      this._timeoutId = 0;
    }, HIDE_MENU_TIMEOUT);
  },

  _cleanTimeout() {
    if (this._timeoutId) {
      this._window.clearTimeout(this._timeoutId);
      this._timeoutId = 0;
    }
  },

  hidePanel() {
    this._cleanTimeout();
    this._panelElement.hidePopup();
  },
};

// ----------------------------------------------------------------------------
// Let's start :)
ContainerService.init();
