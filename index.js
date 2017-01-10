const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/* global require */

const { attachTo } = require("sdk/content/mod");
const {ContextualIdentityService} = require("resource://gre/modules/ContextualIdentityService.jsm");
const self = require("sdk/self");
const { Style } = require("sdk/stylesheet/style");
const tabs = require("sdk/tabs");
const tabsUtils = require("sdk/tabs/utils");
const { viewFor } = require("sdk/view/core");
const webExtension = require("sdk/webextension");
const windows = require("sdk/windows");
const windowUtils = require("sdk/window/utils");

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
      "openTab",
      "queryIdentities",
      "getIdentity",
    ];

    // Map of identities.
    ContextualIdentityService.getIdentities().forEach(identity => {
      this._identitiesState[identity.userContextId] = {
        hiddenTabUrls: [],
        openTabs: 0,
      };
    });

    // It can happen that this jsm is loaded after the opening a container tab.
    for (let tab of tabs) {
      let xulTab = viewFor(tab);
      let userContextId = parseInt(xulTab.getAttribute("usercontextid") || 0, 10);
      if (userContextId) {
        ++this._identitiesState[userContextId].openTabs;
      }
    }

    tabs.on("open", tab => {
      let xulTab = viewFor(tab);
      let userContextId = parseInt(xulTab.getAttribute("usercontextid") || 0, 10);
      if (userContextId) {
        ++this._identitiesState[userContextId].openTabs;
      }
    });

    tabs.on("close", tab => {
      let xulTab = viewFor(tab);
      let userContextId = parseInt(xulTab.getAttribute("usercontextid") || 0, 10);
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
        if ("method" in message && methods.indexOf(message.method) != -1) {
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

    if (identity.icon == "fingerprint" ||
        identity.icon == "chrome://browser/skin/usercontext/personal.svg") {
      image = "fingerprint";
    } else if (identity.icon == "briefcase" ||
             identity.icon == "chrome://browser/skin/usercontext/work.svg") {
      image = "briefcase";
    } else if (identity.icon == "dollar" ||
             identity.icon == "chrome://browser/skin/usercontext/banking.svg") {
      image = "dollar";
    } else if (identity.icon == "cart" ||
             identity.icon == "chrome://browser/skin/usercontext/shopping.svg") {
      image = "cart";
    } else {
      image = "circle";
    }

    if (identity.color == "#00a7e0") {
      color = "blue";
    } else if (identity.color == "#f89c24") {
      color = "orange";
    } else if (identity.color == "#7dc14c") {
      color = "green";
    } else if (identity.color == "#ee5195") {
      color = "pink";
    } else if (["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"].indexOf(identity.color) != -1) {
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
      hasOpenTabs: !!this._identitiesState[identity.userContextId].openTabs,
    };
  },

  // Tabs management

  hideTabs(args) {
    return new Promise(resolve => {
      for (let tab of tabs) {
        let xulTab = viewFor(tab);
        let userContextId = parseInt(xulTab.getAttribute("usercontextid") || 0, 10);

        if ("userContextId" in args && args.userContextId != userContextId) {
          continue;
        }

        this._identitiesState[args.userContextId].hiddenTabUrls.push(tab.url);
        tab.close();
      }

      resolve(null);
    });
  },

  showTabs(args) {
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
        // From model to XUL window.
        window = viewFor(window);

        let tabs = tabsUtils.getTabs(window);

        let pos = 0;

        // Let"s collect UCIs/tabs for this window.
        let map = new Map;
        for (let tab of tabs) {
          if (tabsUtils.isPinned(tab)) {
            // pinned tabs must be consider as taken positions.
            ++pos;
            continue;
          }

          let userContextId = parseInt(tab.getAttribute("usercontextid") || 0, 10);
          if (!map.has(userContextId)) {
            map.set(userContextId, []);
          }
          map.get(userContextId).push(tab);
        }

        // Let"s sort the map.
        let sortMap = new Map([...map.entries()].sort((a, b) => a[0] > b[0]));

        // Let"s move tabs.
        sortMap.forEach(tabs => {
          for (let tab of tabs) {
            window.gBrowser.moveTabTo(tab, pos++);
          }
        });
      }

      resolve(null);
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
    let identity = ContextualIdentityService.getIdentityFromId(args.userContextId);
    return Promise.resolve(identity ? this._convert(identity) : null);
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
  },
};

ContainerService.init();
