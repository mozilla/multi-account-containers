/* jshint esversion: 8*/
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
        return storageResponse[storeKey];
      }
      const defaultContainerState = identityState._createIdentityState();
      await this.set(cookieStoreId, defaultContainerState);

      return defaultContainerState;
    },

    set(cookieStoreId, data) {
      const storeKey = this.getContainerStoreKey(cookieStoreId);
      return this.area.set({
        [storeKey]: data
      });
    },

    remove(cookieStoreId) {
      const storeKey = this.getContainerStoreKey(cookieStoreId);
      return this.area.remove([storeKey]);
    }
  },

  _createTabObject(tab) {
    return Object.assign({}, tab);
  },

  async getCookieStoreIDuuidMap() {
    const containers = {};
    const containerInfo = await identityState.storageArea.area.get();
    for(const key of Object.keys(containerInfo)) {
      if (key.includes("identitiesState@@_")) {
        const container = containerInfo[key];
        const cookieStoreId = key.replace(/^identitiesState@@_/, "");
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
    const containerState = await this.storageArea.get(cookieStoreId);
    containerState.macAddonUUID = uuid;
    return this.storageArea.set(cookieStoreId, containerState);
  },
  async addUUID(cookieStoreId) {
    return this.updateUUID(cookieStoreId, uuidv4());
  },

  async lookupCookieStoreId(macAddonUUID) {
    const macConfigs = await this.storageArea.area.get();
    for(const key of Object.keys(macConfigs)) {
      if (key.includes("identitiesState@@_")) {
        if(macConfigs[key].macAddonUUID === macAddonUUID) {
          return key.replace(/^firefox-container-@@_/, "");
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