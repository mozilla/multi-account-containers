/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const { attachTo } = require("sdk/content/mod");
const { ContextualIdentityService } = require("resource://gre/modules/ContextualIdentityService.jsm");
const { getFavicon } = require("sdk/places/favicon");
const self = require("sdk/self");
const { Style } = require("sdk/stylesheet/style");
const tabs = require("sdk/tabs");
const tabsUtils = require("sdk/tabs/utils");
const { viewFor } = require("sdk/view/core");
const webExtension = require("sdk/webextension");
const windows = require("sdk/windows");
const windowUtils = require("sdk/window/utils");

const IDENTITY_COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];

let ContainerService = {
  _identitiesState: {},

  init() {
    // Enabling preferences

    let prefs = [
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
    let methods = [
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
    for (let tab of tabs) {
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
    });

    tabs.on("close", tab => {
      const userContextId = this._getUserContextIdFromTab(tab);
      if (userContextId && this._identitiesState[userContextId].openTabs) {
        --this._identitiesState[userContextId].openTabs;
      }
    });

    // Modify CSS and other stuff for each window.

    for (let window of windows.browserWindows) {
      this.configureWindow(viewFor(window));
    }

    windows.browserWindows.on("open", window => {
      this.configureWindow(viewFor(window));
    });

    // WebExtension startup

    webExtension.startup().then(api => {
      api.browser.runtime.onMessage.addListener((message, sender, sendReply) => {
        if ("method" in message && methods.indexOf(message.method) !== -1) {
          sendReply(this[message.method](message));
        }
      });
    });
  },

  // utility methods

  _convert(identity) {
    // In FF 50-51, the icon is the full path, in 52 and following
    // releases, we have IDs to be used with a svg file. In this function
    // we map URLs to svg IDs.
    let image, color;

    if (identity.icon === "fingerprint" ||
        identity.icon === "chrome://browser/skin/usercontext/personal.svg") {
      image = "fingerprint";
    } else if (identity.icon === "briefcase" ||
             identity.icon === "chrome://browser/skin/usercontext/work.svg") {
      image = "briefcase";
    } else if (identity.icon === "dollar" ||
             identity.icon === "chrome://browser/skin/usercontext/banking.svg") {
      image = "dollar";
    } else if (identity.icon === "cart" ||
             identity.icon === "chrome://browser/skin/usercontext/shopping.svg") {
      image = "cart";
    } else {
      image = "circle";
    }

    if (identity.color === "#00a7e0") {
      color = "blue";
    } else if (identity.color === "#f89c24") {
      color = "orange";
    } else if (identity.color === "#7dc14c") {
      color = "green";
    } else if (identity.color === "#ee5195") {
      color = "pink";
    } else if (IDENTITY_COLORS.indexOf(identity.color) !== -1) {
      color = identity.color;
    } else {
      color = "";
    }

    return {
      name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
      image,
      color,
      userContextId: identity.userContextId,
      hasHiddenTabs: !!this._identitiesState[identity.userContextId].hiddenTabUrls.length,
      hasOpenTabs: !!this._identitiesState[identity.userContextId].openTabs
    };
  },

  _getUserContextIdFromTab(tab) {
    return parseInt(viewFor(tab).getAttribute("usercontextid") || 0, 10);
  },

  _getTabList(userContextId) {
    let list = [];
    for (let tab of tabs) {
      if (userContextId === this._getUserContextIdFromTab(tab)) {
        let object = { title: tab.title, url: tab.url, id: tab.id };
        list.push(object);
      }
    }

    return list;
  },

  // Tabs management

  hideTabs(args) {
    return new Promise((resolve, reject) => {
      if (!("userContextId" in args)) {
        reject("hideTabs must be called with userContextId argument.");
        return;
      }

      for (let tab of tabs) {
        if (args.userContextId !== this._getUserContextIdFromTab(tab)) {
          continue;
        }

        this._identitiesState[args.userContextId].hiddenTabUrls.push(tab.url);
        tab.close();
      }

      resolve(null);
    });
  },

  showTabs(args) {
    if (!("userContextId" in args)) {
      Promise.reject("showTabs must be called with userContextId argument.");
      return;
    }

    let promises = [];

    for (let url of this._identitiesState[args.userContextId].hiddenTabUrls) {
      promises.push(this.openTab({ userContextId: args.userContextId, url }));
    }

    this._identitiesState[args.userContextId].hiddenTabUrls = [];

    return Promise.all(promises);
  },

  sortTabs() {
    return new Promise(resolve => {
      for (let window of windows.browserWindows) {
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
    let map = new Map;
    for (let tab of tabs) {
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
      for (let tab of tabs) {
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

      const list = this._getTabList(args.userContextId);
      let promises = [];

      for (let object of list) {
        promises.push(getFavicon(object.url).then(url => {
          object.favicon = url;
        }, () => {
          object.favicon = "";
        }));
      }

      Promise.all(promises).then(() => {
        resolve(list);
      });
    });
  },

  showTab(args) {
    return new Promise((resolve, reject) => {
      if (!("tabId" in args)) {
        reject("showTab must be called with tabId argument.");
        return;
      }

      for (let tab of tabs) {
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

      // Let"s create a list of the tabs.
      const list = this._getTabList(args.userContextId);

      // Nothing to do
      if (list.length === 0) {
        resolve(null);
        return;
      }

      windows.browserWindows.open({
        url: "about:blank",
        onOpen: window => {
          const newBrowserWindow = viewFor(window);

          // Let's move the tab to the new window.
          for (let tab of list) {
            const newTab = newBrowserWindow.gBrowser.addTab("about:blank");
            newBrowserWindow.gBrowser.swapBrowsersAndCloseOther(newTab, tab);
            // swapBrowsersAndCloseOther is an internal method of gBrowser
            // an it's not supported by addon SDK. This means that we
            // don't receive an 'open' event, but only the 'close' one.
            // We have to force a +1 in our tab counter.
            ++this._identitiesState[args.userContextId].openTabs;
          }

          // Let's close all the normal tab in the new window. In theory it
          // should be only the first tab, but maybe there are addons doing
          // crazy stuff.
          for (let tab of window.tabs) {
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
      let browserWin = windowUtils.getMostRecentBrowserWindow();

      // This should not really happen.
      if (!browserWin || !browserWin.gBrowser) {
        return Promise.resolve(false);
      }

      let userContextId = 0;
      if ("userContextId" in args) {
        userContextId = args.userContextId;
      }

      let tab = browserWin.gBrowser.addTab(args.url || null, { userContextId });
      browserWin.gBrowser.selectedTab = tab;
      resolve(true);
    });
  },

  // Identities management

  queryIdentities() {
    return new Promise(resolve => {
      let identities = [];

      ContextualIdentityService.getIdentities().forEach(identity => {
        let convertedIdentity = this._convert(identity);
        identities.push(convertedIdentity);
      });

      resolve(identities);
    });
  },

  getIdentity(args) {
    if (!("userContextId" in args)) {
      Promise.reject("getIdentity must be called with userContextId argument.");
      return;
    }

    let identity = ContextualIdentityService.getIdentityFromId(args.userContextId);
    return Promise.resolve(identity ? this._convert(identity) : null);
  },

  createIdentity(args) {
    for (let arg of [ "name", "color", "icon"]) {
      if (!(arg in args)) {
        Promise.reject("createIdentity must be called with " + arg + " argument.");
        return;
      }
    }

    // FIXME: icon and color conversion based on FF version.
    const identity = ContextualIdentityService.create(args.name, args.icon, args.color);

    this._identitiesState[identity.userContextId] = {
      hiddenTabUrls: [],
      openTabs: 0
    };

    return Promise.resolve(this._convert(identity));
  },

  updateIdentity(args) {
    if (!("userContextId" in args)) {
      Promise.reject("updateIdentity must be called with userContextId argument.");
      return;
    }

    let identity = ContextualIdentityService.getIdentityFromId(args.userContextId);
    for (let arg of [ "name", "color", "icon"]) {
      if ((arg in args)) {
        identity[arg] = args[arg];
      }
    }

    // FIXME: icon and color conversion based on FF version.
    // FIXME: color/name update propagation
    return Promise.resolve(ContextualIdentityService.update(args.userContextId,
                                                            identity.name,
                                                            identity.icon,
                                                            identity.color));
  },

  removeIdentity(args) {
    if (!("userContextId" in args)) {
      Promise.reject("removeIdentity must be called with userContextId argument.");
      return;
    }
    return Promise.resolve(ContextualIdentityService.remove(args.userContextId));
  },

  // Styling the window

  configureWindow(window) {
    var tabsElement = window.document.getElementById("tabbrowser-tabs");
    var button = window.document.getAnonymousElementByAttribute(tabsElement, "anonid", "tabs-newtab-button");

    while (button.firstChild) {
      button.removeChild(button.firstChild);
    }

    button.setAttribute("type", "menu");
    let popup = window.document.createElementNS(XUL_NS, "menupopup");

    popup.setAttribute("anonid", "newtab-popup");
    popup.className = "new-tab-popup";
    popup.setAttribute("position", "after_end");

    ContextualIdentityService.getIdentities().forEach(identity => {
      identity = this._convert(identity);

      var menuItem = window.document.createElementNS(XUL_NS, "menuitem");
      menuItem.setAttribute("class", "menuitem-iconic");
      menuItem.setAttribute("label", identity.name);
      menuItem.setAttribute("image", self.data.url("usercontext.svg") + "#" + identity.image);

      menuItem.addEventListener("command", (event) => {
        this.openTab({userContextId: identity.userContextId});
        event.stopPropagation();
      });

      popup.appendChild(menuItem);
    });

    button.appendChild(popup);
    let style = Style({ uri: self.data.url("chrome.css") });

    attachTo(style, viewFor(window));
  }
};

ContainerService.init();
