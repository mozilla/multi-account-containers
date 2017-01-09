/* global require */
const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');
const { Cc, Ci, Cu, Cr } = require('chrome');

const tabs = require('sdk/tabs');
const webExtension = require('sdk/webextension');
const { viewFor } = require("sdk/view/core");
var windowUtils = require('sdk/window/utils');
var tabsUtils = require('sdk/tabs/utils');

let ContainerService =
{
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
      'hideTabs',
      'showTabs',
      'sortTabs',
      'openTab',
      'queryIdentities',
      'getIdentity',
    ];

    // Map of identities.
    ContextualIdentityService.getIdentities().forEach(identity => {
      this._identitiesState[identity.userContextId] = {hiddenTabUrls: []};
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
    return {
      name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
      icon: identity.icon,
      color: identity.color,
      userContextId: identity.userContextId,
      hasHiddenTabs: !!this._identitiesState[identity.userContextId].hiddenTabUrls.length,
    };
  },

  // Tabs management

  hideTabs(args) {
    return new Promise((resolve, reject) => {
      for (let tab of tabs) {
        let xulTab = viewFor(tab);
        let userContextId = parseInt(xulTab.getAttribute('usercontextid') || 0, 10);

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

  sortTabs(args) {
    return new Promise((resolve, reject) => {
      let windows = windowUtils.windows('navigator:browser', {includePrivate:false});
      for (let window of windows) {
        let tabs = tabsUtils.getTabs(window);

        let pos = 0;

        // Let's collect UCIs/tabs for this window.
        let map = new Map;
        for (let tab of tabs) {
          if (tabsUtils.isPinned(tab)) {
            // pinned tabs must be consider as taken positions.
            ++pos;
            continue;
          }

          let userContextId = parseInt(tab.getAttribute('usercontextid') || 0, 10);
          if (!map.has(userContextId)) {
            map.set(userContextId, []);
          }
          map.get(userContextId).push(tab);
        }

        // Let's sort the map.
        let sortMap = new Map([...map.entries()].sort((a, b) => a[0] > b[0]));

        // Let's move tabs.
        for (let [userContextId, tabs] of sortMap) {
          for (let tab of tabs) {
            window.gBrowser.moveTabTo(tab, pos++);
          }
        }
      }

      resolve(null);
    });
  },

  openTab(args) {
    return new Promise((resolve, reject) => {
      let browserWin = windowUtils.getMostRecentBrowserWindow();

      // This should not really happen.
      if (!browserWin || !browserWin.gBrowser) {
        return Promise.resolve(false);
      }

      let userContextId = 0;
      if ('userContextId' in args) {
        userContextId = args.userContextId;
      }

      let tab = browserWin.gBrowser.addTab(args.url || null,
                                           { userContextId: userContextId })
      browserWin.gBrowser.selectedTab = tab;
      resolve(true);
    });
  },

  // Identities management

  queryIdentities(args) {
    return new Promise((resolve, reject) => {
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
};

ContainerService.init();
