/* jshint esversion: 8*/
SYNC_DEBUG = true;

const sync = {
  storageArea: {
    area: browser.storage.sync,

    async get(){
      return await this.area.get();
    },

    async set(options) {
      return await this.area.set(options);
    },

    async getStoredArray(objectKey) {
      const storedArray = await this.getStoredItem(objectKey);
      return (storedArray) ?  storedArray : [];
    },

    async getStoredObject(objectKey) {
      const storedObject = await this.getStoredItem(objectKey);
      return (storedObject) ?  storedObject : {};
    },

    async getStoredItem(objectKey) {
      const outputObject = await this.area.get(objectKey);
      console.log(outputObject)
      if (outputObject && outputObject[objectKey]) 
        return outputObject[objectKey];
      if (SYNC_DEBUG) 
        console.warn(objectKey, " was requested and is not available.");
      return false;
    },

    async hasSyncStorage(){
      const inSync = await this.storageArea.get();
      return !(Object.entries(inSync).length === 0);
    },

    async backup(options) {
      console.log("backup");
      // remove listeners to avoid an infinite loop!
      browser.storage.onChanged.removeListener(syncOnChangedListener);
      removeContextualIdentityListeners(syncCIListenerList);

      await updateSyncIdentities();
      await updateCookieStoreIdMap();
      await updateSyncSiteAssignments();
      if (options && options.uuid) 
        await updateDeletedIdentityList(options.uuid);
      if (options && options.siteStoreKey) 
        await addToDeletedSitesList(options.siteStoreKey);
      if (options && options.undelete) 
        await removeFromDeletedSitesList(options.undelete);
      
      if (SYNC_DEBUG) {
        const storage = await sync.storageArea.get();
        console.log("in sync: ", storage);
        const localStorage = await browser.storage.local.get();
        console.log("inLocal:", localStorage);
      }

      await browser.storage.onChanged.addListener(syncOnChangedListener);
      await addContextualIdentityListeners(syncCIListenerList);

      async function updateSyncIdentities() {
        const identities = await browser.contextualIdentities.query({});
        await sync.storageArea.set({ identities });
      }

      async function updateCookieStoreIdMap() {
        const cookieStoreIDmap = 
          await identityState.getCookieStoreIDuuidMap();
        await sync.storageArea.set({ cookieStoreIDmap });
      }

      async function updateSyncSiteAssignments() {
        const assignedSites = await assignManager.storageArea.getAssignedSites();
        await sync.storageArea.set({ assignedSites });
      }

      async function updateDeletedIdentityList(deletedIdentityUUID) {
        let { deletedIdentityList } = 
          await sync.storageArea.get("deletedIdentityList");
        if (!deletedIdentityList) deletedIdentityList = [];
        if (
          deletedIdentityList.find(element => element === deletedIdentityUUID)
        ) return;
        deletedIdentityList.push(deletedIdentityUUID);
        await sync.storageArea.set({ deletedIdentityList });
      }

      async function addToDeletedSitesList(siteStoreKey) {
        let { deletedSiteList } = await sync.storageArea.get("deletedSiteList");
        if (!deletedSiteList) deletedSiteList = [];
        if (deletedSiteList.find(element => element === siteStoreKey)) return;
        deletedSiteList.push(siteStoreKey);
        await sync.storageArea.set({ deletedSiteList });
      }

      async function removeFromDeletedSitesList(siteStoreKey) {
        let { deletedSiteList } = await sync.storageArea.get("deletedSiteList");
        if (!deletedSiteList) return;
        deletedSiteList = deletedSiteList.filter(element => element !== siteStoreKey);
        await sync.storageArea.set({ deletedSiteList });
      }
    },

    async cleanup() {
      console.log("cleanupSync")
      const identitiesList = await sync.storageArea.getStoredObject("identities");
      const cookieStoreIDmap = await sync.storageArea.getStoredObject("cookieStoreIDmap");
      for(const cookieStoreId of Object.keys(cookieStoreIDmap)) {
        const match = identitiesList
          .find(syncIdentity => syncIdentity.cookieStoreId === cookieStoreId);
        if (!match) {
          delete cookieStoreIDmap[cookieStoreId];
          await sync.storageArea.set({ cookieStoreIDmap });
          console.log("removed ", cookieStoreId, " from sync list");
        }
      }
    },
  },

  init() {
    browser.runtime.onInstalled.addListener(this.initSync);
    browser.runtime.onStartup.addListener(this.initSync);
  },

  async initSync() {
    const syncInfo = await sync.storageArea.get();
    const localInfo = await browser.storage.local.get();
    console.log("inSync: ", syncInfo);
    console.log("inLocal: ", localInfo);
    const beenSynced = await assignManager.storageArea.getSynced();
    if (beenSynced){
      runSync();
      return;
    }
    runFirstSync();
  },
};

sync.init();


async function runFirstSync() {
  console.log("runFirstSync");
  await identityState.storageArea.cleanup();
  const localIdentities = await browser.contextualIdentities.query({});
  await addUUIDsToContainers(localIdentities);
  // const inSync = await sync.storageArea.get();
  if (await sync.storageArea.hasSyncStorage()){
    await sync.storageArea.cleanup();
    console.log("storage found, attempting to restore ...");
    await restoreFirstRun();
  }else {
    console.log("no sync storage, backing up...");
    await sync.storageArea.backup();
  }
  await assignManager.storageArea.setSynced();
}

async function addUUIDsToContainers(localIdentities) {
  for (const identity of localIdentities) {
    await identityState.addUUID(identity.cookieStoreId);
  }
}

async function restoreFirstRun() {
  console.log("restoreFirstRun");
  await reconcileIdentitiesByName();
  await reconcileSiteAssignments();
  sync.storageArea.backup();
}

/*
 * Checks for the container name. If it exists, they are assumed to be the
 * same container, and the color and icon are overwritten from sync, if
 * different.
 */
async function reconcileIdentitiesByName(){
  console.log("reconcileIdentitiesByName");
  const localIdentities = await browser.contextualIdentities.query({});
  const syncIdentities = sync.storageArea.getStoredObject("identities");
  const cookieStoreIDmap = sync.storageArea.getStoredObject("cookieStoreIDmap");
  for (const syncIdentity of syncIdentities) {
    syncIdentity.macAddonUUID = cookieStoreIDmap[syncIdentity.cookieStoreId];
    const match = localIdentities.find(localIdentity => localIdentity.name === syncIdentity.name);
    if (!match) {
      console.log("create new ident: ", syncIdentity.name)
      newIdentity = await browser.contextualIdentities.create({name: syncIdentity.name, color: syncIdentity.color, icon: syncIdentity.icon});
      await identityState.updateUUID(newIdentity.cookieStoreId, syncIdentity.macAddonUUID);
      continue;
    }
    if (syncIdentity.color === match.color && syncIdentity.icon === match.icon) {
      identityState.updateUUID(match.cookieStoreId, syncIdentity.macAddonUUID);
      continue;
    }
    if (SYNC_DEBUG) {
      if (match.color !== syncIdentity.color) {console.log(match.name, "Change color: ", syncIdentity.color)}
      if (match.icon !== syncIdentity.icon) {console.log(match.name, "Change icon: ", syncIdentity.icon)}
    }
    // end testing
    await browser.contextualIdentities.update(match.cookieStoreId, {name: syncIdentity.name, color: syncIdentity.color, icon: syncIdentity.icon});
    await identityState.updateUUID(match.cookieStoreId, syncIdentity.macAddonUUID);
  }
}

/*
 * Checks for site previously assigned. If it exists, and has the same
 * container assignment, the assignment is kept. If it exists, but has
 * a different assignment, the user is prompted (not yet implemented).
 * If it does not exist, it is created.
 */
async function reconcileSiteAssignments(inSync) {
  console.log("reconcileSiteAssignments");
  const assignedSitesLocal = await assignManager.storageArea.getAssignedSites();
  const assignedSitesFromSync = await sync.storageArea.getStoredObject("assignedSites");
  const deletedSiteList = await sync.storageArea.getStoredArray("deletedSiteList");
  for(const siteStoreKey of deletedSiteList) {
    if (assignedSitesLocal.hasOwnProperty(siteStoreKey)) {
      assignManager
        .storageArea
        .remove(siteStoreKey.replace(/^siteContainerMap@@_/, "https://"));
    }
  }
  const cookieStoreIDmap =
    await sync.storageArea.getStoredObject("cookieStoreIDmap");

  for(const urlKey of Object.keys(assignedSitesFromSync)) {
    const assignedSite = assignedSitesFromSync[urlKey]
    if (assignedSitesLocal.hasOwnProperty(urlKey)) {
      const syncUUID = 
        lookupSyncSiteAssigmentIdentityUUID(assignedSite, cookieStoreIDmap);

      const localIdentityUUID = 
        lookupLocalSiteAssignmentIdentityUUID(urlKey);

      if (syncUUID === localIdentityUUID) {
        continue;
      }
      // overwrite with Sync data. Sync is the source of truth
      await setAssignmentWithUUID(syncUUID, assignedSite, urlKey);
      continue;
    }
    console.log("new assignment ", assignedSite, ": ", assignedSite.userContextId)
    const newUUID = await inSync.cookieStoreIDmap[
      "firefox-container-" + assignedSite.userContextId
    ];
    await setAssignmentWithUUID(newUUID, assignedSite, urlKey);
  }

  async function lookupLocalSiteAssignmentIdentityUUID(urlKey){
    const localAssignedSite = await assignManager.storageArea.getByUrlKey(urlKey);
    if (!localAssignedSite.userContextId) 
        throw new Error (urlKey, "userContextId does not exist");
    const localCookieStoreId = "firefox-container-" + 
      localAssignedSite.userContextId;
    return await identityState.storageArea.get(localCookieStoreId).macAddonUUID;
  }

  async function lookupSyncSiteAssigmentIdentityUUID(assignedSite, cookieStoreIDmap){
      if (!assignedSite.userContextId) 
        throw new Error (urlKey, "userContextId does not exist");
      const syncCookieStoreId = "firefox-container-" + assignedSite.userContextId;
      if (!cookieStoreIDmap[syncCookieStoreId]) 
        throw new Error (syncCookieStoreId, " does not have a uuid");
      return cookieStoreIDmap[syncCookieStoreId];
  }
}

async function setAssignmentWithUUID (newUUID, assignedSite, urlKey) {
  const cookieStoreId = await identityState.lookupCookieStoreId(newUUID);
  if (cookieStoreId) {
    assignedSite.userContextId = cookieStoreId
      .replace(/^firefox-container-/, "");
    await assignManager.storageArea.set(
      urlKey.replace(/^siteContainerMap@@_/, "https://"),
      assignedSite
    );
    return;
  }
  throw new Error ("No cookieStoreId found for: ", 
      newUUID, assignedSite, urlKey);
}

async function runSync() {
  browser.storage.onChanged.removeListener(syncOnChangedListener);
  removeContextualIdentityListeners(syncCIListenerList);
  console.log("runSync");
  await identityState.storageArea.cleanup();
  const inSync = await sync.storageArea.get();
  await sync.storageArea.cleanup();
  if (Object.entries(inSync).length === 0){
    console.log("no sync storage, backing up...");
    await sync.storageArea.backup();
    return;
  }
  console.log("storage found, attempting to restore ...");
  await restore(inSync);
}

async function restore(inSync) {
  console.log("restore");
  await reconcileIdentitiesByUUID(inSync);
  await reconcileSiteAssignments(inSync);
  await sync.storageArea.backup();
}

function syncOnChangedListener(changes, areaName) {
  if (areaName == "sync") runSync();
}

/*
 * Matches uuids in sync to uuids locally, and updates containers accordingly.
 * If there is no match, it creates the new container.
 */
async function reconcileIdentitiesByUUID(inSync) {
  console.log("reconcileIdentitiesByUUID");
  const syncIdentities = inSync.identities;
  const syncCookieStoreIDmap = inSync.cookieStoreIDmap;
  if (inSync.deletedIdentityList) {
    for (const deletedUUID of inSync.deletedIdentityList) {
      const deletedCookieStoreId = 
        await identityState.lookupCookieStoreId(deletedUUID);
      if (deletedCookieStoreId){
        await browser.contextualIdentities.remove(deletedCookieStoreId);
      }
    }
  }

  for (const syncCookieStoreID of Object.keys(syncCookieStoreIDmap)) {
    const syncUUID = syncCookieStoreIDmap[syncCookieStoreID];
    //find localCookiesStoreID by looking up the syncUUID
    const localCookieStoreID = await identityState.lookupCookieStoreId(syncUUID);
    // get correct indentity info from sync
    identityInfo = findIdentityFromSync(syncCookieStoreID, syncIdentities);
    if (localCookieStoreID) {
      if (SYNC_DEBUG) {
        const getIdent = await browser.contextualIdentities.get(localCookieStoreID);
        if (getIdent.name !== identityInfo.name) {console.log(getIdent.name, "Change name: ", identityInfo.name)}
        if (getIdent.color !== identityInfo.color) {console.log(getIdent.name, "Change color: ", identityInfo.color)}
        if (getIdent.icon !== identityInfo.icon) {console.log(getIdent.name, "Change icon: ", identityInfo.icon)}
      }

      // update the local container with the sync data
      await browser.contextualIdentities.update(localCookieStoreID, identityInfo);
      continue;
    }
    //not found, create new with same UUID
    console.log("new Identity: ", identityInfo.name)
    const newIdentity = await browser.contextualIdentities.create(identityInfo);
    console.log(newIdentity.cookieStoreId)
    await identityState.updateUUID(newIdentity.cookieStoreId, syncUUID);
  }
  return;
}

function findIdentityFromSync(cookieStoreId, identitiesList){
  for (const identity of identitiesList) {
    const { name, color, icon } = identity;
    if (identity.cookieStoreId === cookieStoreId) return { name, color, icon };
  }
}

const syncCIListenerList = [
  sync.storageArea.backup, 
  addToDeletedList, 
  sync.storageArea.backup
];

function addContextualIdentityListeners(listenerList) {
  browser.contextualIdentities.onCreated.addListener(listenerList[0]);
  browser.contextualIdentities.onRemoved.addListener(listenerList[1]);
  browser.contextualIdentities.onUpdated.addListener(listenerList[2]);
}

function removeContextualIdentityListeners(listenerList) {
  browser.contextualIdentities.onCreated.removeListener(listenerList[0]);
  browser.contextualIdentities.onRemoved.removeListener(listenerList[1]);
  browser.contextualIdentities.onUpdated.removeListener(listenerList[2]);
}

async function addToDeletedList(changeInfo) {
  const identity = changeInfo.contextualIdentity;
  console.log("addToDeletedList", identity.cookieStoreId);
  const deletedUUID = 
    await identityState.lookupMACaddonUUID(identity.cookieStoreId);
  await identityState.storageArea.remove(identity.cookieStoreId);
  console.log(deletedUUID);
  backup({uuid: deletedUUID});
}

if(SYNC_DEBUG) {
  browser.resetMAC1 = async function () {
    // for debugging and testing: remove all containers except the
    // default 4 and the first one created
    browser.storage.onChanged.removeListener(syncOnChangedListener);

    // sync state on install: no sync data
    await browser.storage.sync.clear();

    // FF1: no sync, Only default containers and 1 extra
    browser.storage.local.clear();
    const localData = {"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":6,"identitiesState@@_firefox-container-1":{"hiddenTabs":[]},"identitiesState@@_firefox-container-2":{"hiddenTabs":[]},"identitiesState@@_firefox-container-3":{"hiddenTabs":[]},"identitiesState@@_firefox-container-4":{"hiddenTabs":[]},"identitiesState@@_firefox-container-6":{"hiddenTabs":[]},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":true},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":true},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":false}};
    browser.storage.local.set(localData);
  };

  browser.resetMAC2 = async function () {
    // for debugging and testing: remove all containers except the default 4 and the first one created
    browser.storage.onChanged.removeListener(syncOnChangedListener);

    // sync state after FF1 (default + 1)
    await browser.storage.sync.clear();
    const syncData = {"cookieStoreIDmap":{"firefox-container-1":"4dc76734-5b71-4f2e-85d0-1cb199ae3821","firefox-container-2":"30308b8d-393c-4375-b9a1-afc59f0dea79","firefox-container-3":"7419c94d-85d7-4d76-94c0-bacef1de722f","firefox-container-4":"2b9fe881-e552-4df9-8cab-922f4688bb68","firefox-container-6":"db7f622e-682b-4556-968a-6e2542ff3b26"},"assignedSites":{"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}},"identities":[{"name":"Personal","icon":"fingerprint","iconUrl":"resource://usercontext-content/fingerprint.svg","color":"blue","colorCode":"#37adff","cookieStoreId":"firefox-container-1"},{"name":"Work","icon":"briefcase","iconUrl":"resource://usercontext-content/briefcase.svg","color":"orange","colorCode":"#ff9f00","cookieStoreId":"firefox-container-2"},{"name":"Banking","icon":"dollar","iconUrl":"resource://usercontext-content/dollar.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-3"},{"name":"Shopping","icon":"cart","iconUrl":"resource://usercontext-content/cart.svg","color":"pink","colorCode":"#ff4bda","cookieStoreId":"firefox-container-4"},{"name":"Container #01","icon":"chill","iconUrl":"resource://usercontext-content/chill.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-6"}]};
    sync.storageArea.set(syncData);

    // FF2 (intial sync w/ default 4 + 1 with some changes)
    removeContextualIdentityListeners(syncCIListenerList);
    browser.contextualIdentities.update("firefox-container-2", {color:"purple"});
    browser.contextualIdentities.update("firefox-container-4", {icon:"pet"});
    browser.storage.local.clear();
    const localData = {"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":7,"identitiesState@@_firefox-container-1":{"hiddenTabs":[]},"identitiesState@@_firefox-container-2":{"hiddenTabs":[]},"identitiesState@@_firefox-container-3":{"hiddenTabs":[]},"identitiesState@@_firefox-container-4":{"hiddenTabs":[]},"identitiesState@@_firefox-container-6":{"hiddenTabs":[]},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}};
    browser.storage.local.set(localData);

  };

  browser.resetMAC3 = async function () {
    // for debugging and testing: remove all containers except the default 4 and the first one created
    browser.storage.onChanged.removeListener(syncOnChangedListener);

    // sync state after FF2 synced
    await browser.storage.sync.clear();
    const syncData = {"assignedSites":{"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1,"hostname":"developer.mozilla.org"},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0,"hostname":"twitter.com"},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0,"hostname":"www.facebook.com"},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1,"hostname":"www.linkedin.com"},"siteContainerMap@@_reddit.com": {"userContextId": "7","neverAsk": true}},"cookieStoreIDmap":{"firefox-container-1":"4dc76734-5b71-4f2e-85d0-1cb199ae3821","firefox-container-2":"30308b8d-393c-4375-b9a1-afc59f0dea79","firefox-container-3":"7419c94d-85d7-4d76-94c0-bacef1de722f","firefox-container-4":"2b9fe881-e552-4df9-8cab-922f4688bb68","firefox-container-6":"db7f622e-682b-4556-968a-6e2542ff3b26","firefox-container-7":"ceb06672-76c0-48c4-959e-f3a3ee8358b6"},"identities":[{"name":"Personal","icon":"fingerprint","iconUrl":"resource://usercontext-content/fingerprint.svg","color":"blue","colorCode":"#37adff","cookieStoreId":"firefox-container-1"},{"name":"Work","icon":"briefcase","iconUrl":"resource://usercontext-content/briefcase.svg","color":"orange","colorCode":"#ff9f00","cookieStoreId":"firefox-container-2"},{"name":"Banking","icon":"dollar","iconUrl":"resource://usercontext-content/dollar.svg","color":"purple","colorCode":"#af51f5","cookieStoreId":"firefox-container-3"},{"name":"Shopping","icon":"cart","iconUrl":"resource://usercontext-content/cart.svg","color":"pink","colorCode":"#ff4bda","cookieStoreId":"firefox-container-4"},{"name":"Container #01","icon":"chill","iconUrl":"resource://usercontext-content/chill.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-6"},{"name":"Container #02","icon":"vacation","iconUrl":"resource://usercontext-content/vacation.svg","color":"yellow","colorCode":"#ffcb00","cookieStoreId":"firefox-container-7"}]};
    sync.storageArea.set(syncData);

    // FF1 with updates from FF2 (intial sync w/ default 4 + 1 with some changes)
    removeContextualIdentityListeners(syncCIListenerList);
    browser.contextualIdentities.update("firefox-container-3", {color:"purple", icon:"fruit"});
    browser.contextualIdentities.create({name: "Container #02", icon: "vacation", color: "yellow"});
    browser.storage.local.clear();
    const localData = {"beenSynced":!0,"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":7,"identitiesState@@_firefox-container-1":{"hiddenTabs":[],"macAddonUUID":"4dc76734-5b71-4f2e-85d0-1cb199ae3821"},"identitiesState@@_firefox-container-2":{"hiddenTabs":[],"macAddonUUID":"30308b8d-393c-4375-b9a1-afc59f0dea79"},"identitiesState@@_firefox-container-3":{"hiddenTabs":[],"macAddonUUID":"7419c94d-85d7-4d76-94c0-bacef1de722f"},"identitiesState@@_firefox-container-4":{"hiddenTabs":[],"macAddonUUID":"2b9fe881-e552-4df9-8cab-922f4688bb68"},"identitiesState@@_firefox-container-6":{"hiddenTabs":[],"macAddonUUID":"db7f622e-682b-4556-968a-6e2542ff3b26"},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}};
    browser.storage.local.set(localData);

  };

  browser.resetMAC4 = async function () {
    // for debugging and testing: remove all containers except the default 4 and the first one created
    browser.storage.onChanged.removeListener(syncOnChangedListener);

    // sync state after FF2 synced
    await browser.storage.sync.clear();
    const syncData = {"assignedSites":{"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1,"hostname":"developer.mozilla.org"},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0,"hostname":"twitter.com"},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0,"hostname":"www.facebook.com"},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1,"hostname":"www.linkedin.com"},"siteContainerMap@@_reddit.com": {"userContextId": "7","neverAsk": true}},"cookieStoreIDmap":{"firefox-container-1":"4dc76734-5b71-4f2e-85d0-1cb199ae3821","firefox-container-2":"30308b8d-393c-4375-b9a1-afc59f0dea79","firefox-container-3":"7419c94d-85d7-4d76-94c0-bacef1de722f","firefox-container-4":"2b9fe881-e552-4df9-8cab-922f4688bb68","firefox-container-6":"db7f622e-682b-4556-968a-6e2542ff3b26","firefox-container-7":"ceb06672-76c0-48c4-959e-f3a3ee8358b6"},"identities":[{"name":"Personal","icon":"fingerprint","iconUrl":"resource://usercontext-content/fingerprint.svg","color":"blue","colorCode":"#37adff","cookieStoreId":"firefox-container-1"},{"name":"Work","icon":"briefcase","iconUrl":"resource://usercontext-content/briefcase.svg","color":"orange","colorCode":"#ff9f00","cookieStoreId":"firefox-container-2"},{"name":"Banking","icon":"dollar","iconUrl":"resource://usercontext-content/dollar.svg","color":"purple","colorCode":"#af51f5","cookieStoreId":"firefox-container-3"},{"name":"Shopping","icon":"cart","iconUrl":"resource://usercontext-content/cart.svg","color":"pink","colorCode":"#ff4bda","cookieStoreId":"firefox-container-4"},{"name":"Container #01","icon":"chill","iconUrl":"resource://usercontext-content/chill.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-6"},{"name":"Container #02","icon":"vacation","iconUrl":"resource://usercontext-content/vacation.svg","color":"yellow","colorCode":"#ffcb00","cookieStoreId":"firefox-container-7"}]};
    sync.storageArea.set(syncData);

    // FF1 with updates from FF2 (intial sync w/ default 4 + 1 with some changes)
    removeContextualIdentityListeners(syncCIListenerList);
    browser.contextualIdentities.update("firefox-container-3", {color:"purple", icon:"fruit"});
    //browser.contextualIdentities.create({name: "Container #02", icon: "vacation", color: "yellow"});
    browser.storage.local.clear();
    const localData = {"beenSynced":!0,"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":7,"identitiesState@@_firefox-container-1":{"hiddenTabs":[],"macAddonUUID":"4dc76734-5b71-4f2e-85d0-1cb199ae3821"},"identitiesState@@_firefox-container-2":{"hiddenTabs":[],"macAddonUUID":"30308b8d-393c-4375-b9a1-afc59f0dea79"},"identitiesState@@_firefox-container-3":{"hiddenTabs":[],"macAddonUUID":"7419c94d-85d7-4d76-94c0-bacef1de722f"},"identitiesState@@_firefox-container-4":{"hiddenTabs":[],"macAddonUUID":"2b9fe881-e552-4df9-8cab-922f4688bb68"},"identitiesState@@_firefox-container-6":{"hiddenTabs":[],"macAddonUUID":"db7f622e-682b-4556-968a-6e2542ff3b26"},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}};
    browser.storage.local.set(localData);

  };
}