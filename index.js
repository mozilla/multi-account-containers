/* global require */
const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');

const tabs = require('sdk/tabs');
const windows = require('sdk/windows');
const webExtension = require('sdk/webextension');

const CONTAINER_STORE = 'firefox-container-';

function getCookieStoreIdForContainer(containerId) {
  return CONTAINER_STORE + containerId;
}

function convert(identity) {
  const result = {
    name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
    icon: identity.icon,
    color: identity.color,
    cookieStoreId: getCookieStoreIdForContainer(identity.userContextId)
  };

  return result;
}

function query(queryInfo) {

  function matches(window, tab) {
    if (queryInfo.cookieStoreId !== null &&
        tab.cookieStoreId !== queryInfo.cookieStoreId) {
      return false;
    }

    return true;
  }

  const result = [];

  for (const window of windows.browserWindows) {
    for (const tab of tabs) {
      if (matches(window, tab)) {
        result.push(tab);
      }
    }
  }

  return Promise.resolve(result);
}

function hideContainerTabs(cookieStoreId) {
  query({cookieStoreId}).then(containerTabs=> {
    containerTabs.forEach(tab=> {
      gBrowser.hideTab(tab);
    });
  })
  .catch(e=> {
    throw e;
  });
}

function showContainterTabs(cookieStoreId) {
  query({cookieStoreId}).then(containerTabs=> {
    containerTabs.forEach(tab=> {
      gBrowser.showTab(tab);
    });
  });
}

function isContainerCookieStoreId(storeId) {
  return storeId !== null && storeId.startsWith(CONTAINER_STORE);
}

function getContainerForCookieStoreId(storeId) {
  if (!isContainerCookieStoreId(storeId)) {
    return null;
  }

  const containerId = storeId.substring(CONTAINER_STORE.length);

  if (ContextualIdentityService.getIdentityFromId(containerId)) {
    return parseInt(containerId, 10);
  }

  return null;
}

function getContainer(cookieStoreId) {
  const containerId = getContainerForCookieStoreId(cookieStoreId);

  if (!containerId) {
    return Promise.resolve(null);
  }

  const identity = ContextualIdentityService.getIdentityFromId(containerId);

  return Promise.resolve(convert(identity));
}

function queryContainers(details) {
  console.log('queryContainers, details: ', details);
  const identities = [];

  ContextualIdentityService.getIdentities().forEach(identity=> {
    if (details && details.name &&
        ContextualIdentityService.getUserContextLabel(identity.userContextId) !== details.name) {
      return;
    }

    identities.push(convert(identity));
  });

  return Promise.resolve(identities);
}

function createContainer(details) {
  console.log('createContainer, details: ', details);
  const identity = ContextualIdentityService.create(details.name,
                                                  details.icon,
                                                  details.color);

  return Promise.resolve(convert(identity));
}

function updateContainer(cookieStoreId, details) {
  console.log(`updateContainer, cookieStoreId: ${cookieStoreId}, details: ${details}`);
  const containerId = getContainerForCookieStoreId(cookieStoreId);

  if (!containerId) {
    return Promise.resolve(null);
  }

  const identity = ContextualIdentityService.getIdentityFromId(containerId);

  if (!identity) {
    return Promise.resolve(null);
  }

  if (details.name !== null) {
    identity.name = details.name;
  }

  if (details.color !== null) {
    identity.color = details.color;
  }

  if (details.icon !== null) {
    identity.icon = details.icon;
  }

  if (!ContextualIdentityService.update(identity.userContextId,
                                        identity.name, identity.icon,
                                        identity.color)) {
    return Promise.resolve(null);
  }

  return Promise.resolve(convert(identity));
}

function removeContainer(cookieStoreId) {
  console.log(`removeContainer, cookieStoreId: ${cookieStoreId}`);
  const containerId = getContainerForCookieStoreId(cookieStoreId);

  if (!containerId) {
    return Promise.resolve(null);
  }

  const identity = ContextualIdentityService.getIdentityFromId(containerId);

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

const contextualIdentities = {
  hide: hideContainerTabs,
  show: showContainterTabs,
  get: getContainer,
  query: queryContainers,
  create: createContainer,
  update: updateContainer,
  remove: removeContainer
};

function handleWebExtensionMessage(message, sender, sendReply) {
  switch (message.method) {
      case 'query':
        sendReply(contextualIdentities.query(message.arguments));
        break;
      case 'hide':
        sendReply(contextualIdentities.hide(message.arguments));
        break;
      case 'show':
        sendReply(contextualIdentities.show(message.arguments));
        break;
      case 'get':
        sendReply(contextualIdentities.get(message.arguments));
        break;
      case 'create':
        sendReply(contextualIdentities.create(message.arguments));
        break;
      case 'update':
        sendReply(contextualIdentities.update(message.arguments));
        break;
      case 'remove':
        sendReply(contextualIdentities.remove(message.arguments));
        break;
      case 'open-containers-preferences':
        tabs.open('about:preferences#containers');
        sendReply({content: 'opened'});
        break;
  }
}

webExtension.startup().then(api=> {
  const {browser} = api;

  browser.runtime.onMessage.addListener(handleWebExtensionMessage);
});
