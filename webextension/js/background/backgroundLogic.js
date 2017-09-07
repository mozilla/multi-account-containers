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

  async deleteContainer(userContextId, removed = false) {
    await this._closeTabs(userContextId);
    if (!removed) {
      await browser.contextualIdentities.remove(this.cookieStoreId(userContextId));
    }
    assignManager.deleteContainer(userContextId);
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

  async openNewTab(options) {
    let url = options.url || undefined;
    const userContextId = ("userContextId" in options) ? options.userContextId : 0;
    const active = ("nofocus" in options) ? options.nofocus : true;

    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    // Autofocus url bar will happen in 54: https://bugzilla.mozilla.org/show_bug.cgi?id=1295072

    // We can't open new tab pages, so open a blank tab. Used in tab un-hide
    if (this.NEW_TAB_PAGES.has(url)) {
      url = undefined;
    }

    if (!this.isPermissibleURL(url)) {
      return;
    }

    return browser.tabs.create({
      url,
      active,
      pinned: options.pinned || false,
      cookieStoreId
    });
  },

  isPermissibleURL(url) {
    const protocol = new URL(url).protocol;
    // We can't open these we just have to throw them away
    if (protocol === "about:"
        || protocol === "chrome:"
        || protocol === "moz-extension:") {
      return false;
    }
    return true;
  },

  checkArgs(requiredArguments, options, methodName) {
    requiredArguments.forEach((argument) => {
      if (!(argument in options)) {
        return new Error(`${methodName} must be called with ${argument} argument.`);
      }
    });
  },

  async getTabs(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "getTabs");
    const { cookieStoreId, windowId } = options;

    const list = [];
    const tabs = await browser.tabs.query({
      cookieStoreId,
      windowId
    });
    tabs.forEach((tab) => {
      list.push(identityState._createTabObject(tab));
    });

    const containerState = await identityState.storageArea.get(cookieStoreId);
    return list.concat(containerState.hiddenTabs);
  },

  async moveTabsToWindow(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "moveTabsToWindow");
    const { cookieStoreId, windowId } = options;

    const list = await browser.tabs.query({
      cookieStoreId,
      windowId
    });

    const containerState = await identityState.storageArea.get(cookieStoreId);
    // Nothing to do
    if (list.length === 0 &&
        containerState.hiddenTabs.length === 0) {
      return;
    }
    const newWindowObj = await browser.windows.create({
      tabId: list.shift().id
    });
    browser.tabs.move(list.map((tab) => tab.id), {
      windowId: newWindowObj.id,
      index: -1
    });

    // Let's show the hidden tabs.
    for (let object of containerState.hiddenTabs) { // eslint-disable-line prefer-const
      browser.tabs.create(object.url || DEFAULT_TAB, {
        windowId: newWindowObj.id,
        cookieStoreId
      });
    }

    containerState.hiddenTabs = [];

    // Let's close all the normal tab in the new window. In theory it
    // should be only the first tab, but maybe there are addons doing
    // crazy stuff.
    const tabs = browser.tabs.query({windowId: newWindowObj.id});
    for (let tab of tabs) { // eslint-disable-line prefer-const
      if (tabs.cookieStoreId !== cookieStoreId) {
        browser.tabs.remove(tab.id);
      }
    }
    return await identityState.storageArea.set(cookieStoreId, containerState);
  },

  async _closeTabs(userContextId, windowId = false) {
    const cookieStoreId = this.cookieStoreId(userContextId);
    let tabs;
    /* if we have no windowId we are going to close all this container (used for deleting) */
    if (windowId !== false) {
      tabs = await browser.tabs.query({
        cookieStoreId,
        windowId
      });
    } else {
      tabs = await browser.tabs.query({
        cookieStoreId
      });
    }
    const tabIds = tabs.map((tab) => tab.id);
    return browser.tabs.remove(tabIds);
  },

  async queryIdentitiesState(windowId) {
    const identities = await browser.contextualIdentities.query({});
    const identitiesOutput = {};
    const identitiesPromise = identities.map(async function (identity) {
      const { cookieStoreId } = identity;
      const containerState = await identityState.storageArea.get(cookieStoreId);
      const openTabs = await browser.tabs.query({
        cookieStoreId,
        windowId
      });
      identitiesOutput[cookieStoreId] = {
        hasHiddenTabs: !!containerState.hiddenTabs.length,
        hasOpenTabs: !!openTabs.length
      };
      return;
    });
    await Promise.all(identitiesPromise);
    return identitiesOutput;
  },

  async sortTabs() {
    const windows = await browser.windows.getAll();
    for (let windowObj of windows) { // eslint-disable-line prefer-const
      // First the pinned tabs, then the normal ones.
      await this._sortTabsInternal(windowObj, true);
      await this._sortTabsInternal(windowObj, false);
    }
  },

  async _sortTabsInternal(windowObj, pinnedTabs) {
    const tabs = await browser.tabs.query({windowId: windowObj.id});
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
          windowId: windowObj.id,
          index: pos
        });
      }
    });
  },

  async hideTabs(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "hideTabs");
    const { cookieStoreId, windowId } = options;

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(cookieStoreId);

    const containerState = await identityState.storeHidden(cookieStoreId, windowId);
    await this._closeTabs(userContextId, windowId);
    return containerState;
  },

  async showTabs(options) {
    if (!("cookieStoreId" in options)) {
      return Promise.reject("showTabs must be called with cookieStoreId argument.");
    }

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(options.cookieStoreId);
    const promises = [];

    const containerState = await identityState.storageArea.get(options.cookieStoreId);

    for (let object of containerState.hiddenTabs) { // eslint-disable-line prefer-const
      promises.push(this.openNewTab({
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
  }
};

