const identityState = {
  storageArea: {
    area: browser.storage.local,

    getContainerStoreKey(cookieStoreId) {
      const storagePrefix = "identitiesState@@_";
      return `${storagePrefix}${cookieStoreId}`;
    },

    const get = async (cookieStoreId) => {
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

  const storeHidden = async (cookieStoreId, windowId) => {
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

  _createIdentityState() {
    return {
      hiddenTabs: []
    };
  },
};
