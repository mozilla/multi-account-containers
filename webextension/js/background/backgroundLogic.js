const DEFAULT_TAB = "about:newtab";
const backgroundLogic = {
  NEW_TAB_PAGES: new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
  ]),

  async getExtensionInfo() {
    const manifestPath = browser.extension.getURL("manifest.json");
    const response = await fetch(manifestPath);
    const extensionInfo = await response.json();
    return extensionInfo;
  },

  getUserContextIdFromCookieStoreId(cookieStoreId) {
    if (!cookieStoreId) {
      return false;
    }
    const container = cookieStoreId.replace("firefox-container-", "");
    if (container !== cookieStoreId) {
      return container;
    }
    return false;
  },

  async deleteContainer(userContextId) {
    await this._closeTabs(userContextId);
    await browser.contextualIdentities.remove(this.cookieStoreId(userContextId));
    assignManager.deleteContainer(userContextId);
    await browser.runtime.sendMessage({
      method: "forgetIdentityAndRefresh"
    });
    return {done: true, userContextId};
  },

  async createOrUpdateContainer(options) {
    let donePromise;
    if (options.userContextId !== "new") {
      donePromise = browser.contextualIdentities.update(
        this.cookieStoreId(options.userContextId),
        options.params
      );
    } else {
      donePromise = browser.contextualIdentities.create(options.params);
    }
    await donePromise;
    browser.runtime.sendMessage({
      method: "refreshNeeded"
    });
  },

  async openTab(options) {
    let url = options.url || undefined;
    const userContextId = ("userContextId" in options) ? options.userContextId : 0;
    const active = ("nofocus" in options) ? options.nofocus : true;

    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    // Autofocus url bar will happen in 54: https://bugzilla.mozilla.org/show_bug.cgi?id=1295072

    // We can't open new tab pages, so open a blank tab. Used in tab un-hide
    if (this.NEW_TAB_PAGES.has(url)) {
      url = undefined;
    }

    // Unhide all hidden tabs
    this.showTabs({
      cookieStoreId
    });
    return browser.tabs.create({
      url,
      active,
      pinned: options.pinned || false,
      cookieStoreId
    });
  },

  async getTabs(options) {
    if (!("cookieStoreId" in options)) {
      return new Error("getTabs must be called with cookieStoreId argument.");
    }

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(options.cookieStoreId);
    await identityState.remapTabsIfMissing(options.cookieStoreId);
    const isKnownContainer = await identityState._isKnownContainer(userContextId);
    if (!isKnownContainer) {
      return [];
    }

    const list = [];
    const tabs = await this._containerTabs(options.cookieStoreId);
    tabs.forEach((tab) => {
      list.push(identityState._createTabObject(tab));
    });

    const containerState = await identityState.storageArea.get(options.cookieStoreId);
    return list.concat(containerState.hiddenTabs);
  },

  async moveTabsToWindow(options) {
    if (!("cookieStoreId" in options)) {
      return new Error("moveTabsToWindow must be called with cookieStoreId argument.");
    }

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(options.cookieStoreId);
    await identityState.remapTabsIfMissing(options.cookieStoreId);
    if (!identityState._isKnownContainer(userContextId)) {
      return null;
    }

    const list = await identityState._matchTabsByContainer(options.cookieStoreId);

    const containerState = await identityState.storageArea.get(options.cookieStoreId);
    // Nothing to do
    if (list.length === 0 &&
        containerState.hiddenTabs.length === 0) {
      return;
    }
    const window = await browser.windows.create({
      tabId: list.shift().id
    });
    browser.tabs.move(list, {
      windowId: window.id,
      index: -1
    });

    // Let's show the hidden tabs.
    for (let object of containerState.hiddenTabs) { // eslint-disable-line prefer-const
      browser.tabs.create(object.url || DEFAULT_TAB, {
        windowId: window.id,
        cookieStoreId: options.cookieStoreId
      });
    }

    containerState.hiddenTabs = [];

    // Let's close all the normal tab in the new window. In theory it
    // should be only the first tab, but maybe there are addons doing
    // crazy stuff.
    const tabs = browser.tabs.query({windowId: window.id});
    for (let tab of tabs) { // eslint-disable-line prefer-const
      if (tabs.cookieStoreId !== options.cookieStoreId) {
        browser.tabs.remove(tab.id);
      }
    }
    return await identityState.storageArea.set(options.cookieStoreId, containerState);
  },

  async _closeTabs(userContextId) {
    const cookieStoreId = this.cookieStoreId(userContextId);
    const tabs = await this._containerTabs(cookieStoreId);
    const tabIds = tabs.map((tab) => tab.id);
    return browser.tabs.remove(tabIds);
  },

  async queryIdentitiesState() {
    const identities = await browser.contextualIdentities.query({});
    const identitiesOutput = {};
    const identitiesPromise = identities.map(async function (identity) {
      await identityState.remapTabsIfMissing(identity.cookieStoreId);
      const containerState = await identityState.storageArea.get(identity.cookieStoreId);
      identitiesOutput[identity.cookieStoreId] = {
        hasHiddenTabs: !!containerState.hiddenTabs.length,
        hasOpenTabs: !!containerState.openTabs
      };
      return;
    });
    await Promise.all(identitiesPromise);
    return identitiesOutput;
  },

  async sortTabs() {
    const windows = await browser.windows.getAll();
    for (let window of windows) { // eslint-disable-line prefer-const
      // First the pinned tabs, then the normal ones.
      await this._sortTabsInternal(window, true);
      await this._sortTabsInternal(window, false);
    }
  },

  async _sortTabsInternal(window, pinnedTabs) {
    const tabs = await browser.tabs.query({windowId: window.id});
    let pos = 0;

    // Let's collect UCIs/tabs for this window.
    const map = new Map;
    for (const tab of tabs) {
      if (pinnedTabs && !tab.pinned) {
        // We don't have, or we already handled all the pinned tabs.
        break;
      }

      if (!pinnedTabs && tab.pinned) {
        // pinned tabs must be consider as taken positions.
        ++pos;
        continue;
      }

      const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(tab.cookieStoreId);
      if (!map.has(userContextId)) {
        map.set(userContextId, []);
      }
      map.get(userContextId).push(tab);
    }

    // Let's sort the map.
    const sortMap = new Map([...map.entries()].sort((a, b) => a[0] > b[0]));

    // Let's move tabs.
    sortMap.forEach(tabs => {
      for (const tab of tabs) {
        ++pos;
        browser.tabs.move(tab.id, {
          windowId: window.id,
          index: pos
        });
        //xulWindow.gBrowser.moveTabTo(tab, pos++);
      }
    });
  },

  async hideTabs(options) {
    if (!("cookieStoreId" in options)) {
      return new Error("hideTabs must be called with cookieStoreId option.");
    }

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(options.cookieStoreId);
    await identityState.remapTabsIfMissing(options.cookieStoreId);
    const isKnownContainer = await identityState._isKnownContainer(userContextId);
    if (!isKnownContainer) {
      return null;
    }

    const containerState = await identityState.storeHidden(options.cookieStoreId);
    await this._closeTabs(userContextId); 
    return containerState;
  },

  async showTabs(options) {
    if (!("cookieStoreId" in options)) {
      return Promise.reject("showTabs must be called with cookieStoreId argument.");
    }

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(options.cookieStoreId);
    await identityState.remapTabsIfMissing(options.cookieStoreId);
    if (!identityState._isKnownContainer(userContextId)) {
      return null;
    }

    const promises = [];

    const containerState = await identityState.storageArea.get(options.cookieStoreId);

    for (let object of containerState.hiddenTabs) { // eslint-disable-line prefer-const
      promises.push(this.openTab({
        userContextId: userContextId,
        url: object.url,
        nofocus: options.nofocus || false,
        pinned: object.pinned,
      }));
    }

    containerState.hiddenTabs = [];

    await Promise.all(promises);
    return await identityState.storageArea.set(options.cookieStoreId, containerState);
  },

  cookieStoreId(userContextId) {
    return `firefox-container-${userContextId}`;
  },

  _containerTabs(cookieStoreId) {
    return browser.tabs.query({
      cookieStoreId
    }).catch((e) => {throw e;});
  },
};

