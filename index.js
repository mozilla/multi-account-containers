/* global require */
const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');

const tabs = require('sdk/tabs');
const webExtension = require('sdk/webextension');

const CONTAINER_STORE = 'firefox-container-';

const identitiesState = {
};

function getCookieStoreIdForContainer(containerId) {
  return CONTAINER_STORE + containerId;
}

function convert(identity) {
  const cookieStoreId = getCookieStoreIdForContainer(identity.userContextId);
  let hiddenTabUrls = [];

  if (cookieStoreId in identitiesState) {
    hiddenTabUrls = identitiesState[cookieStoreId].hiddenTabUrls;
  }
  const result = {
    name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
    icon: identity.icon,
    color: identity.color,
    cookieStoreId: cookieStoreId,
    hiddenTabUrls: hiddenTabUrls
  };

  return result;
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
  const identities = [];

  ContextualIdentityService.getIdentities().forEach(identity=> {
    if (details && details.name &&
        ContextualIdentityService.getUserContextLabel(identity.userContextId) !== details.name) {
      return;
    }

    const convertedIdentity = convert(identity);

    identities.push(convertedIdentity);
    if (!(convertedIdentity.cookieStoreId in identitiesState)) {
      identitiesState[convertedIdentity.cookieStoreId] = {hiddenTabUrls: []};
    }
  });

  return Promise.resolve(identities);
}

function createContainer(details) {
  const identity = ContextualIdentityService.create(details.name,
                                                  details.icon,
                                                  details.color);

  return Promise.resolve(convert(identity));
}

function updateContainer(cookieStoreId, details) {
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
        identitiesState[message.cookieStoreId].hiddenTabUrls = message.tabUrlsToSave;
        break;
      case 'show':
        sendReply(identitiesState[message.cookieStoreId].hiddenTabUrls);
        identitiesState[message.cookieStoreId].hiddenTabUrls = [];
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
      case 'getIdentitiesState':
        sendReply(identitiesState);
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
