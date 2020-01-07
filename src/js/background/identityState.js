const identityState = {
  storageArea: {
    area: browser.storage.local,

    getContainerStoreKey(cookieStoreId) {
      const storagePrefix = "identitiesState@@_";
      return `${storagePrefix}${cookieStoreId}`;
    },

    async get(cookieStoreId) {
      const storeKey = this.getContainerStoreKey(cookieStoreId);
      const storageResponse = await this.area.get([storeKey]);
      if (storageResponse && storeKey in storageResponse) {
        if (!storageResponse[storeKey].macAddonUUID){
          await identityState.addUUID(cookieStoreId);
          return this.get(cookieStoreId);
        }
        return storageResponse[storeKey];
      }
      const identities = await browser.contextualIdentities.query({});
      const match = identities.find(
        (identity) => identity.cookieStoreId === cookieStoreId);
      if (match) {
        const defaultContainerState = identityState._createIdentityState();
        await this.set(cookieStoreId, defaultContainerState);
        return defaultContainerState;
      }
      throw new Error (`${cookieStoreId} not found`);
    },

    set(cookieStoreId, data) {
      const storeKey = this.getContainerStoreKey(cookieStoreId);
      return this.area.set({
        [storeKey]: data
      });
    },

    async remove(cookieStoreId) {
      const storeKey = this.getContainerStoreKey(cookieStoreId);
      return await this.area.remove([storeKey]);
    },
    async cleanup() {
      const identitiesList = await browser.contextualIdentities.query({});
      const macConfigs = await this.area.get();
      for(const configKey of Object.keys(macConfigs)) {
        if (configKey.includes("identitiesState@@_")) {
          const cookieStoreId = String(configKey).replace(/^identitiesState@@_/, "");
          const match = identitiesList.find(localIdentity => localIdentity.cookieStoreId === cookieStoreId);
          if (!match && cookieStoreId !== "firefox-default") {
            console.log("removed ", cookieStoreId, " from storage list");
            this.remove(cookieStoreId);
          }
        }
      }
    }
  },

  _createTabObject(tab) {
    return Object.assign({}, tab);
  },

  async getCookieStoreIDuuidMap() {
    const containers = {};
    const containerInfo = await identityState.storageArea.area.get();
    for(const configKey of Object.keys(containerInfo)) {
      if (configKey.includes("identitiesState@@_")) {
        const container = containerInfo[configKey];
        const cookieStoreId = configKey.replace(/^identitiesState@@_/, "");
        containers[cookieStoreId] = container.macAddonUUID;
      }
    }
    return containers;
  },

  async storeHidden(cookieStoreId, windowId) {
    const containerState = await this.storageArea.get(cookieStoreId);
    const tabsByContainer = await browser.tabs.query({cookieStoreId, windowId});
    tabsByContainer.forEach((tab) => {
      const tabObject = this._createTabObject(tab);
      if (!backgroundLogic.isPermissibleURL(tab.url)) {
        return;
      }
      // This tab is going to be closed. Let's mark this tabObject as
      // non-active.
      tabObject.active = false;
      tabObject.hiddenState = true;
      containerState.hiddenTabs.push(tabObject);
    });

    return this.storageArea.set(cookieStoreId, containerState);
  },

  async updateUUID(cookieStoreId, uuid) {
    if (cookieStoreId && uuid) {
      const containerState = await this.storageArea.get(cookieStoreId);
      containerState.macAddonUUID = uuid;
      await this.storageArea.set(cookieStoreId, containerState);
      return uuid;
    } 
    throw new Error ("cookieStoreId or uuid missing");
  },

  async addUUID(cookieStoreId) {
    return await this.updateUUID(cookieStoreId, uuidv4());
  },

  async lookupMACaddonUUID(cookieStoreId) {
    console.log(cookieStoreId);
    const macConfigs = await this.storageArea.area.get();
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey === "identitiesState@@_" + cookieStoreId) {
        return macConfigs[configKey].macAddonUUID;
      }
    }
    return false;
  },

  async lookupCookieStoreId(macAddonUUID) {
    const macConfigs = await this.storageArea.area.get();
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey.includes("identitiesState@@_")) {
        if(macConfigs[configKey].macAddonUUID === macAddonUUID) {
          return String(configKey).replace(/^identitiesState@@_/, "");
        }
      }
    }
    return false;
  },

  _createIdentityState() {
    return {
      hiddenTabs: [],
      macAddonUUID: uuidv4()
    };
  },
};

function uuidv4() {
  // https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
