const SYNC_DEBUG = true;

const sync = {
  storageArea: {
    area: browser.storage.sync,

    async get(){
      return await this.area.get();
    },

    async set(options) {
      return await this.area.set(options);
    },

    async getDeletedIdentityList() {
      const storedArray = await this.getStoredItem("deletedIdentityList");
      return (storedArray) ?  storedArray : [];
    },

    async getIdentities() {
      const storedArray = await this.getStoredItem("identities");
      return (storedArray) ?  storedArray : [];
    },

    async getDeletedSiteList() { 
      const storedArray = await this.getStoredItem("deletedSiteList");
      return (storedArray) ?  storedArray : [];
    },

    async getCookieStoreIDMap() {
      const storedArray = await this.getStoredItem("cookieStoreIDmap");
      return (storedArray) ?  storedArray : {};
    },

    async getAssignedSites() {
      const storedArray = await this.getStoredItem("assignedSites");
      return (storedArray) ?  storedArray : {};
    },

    async getStoredItem(objectKey) {
      const outputObject = await this.get(objectKey);
      if (outputObject && outputObject[objectKey]) 
        return outputObject[objectKey];
      return false;
    },

    async getAllInstanceInfo() {
      const instanceList = {};
      const allSyncInfo = await this.get();
      for (const objectKey of Object.keys(allSyncInfo)) {
        if (objectKey.includes("MACinstance")) {
          instanceList[objectKey] = allSyncInfo[objectKey]; }
      }
      return instanceList;
    },

    async hasSyncStorage(){
      const inSync = await this.get();
      return !(Object.entries(inSync).length === 0);
    },

    async backup(options) {
      // remove listeners to avoid an infinite loop!
      await sync.checkForListenersMaybeRemove();

      const identities = await updateSyncIdentities();
      await updateCookieStoreIdMap();
      const siteAssignments = await updateSyncSiteAssignments();
      await updateInstanceInfo(identities, siteAssignments);
      if (options && options.uuid) 
        await updateDeletedIdentityList(options.uuid);
      if (options && options.undeleteUUID) 
        await removeFromDeletedIdentityList(options.undeleteUUID);
      if (options && options.siteStoreKey) 
        await addToDeletedSitesList(options.siteStoreKey);
      if (options && options.undeleteSiteStoreKey) 
        await removeFromDeletedSitesList(options.undeleteSiteStoreKey);
      // if (SYNC_DEBUG) {
      //   const storage = await sync.storageArea.get();
      //   console.log("inSync: ", storage);
      //   const localStorage = await browser.storage.local.get();
      //   console.log("inLocal:", localStorage);
      //   console.log("idents: ", await browser.contextualIdentities.query({}));
      // }
      console.log("Backed up!");
      await sync.checkForListenersMaybeAdd();

      async function updateSyncIdentities() {
        const identities = await browser.contextualIdentities.query({});

        for (const identity of identities) {
          delete identity.colorCode;
          delete identity.iconUrl;
          identity.macAddonUUID = await identityState.lookupMACaddonUUID(identity.cookieStoreId);
        }
        await sync.storageArea.set({ identities });
        return identities;
      }

      async function updateCookieStoreIdMap() {
        const cookieStoreIDmap = 
          await identityState.getCookieStoreIDuuidMap();
        await sync.storageArea.set({ cookieStoreIDmap });
      }

      async function updateSyncSiteAssignments() {
        const assignedSites = 
          await assignManager.storageArea.getAssignedSites();
        await sync.storageArea.set({ assignedSites });
        return assignedSites;
      }

      async function updateInstanceInfo(identitiesInput, siteAssignmentsInput) {
        const installUUID = browser.runtime.getURL("")
          .replace(/moz-extension:\/\//, "MACinstance:")
          .replace(/\//, "");
        const identities = [];
        const siteAssignments = [];
        for (const identity of identitiesInput) {
          identities.push(identity.macAddonUUID);
        }
        for (const siteAssignmentKey of Object.keys(siteAssignmentsInput)) {
          siteAssignments.push(siteAssignmentKey);
        }
        await sync.storageArea.set({ [installUUID]: { identities, siteAssignments } });
      }

      async function updateDeletedIdentityList(deletedIdentityUUID) {
        const deletedIdentityList = 
          await sync.storageArea.getDeletedIdentityList();
        if (
          deletedIdentityList.find(element => element === deletedIdentityUUID)
        ) return;
        deletedIdentityList.push(deletedIdentityUUID);
        await sync.storageArea.set({ deletedIdentityList });
      }

      async function removeFromDeletedIdentityList(identityUUID) {
        const deletedIdentityList = 
          await sync.storageArea.getDeletedIdentityList();
        const newDeletedIdentityList = deletedIdentityList
          .filter(element => element !== identityUUID);
        await sync.storageArea.set({ deletedIdentityList: newDeletedIdentityList });
      }

      async function addToDeletedSitesList(siteStoreKey) {
        const deletedSiteList = 
          await sync.storageArea.getDeletedSiteList();
        if (deletedSiteList.find(element => element === siteStoreKey)) return;
        deletedSiteList.push(siteStoreKey);
        await sync.storageArea.set({ deletedSiteList });
      }

      async function removeFromDeletedSitesList(siteStoreKey) {
        const deletedSiteList = 
          await sync.storageArea.getDeletedSiteList();
        const newDeletedSiteList = deletedSiteList
          .filter(element => element !== siteStoreKey);
        await sync.storageArea.set({ deletedSiteList: newDeletedSiteList });
      }
    },

    onChangedListener(changes, areaName) {
      if (areaName === "sync") sync.errorHandledRunSync();
    },

    async addToDeletedList(changeInfo) {
      const identity = changeInfo.contextualIdentity;
      const deletedUUID = 
        await identityState.lookupMACaddonUUID(identity.cookieStoreId);
      await identityState.storageArea.remove(identity.cookieStoreId);
      sync.storageArea.backup({uuid: deletedUUID});
    },

    async dataIsReliable() {
      const cookieStoreIDmap = await this.getCookieStoreIDMap();
      const identities = await this.getIdentities();
      for (const cookieStoreId of Object.keys(cookieStoreIDmap)) {
        const match = identities.find(identity => 
          identity.cookieStoreId === cookieStoreId
        );
        // if one has no match, this is bad data.
        if (!match) return false;
      }
      return !(Object.entries(cookieStoreIDmap).length === 0);
    }
  },

  init() {
    // Add listener to sync storage and containers.
    // Works for all installs that have any sync storage.
    // Waits for sync storage change before kicking off the restore/backup
    // initial sync must be kicked off by user.
    this.checkForListenersMaybeAdd();

  },

  async errorHandledRunSync () {
    await sync.runSync().catch( async (error)=> { 
      console.error("Error from runSync", error);
      await sync.checkForListenersMaybeAdd();
    });
  },

  async checkForListenersMaybeAdd() {
    const hasStorageListener =  
      await browser.storage.onChanged.hasListener(
        sync.storageArea.onChangedListener
      );

    const hasCIListener = await sync.hasContextualIdentityListeners();

    if (!hasCIListener) {
      await sync.addContextualIdentityListeners();
    }

    if (!hasStorageListener) {
      await browser.storage.onChanged.addListener(
        sync.storageArea.onChangedListener);
    }
  },

  async checkForListenersMaybeRemove() {
    const hasStorageListener =  
      await browser.storage.onChanged.hasListener(
        sync.storageArea.onChangedListener
      );

    const hasCIListener = await sync.hasContextualIdentityListeners();
            
    if (hasCIListener) {
      await sync.removeContextualIdentityListeners();
    }

    if (hasStorageListener) {
      await browser.storage.onChanged.removeListener(
        sync.storageArea.onChangedListener);
    }
  },

  async runSync() {
    if (SYNC_DEBUG) {
      const syncInfo = await sync.storageArea.get();
      const localInfo = await browser.storage.local.get();
      const idents = await browser.contextualIdentities.query({});
      console.log("Initial State:", {syncInfo, localInfo, idents});
    }
    await sync.checkForListenersMaybeRemove();
    console.log("runSync");

    await identityState.storageArea.upgradeData();
    await assignManager.storageArea.upgradeData();

    const hasSyncStorage = await sync.storageArea.hasSyncStorage();
    const dataIsReliable = await sync.storageArea.dataIsReliable();
    if (hasSyncStorage && dataIsReliable) await restore();

    await sync.storageArea.backup();
    await removeOldDeletedItems();
    return;
  },

  async addContextualIdentityListeners(listenerList) {
    if(!listenerList) listenerList = syncCIListenerList;
    await browser.contextualIdentities.onCreated.addListener(listenerList[0]);
    await browser.contextualIdentities.onRemoved.addListener(listenerList[1]);
    await browser.contextualIdentities.onUpdated.addListener(listenerList[2]);
  },

  async removeContextualIdentityListeners(listenerList) {
    if(!listenerList) listenerList = syncCIListenerList;
    await browser.contextualIdentities.onCreated.removeListener(listenerList[0]);
    await browser.contextualIdentities.onRemoved.removeListener(listenerList[1]);
    await browser.contextualIdentities.onUpdated.removeListener(listenerList[2]);
  },

  async hasContextualIdentityListeners(listenerList) {
    if(!listenerList) listenerList = syncCIListenerList;
    return (
      await browser.contextualIdentities.onCreated.hasListener(listenerList[0]) &&
      await browser.contextualIdentities.onRemoved.hasListener(listenerList[1]) &&
      await browser.contextualIdentities.onUpdated.hasListener(listenerList[2])
    );
  },

};

sync.init();

async function restore() {
  console.log("restore");
  await reconcileIdentities();
  await reconcileSiteAssignments();
  return;
}

/*
 * Checks for the container name. If it exists, they are assumed to be the
 * same container, and the color and icon are overwritten from sync, if
 * different.
 */
async function reconcileIdentities(){
  console.log("reconcileIdentities");

  // first delete any from the deleted list
  const deletedIdentityList =
    await sync.storageArea.getDeletedIdentityList();
  // first remove any deleted identities
  for (const deletedUUID of deletedIdentityList) {
    const deletedCookieStoreId = 
      await identityState.lookupCookieStoreId(deletedUUID);
    if (deletedCookieStoreId){
      try{
        await browser.contextualIdentities.remove(deletedCookieStoreId);
      } catch (error) {
        // if the identity we are deleting is not there, that's fine.
        console.error("Error deleting contextualIdentity", deletedCookieStoreId);
        continue;
      }
    }
  }

  const localIdentities = await browser.contextualIdentities.query({});
  const syncIdentities = 
    await sync.storageArea.getIdentities();
  const cookieStoreIDmap = 
    await sync.storageArea.getCookieStoreIDMap();
  // now compare all containers for matching names.
  for (const syncIdentity of syncIdentities) {
    syncIdentity.macAddonUUID = cookieStoreIDmap[syncIdentity.cookieStoreId];
    if (syncIdentity.macAddonUUID){
      const localMatch = localIdentities.find(
        localIdentity => localIdentity.name === syncIdentity.name
      );
      if (!localMatch) {
        // if there's no name match found, check on uuid,
        const localCookieStoreID = 
          await identityState.lookupCookieStoreId(syncIdentity.macAddonUUID);
        if (localCookieStoreID) {
          await ifUUIDMatch(syncIdentity, localCookieStoreID);
          continue;
        }
        await ifNoMatch(syncIdentity);
        continue;
      }
      await ifNamesMatch(syncIdentity, localMatch);
      continue;
    }
    // if no macAddonUUID, there is a problem with the sync info and it needs to be ignored.
  }

  await updateSiteAssignmentUUIDs();

  async function updateSiteAssignmentUUIDs(){
    const sites = assignManager.storageArea.getAssignedSites();
    for (const siteKey of Object.keys(sites)) {
      await assignManager.storageArea.set(siteKey, sites[siteKey]);
    }
  }
}

async function ifNamesMatch(syncIdentity, localMatch) {
  // Sync is truth. if there is a match, compare data and update as needed
  if (syncIdentity.color !== localMatch.color 
      || syncIdentity.icon !== localMatch.icon) {
    await browser.contextualIdentities.update(
      localMatch.cookieStoreId, {
        name: syncIdentity.name, 
        color: syncIdentity.color, 
        icon: syncIdentity.icon
      });

    if (SYNC_DEBUG) {
      if (localMatch.color !== syncIdentity.color) {
        console.log(localMatch.name, "Change color: ", syncIdentity.color);
      }
      if (localMatch.icon !== syncIdentity.icon) {
        console.log(localMatch.name, "Change icon: ", syncIdentity.icon);
      }
    }
  }
  // Sync is truth. If all is the same, update the local uuid to match sync
  await identityState.updateUUID(
    localMatch.cookieStoreId, 
    syncIdentity.macAddonUUID
  );

  // TODOkmw: update any site assignment UUIDs
}

async function ifUUIDMatch(syncIdentity, localCookieStoreID) {
  // if there's an identical local uuid, it's the same container. Sync is truth
  const identityInfo = {
    name: syncIdentity.name,
    color: syncIdentity.color, 
    icon: syncIdentity.icon
  };
  if (SYNC_DEBUG) {
    try {
      const getIdent = 
            await browser.contextualIdentities.get(localCookieStoreID);
      if (getIdent.name !== identityInfo.name) {
        console.log(getIdent.name, "Change name: ", identityInfo.name);
      }
      if (getIdent.color !== identityInfo.color) {
        console.log(getIdent.name, "Change color: ", identityInfo.color);
      }
      if (getIdent.icon !== identityInfo.icon) {
        console.log(getIdent.name, "Change icon: ", identityInfo.icon);
      }
    } catch (error) {
      //if this fails, there is probably differing sync info.
      console.error("Error getting info on CI", error);
    }
  }
  try {
  // update the local container with the sync data
    await browser.contextualIdentities
      .update(localCookieStoreID, identityInfo);
    return;
  } catch (error) {
    // If this fails, sync info is off.
    console.error("Error udpating CI", error);
  }
}

async function ifNoMatch(syncIdentity){
  // if no uuid match either, make new identity
  console.log("create new ident: ", syncIdentity.name);
  const newIdentity = 
        await browser.contextualIdentities.create({
          name: syncIdentity.name, 
          color: syncIdentity.color, 
          icon: syncIdentity.icon
        });
  await identityState.updateUUID(
    newIdentity.cookieStoreId, 
    syncIdentity.macAddonUUID
  );
  return;
}
/*
 * Checks for site previously assigned. If it exists, and has the same
 * container assignment, the assignment is kept. If it exists, but has
 * a different assignment, the user is prompted (not yet implemented).
 * If it does not exist, it is created.
 */
async function reconcileSiteAssignments() {
  console.log("reconcileSiteAssignments");
  const assignedSitesLocal = 
    await assignManager.storageArea.getAssignedSites();
  const assignedSitesFromSync = 
    await sync.storageArea.getAssignedSites();
  const deletedSiteList = 
    await sync.storageArea.getDeletedSiteList();
  for(const siteStoreKey of deletedSiteList) {
    if (Object.prototype.hasOwnProperty.call(assignedSitesLocal,siteStoreKey)) {
      assignManager
        .storageArea
        .remove(siteStoreKey.replace(/^siteContainerMap@@_/, "https://"));
    }
  }

  for(const urlKey of Object.keys(assignedSitesFromSync)) {
    const assignedSite = assignedSitesFromSync[urlKey];
    try{
      if (assignedSite.identityMacAddonUUID) {
      // Sync is truth.
      // Not even looking it up. Just overwrite
        if (SYNC_DEBUG){ 
          const isInStorage = await assignManager.storageArea.getByUrlKey(urlKey);
          if (!isInStorage)
            console.log("new assignment ", assignedSite);
        }

        await setAssignmentWithUUID(assignedSite, urlKey);
        continue;
      }
    } catch (error) {
      // this is probably old or incorrect site info in Sync
      // skip and move on.
    }
  }
}

async function removeOldDeletedItems() {
  const instanceList = await sync.storageArea.getAllInstanceInfo();
  const deletedSiteList = await sync.storageArea.getDeletedSiteList();
  const deletedIdentityList = await sync.storageArea.getDeletedIdentityList();
  for (const siteStoreKey of deletedSiteList) {
    let hasMatch = false;
    for (const instance of Object.values(instanceList)) {
      const match = instance.siteAssignments.find(element => element === siteStoreKey);
      if (!match) continue;
      hasMatch = true;
    }
    if (!hasMatch) {
      await sync.storageArea.backup({undeleteSiteStoreKey: siteStoreKey});
    }
  }
  for (const identityUUID of deletedIdentityList) {
    let hasMatch = false;
    for (const instance of Object.values(instanceList)) {
      const match = instance.identities.find(element => element === identityUUID);
      if (!match) continue;
      hasMatch = true;
    }
    if (!hasMatch) {
      await sync.storageArea.backup({undeleteUUID: identityUUID});
    }
  }
}

async function setAssignmentWithUUID (assignedSite, urlKey) {
  const uuid = assignedSite.identityMacAddonUUID;
  const cookieStoreId = await identityState.lookupCookieStoreId(uuid);
  if (cookieStoreId) {
    // eslint-disable-next-line require-atomic-updates
    assignedSite.userContextId = cookieStoreId
      .replace(/^firefox-container-/, "");
    await assignManager.storageArea.set(
      urlKey.replace(/^siteContainerMap@@_/, "https://"),
      assignedSite,
      false,
      false
    );
    return;
  }
  throw new Error (`No cookieStoreId found for: ${uuid}, ${urlKey}`);
}

const syncCIListenerList = [
  sync.storageArea.backup, 
  sync.storageArea.addToDeletedList, 
  sync.storageArea.backup
];
