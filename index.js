/* global require */
const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');
const { Cc, Ci, Cu, Cr } = require('chrome');

Cu.import("resource://gre/modules/Services.jsm");

const tabs = require('sdk/tabs');
const webExtension = require('sdk/webextension');
const { viewFor } = require("sdk/view/core");

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
      'queryTabs',
      'hideTabs',
      'showTabs',
      'removeTabs',
      'openTab',
      'queryIdentities',
      'getIdentitiesState',
    ];

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
    let hiddenTabUrls = [];

    if (identity.userContextId in this._identitiesState) {
      hiddenTabUrls = this._identitiesState[identity.userContextId].hiddenTabUrls;
    }

    return {
      name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
      icon: identity.icon,
      color: identity.color,
      userContextId: identity.userContextId,
      hiddenTabUrls: hiddenTabUrls
    };
  },

  // Tabs management

  queryTabs(args) {
    return new Promise((resolve, reject) => {
      let tabList = [];

      for (let tab of tabs) {
        let xulTab = viewFor(tab);
        let userContextId = parseInt(xulTab.getAttribute('usercontextid') || 0, 10);

        if ("userContextId" in args && args.userContextId != userContextId) {
          continue;
        }

        tabList.push({
          id: tab.id,
          url: tab.url,
          userContextId: userContextId,
        });
      }

      resolve(tabList);
    });
  },

  hideTabs(args) {
    this._identitiesState[args.userContextId].hiddenTabUrls = args.tabUrlsToSave;
    return Promise.resolve(null);
  },

  showTabs(args) {
    return new Promise((resolve, reject) => {
      let hiddenTabUrls = this._identitiesState[args.userContextId].hiddenTabUrls;
      this._identitiesState[args.userContextId].hiddenTabUrls = [];
      resolve(hiddenTabUrls);
    });
  },

  removeTabs(args) {
    return new Promise((resolve, reject) => {
      for (let tab of tabs) {
        if (args.tabIds.indexOf(tab.id) != -1) {
          tab.close();
        }
      }
      resolve(null);
    });
  },

  openTab(args) {
    return new Promise((resolve, reject) => {
      let browserWin = Services.wm.getMostRecentWindow('navigator:browser');

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
        if (!(convertedIdentity.userContextId in this._identitiesState)) {
          this._identitiesState[convertedIdentity.userContextId] = {hiddenTabUrls: []};
        }
      });

      resolve(identities);
    });
  },

  getIdentitiesState(args) {
    return Promise.resolve(this._identitiesState);
  },
};

ContainerService.init();
