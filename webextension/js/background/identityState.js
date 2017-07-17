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
      return null;
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

  async _isKnownContainer(userContextId) {
    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    const state = await this.storageArea.get(cookieStoreId);
    return !!state;
  },

  _createTabObject(tab) {
    return Object.assign({}, tab);
  },

  async storeHidden(cookieStoreId) {
    const containerState = await this.storageArea.get(cookieStoreId);
    const tabsByContainer = await this._matchTabsByContainer(cookieStoreId);
    tabsByContainer.forEach((tab) => {
      const tabObject = this._createTabObject(tab);
      // This tab is going to be closed. Let's mark this tabObject as
      // non-active.
      tabObject.active = false;
      tabObject.hiddenState = true;
      containerState.hiddenTabs.push(tabObject);
    });

    return this.storageArea.set(cookieStoreId, containerState);
  },

  async containersCounts() {
    let containersCounts = { // eslint-disable-line prefer-const
      "shown": 0,
      "hidden": 0,
      "total": 0
    };
    const containers = await browser.contextualIdentities.query({});
    for (const id in containers) {
      const container = containers[id];
      await this.remapTabsIfMissing(container.cookieStoreId);
      const containerState = await this.storageArea.get(container.cookieStoreId);
      if (containerState.openTabs > 0) {
        ++containersCounts.shown;
        ++containersCounts.total;
        continue;
      } else if (containerState.hiddenTabs.length > 0) {
        ++containersCounts.hidden;
        ++containersCounts.total;
        continue;
      }
    }
    return containersCounts;
  },

  async containerTabCount(cookieStoreId) {
    // Returns the total of open and hidden tabs with this userContextId
    let containerTabsCount = 0;
    await identityState.remapTabsIfMissing(cookieStoreId);
    const containerState = await this.storageArea.get(cookieStoreId);
    containerTabsCount += containerState.openTabs;
    containerTabsCount += containerState.hiddenTabs.length;
    return containerTabsCount;
  },

  async totalContainerTabsCount() {
    // Returns the number of total open tabs across ALL containers
    let totalContainerTabsCount = 0;
    const containers = await browser.contextualIdentities.query({});
    for (const id in containers) {
      const container = containers[id];
      const cookieStoreId = container.cookieStoreId;
      await identityState.remapTabsIfMissing(cookieStoreId);
      totalContainerTabsCount += await this.storageArea.get(cookieStoreId).openTabs;
    }
    return totalContainerTabsCount;
  },

  async totalNonContainerTabsCount() {
    // Returns the number of open tabs NOT IN a container
    let totalNonContainerTabsCount = 0;
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(tab.cookieStoreId);
      if (userContextId === 0) {
        ++totalNonContainerTabsCount;
      }
    }
    return totalNonContainerTabsCount;
  },

  async remapTabsIfMissing(cookieStoreId) {
    // We already know this cookieStoreId.
    const containerState = await this.storageArea.get(cookieStoreId) || this._createIdentityState();

    await this.storageArea.set(cookieStoreId, containerState);
    await this.remapTabsFromUserContextId(cookieStoreId);
  },

  _matchTabsByContainer(cookieStoreId) {
    return browser.tabs.query({cookieStoreId});
  },

  async remapTabsFromUserContextId(cookieStoreId) {
    const tabsByContainer = await this._matchTabsByContainer(cookieStoreId);
    const containerState = await this.storageArea.get(cookieStoreId);
    containerState.openTabs = tabsByContainer.length;
    await this.storageArea.set(cookieStoreId, containerState);
  },

  _createIdentityState() {
    return {
      hiddenTabs: [],
      openTabs: 0
    };
  },
};
