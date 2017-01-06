/* global require */
const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');
const { Cc, Ci, Cu, Cr } = require('chrome');

Cu.import("resource://gre/modules/Services.jsm");

const tabs = require('sdk/tabs');
const webExtension = require('sdk/webextension');
const { viewFor } = require("sdk/view/core");

/* Let's start enabling Containers */
var prefs = [
  [ "privacy.userContext.enabled", true ],
  [ "privacy.userContext.ui.enabled", true ],
  [ "privacy.usercontext.about_newtab_segregation.enabled", true ],
  [ "privacy.usercontext.longPressBehavior", 1 ]
];

const prefService = require("sdk/preferences/service");
prefs.forEach((pref) => {
  prefService.set(pref[0], pref[1]);
});

const identitiesState = {
};

function convert(identity) {
  let hiddenTabUrls = [];

  if (identity.userContextId in identitiesState) {
    hiddenTabUrls = identitiesState[identity.userContextId].hiddenTabUrls;
  }
  const result = {
    name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
    icon: identity.icon,
    color: identity.color,
    userContextId: identity.userContextId,
    hiddenTabUrls: hiddenTabUrls
  };

  return result;
}

function queryContainers(details) {
  const identities = [];

  ContextualIdentityService.getIdentities().forEach(identity=> {
    if (details && details.name &&
        ContextualIdentityService.getUserContextLabel(identity.userContextId) !== details.name) {
      return;
    }

    const convertedIdentity = convert(identity);

    identities.push(convertedIdentity);
    if (!(convertedIdentity.userContextId in identitiesState)) {
      identitiesState[convertedIdentity.userContextId] = {hiddenTabUrls: []};
    }
  });

  return Promise.resolve(identities);
}

function removeContainer(userContextId) {
  if (!userContextId) {
    return Promise.resolve(null);
  }

  const identity = ContextualIdentityService.getIdentityFromId(userContextId);

  if (!identity) {
    return Promise.resolve(null);
  }

  // We have to create the identity object before removing it.
  const convertedIdentity = convert(identity);

  if (!ContextualIdentityService.remove(identity.userContextId)) {
    return Promise.resolve(null);
  }

  return Promise.resolve(convertedIdentity);
}

function openTab(args) {
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
  return Promise.resolve(true);
}

function queryTabs(args) {
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
}

function removeTabs(ids) {
  for (let tab of tabs) {
    if (ids.indexOf(tab.id) != -1) {
      tab.close();
    }
  }

  return Promise.resolve(null);
}

function handleWebExtensionMessage(message, sender, sendReply) {
  switch (message.method) {
      case 'queryIdentities':
        sendReply(queryContainers(message.arguments));
        break;
      case 'queryTabs':
        sendReply(queryTabs(message));
        break;
      case 'hideTabs':
        identitiesState[message.userContextId].hiddenTabUrls = message.tabUrlsToSave;
        break;
      case 'showTabs':
        sendReply(identitiesState[message.userContextId].hiddenTabUrls);
        identitiesState[message.userContextId].hiddenTabUrls = [];
        break;
      case 'removeTabs':
        sendReply(removeTabs(message.tabIds));
        identitiesState[message.userContextId].hiddenTabUrls = [];
        break;
      case 'getIdentitiesState':
        sendReply(identitiesState);
        break;
      case 'openContainersPreferences':
        tabs.open('about:preferences#containers');
        sendReply({content: 'opened'});
        break;
      case 'openTab':
        sendReply(openTab(message));
        break;
  }
}

webExtension.startup().then(api=> {
  const {browser} = api;

  browser.runtime.onMessage.addListener(handleWebExtensionMessage);
});
