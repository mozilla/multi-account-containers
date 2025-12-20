/* global MAC_CONSTANTS */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_TAB = "about:newtab";

const backgroundLogic = {
  NEW_TAB_PAGES: new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
  ]),
  // Use shared constants for counts
  // NOTE: Keep in sync with MAC_CONSTANTS.NUMBER_OF_KEYBOARD_SHORTCUTS
  unhideQueue: [],

  init() {
    browser.commands.onCommand.addListener(async function (command) {
      if (command === "sort_tabs") {
        backgroundLogic.sortTabs();
      } else if (command.startsWith(MAC_CONSTANTS.OPEN_CONTAINER_PREFIX)) {
        for (let i = 0; i < MAC_CONSTANTS.NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
          const key = MAC_CONSTANTS.OPEN_CONTAINER_PREFIX + i;
          const cookieStoreId = identityState.keyboardShortcut[key];
          if (command === key) {
            if (cookieStoreId !== "none") {
              browser.tabs.create({cookieStoreId});
            }
            break;
          }
        }
      } else if (command.startsWith(MAC_CONSTANTS.REOPEN_IN_CONTAINER_PREFIX)) {
        for (let i = 0; i < MAC_CONSTANTS.NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
          const key = MAC_CONSTANTS.REOPEN_IN_CONTAINER_PREFIX + i;
          const cookieStoreId = identityState.keyboardShortcut[key];
          if (command === key) {
            if (cookieStoreId !== "none") {
              backgroundLogic.reopenInContainer(cookieStoreId);
            }
            break;
          }
        }
      }
    });

    browser.permissions.onAdded.addListener(permissions => this.resetPermissions(permissions));
    browser.permissions.onRemoved.addListener(permissions => this.resetPermissions(permissions));

    // Update Translation in Manifest
    browser.runtime.onInstalled.addListener((details) => {
      this.updateTranslationInManifest();
      this._undoDefault820SortTabsKeyboardShortcut(details);
      this._removeSurveyAchievement();
    });
    browser.runtime.onStartup.addListener(this.updateTranslationInManifest);
  },

  /**
   * One-time migration after updating from v8.2.0:
   * Unset the default keyboard shortcut (Ctrl+Comma) for the `sort_tabs`
   * command if it was set in v8.2.0 of this addon. If the user remapped
   * a different shortcut manually, retain their shortcut. Users who used
   * the default keyboard shortcut will need to manually set a shortcut.
   * See https://support.mozilla.org/en-US/kb/manage-extension-shortcuts-firefox
   *
   * @param {{reason: runtime.OnInstalledReason, previousVersion?: string}} details
   */
  async _undoDefault820SortTabsKeyboardShortcut(details) {
    if (details.reason === "update" && details.previousVersion === "8.2.0") {
      const commands = await browser.commands.getAll();
      const sortTabsCommand = commands.find(command => command.name === "sort_tabs");
      if (sortTabsCommand) {
        const previouslySuggestedKeys = [
          "Ctrl+Comma", // "default"
          "MacCtrl+Comma", // "mac"
        ];
        if (previouslySuggestedKeys.includes(sortTabsCommand.shortcut)) {
          browser.commands.reset("sort_tabs");
        }
      }
    }
  },

  async reopenInContainer(cookieStoreId) {
    const currentTab = await browser.tabs.query({active: true, currentWindow: true});

    if (currentTab.length > 0) {
      const tab = currentTab[0];

      browser.tabs.create({
        url: tab.url,
        cookieStoreId: cookieStoreId,
        index: tab.index + 1,
        active: tab.active
      });

      browser.tabs.remove(tab.id);
    }
  },

  /**
   * We left an achievement entry in storage during a user research study in
   * version 8.3.1. This method removes that entry to prevent broken logic in
   * the achievement views.
   */
  async _removeSurveyAchievement() {
    const achievementsStorage = await browser.storage.local.get({ achievements: [] });
    const achievements = achievementsStorage.achievements;
    const filtered = achievements.filter(a => a.name !== "survey");
    if (filtered.length !== achievements.length) {
      await browser.storage.local.set({achievements: filtered});
    }
  },

  updateTranslationInManifest() {
    for (let index = 0; index < MAC_CONSTANTS.NUMBER_OF_KEYBOARD_SHORTCUTS; index++) {
      const adjustedIndex = index + 1; // We want to start from 1 instead of 0 in the UI.
      browser.commands.update({
        name: `${MAC_CONSTANTS.OPEN_CONTAINER_PREFIX}${index}`,
        description: browser.i18n.getMessage("containerShortcut", `${adjustedIndex}`)
      });
      browser.commands.update({
        name: `${MAC_CONSTANTS.REOPEN_IN_CONTAINER_PREFIX}${index}`,
        description: browser.i18n.getMessage("reopenInContainerShortcut", `${adjustedIndex}`)
      });
    }
  },

  resetPermissions(permissions) {
    permissions.permissions.forEach(async permission => {
      switch (permission) {
      case "bookmarks":
        assignManager.resetBookmarksMenuItem();
        break;

      case "nativeMessaging":
        await MozillaVPN_Background.removeMozillaVpnProxies();
        await browser.runtime.reload();
        break;

      case "proxy":
        assignManager.maybeAddProxyListeners();
        break;
      }
    });
  },

  async getExtensionInfo() {
    const manifestPath = browser.runtime.getURL("manifest.json");
    const response = await fetch(manifestPath);
    const extensionInfo = await response.json();
    return extensionInfo;
  },

  // Remove container data (cookies, localStorage and cache)
  async deleteContainerDataOnly(userContextId) {
    await browser.browsingData.removeCookies({
      cookieStoreId: this.cookieStoreId(userContextId)
    });

    await browser.browsingData.removeLocalStorage({
      cookieStoreId: this.cookieStoreId(userContextId)
    });

    return {done: true, userContextId};
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

    // Now remove the identity->proxy association in proxifiedContainers also
    proxifiedContainers.delete(this.cookieStoreId(userContextId));

    return {done: true, userContextId};
  },

  async createOrUpdateContainer(options) {
    if (options.userContextId !== "new") {
      return await browser.contextualIdentities.update(
        this.cookieStoreId(options.userContextId),
        options.params
      );
    }
    return await browser.contextualIdentities.create(options.params);
  },

  async openNewTab(options) {
    let url = options.url || undefined;
    const userContextId = ("userContextId" in options) ? options.userContextId : 0;
    const active = ("nofocus" in options) ? options.nofocus : true;
    const discarded = ("noload" in options) ? options.noload : false;

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
      discarded,
      pinned: options.pinned || false,
      cookieStoreId
    });
  },

  isPermissibleURL(url) {
    const protocol = new URL(url).protocol;
    // We can't open these we just have to throw them away
    if (protocol === "about:"
      || protocol === "chrome:"
      || protocol === "moz-extension:"
      || protocol === "file:") {
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
    const {cookieStoreId, windowId} = options;

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

  async unhideContainer(cookieStoreId, alreadyShowingUrl) {
    if (!this.unhideQueue.includes(cookieStoreId)) {
      this.unhideQueue.push(cookieStoreId);
      await this.showTabs({
        cookieStoreId,
        alreadyShowingUrl
      });
      this.unhideQueue.splice(this.unhideQueue.indexOf(cookieStoreId), 1);
    }
  },

  // https://github.com/mozilla/multi-account-containers/issues/847
  async addRemoveSiteIsolation(cookieStoreId, remove = false) {
    const containerState = await identityState.storageArea.get(cookieStoreId);
    try {
      if ("isIsolated" in containerState || remove) {
        delete containerState.isIsolated;
      } else {
        containerState.isIsolated = "locked";
      }
      return await identityState.storageArea.set(cookieStoreId, containerState);
    } catch {
      // console.error(`No container: ${cookieStoreId}`);
    }
  },

  async moveTabsToWindow(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "moveTabsToWindow");
    const {cookieStoreId, windowId} = options;

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
    let newWindowObj;
    let hiddenDefaultTabToClose;
    if (list.length) {
      newWindowObj = await browser.windows.create();

      // Pin the default tab in the new window so existing pinned tabs can be moved after it.
      // From the docs (https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/tabs/move):
      //   Note that you can't move pinned tabs to a position after any unpinned tabs in a window, or move any unpinned tabs to a position before any pinned tabs.
      await browser.tabs.update(newWindowObj.tabs[0].id, {pinned: true});

      browser.tabs.move(list.map((tab) => tab.id), {
        windowId: newWindowObj.id,
        index: -1
      });
    } else {
      // As we get a blank tab here we will need to await the tabs creation
      newWindowObj = await browser.windows.create({});
      hiddenDefaultTabToClose = true;
    }

    const showHiddenPromises = [];

    // Let's show the hidden tabs.
    if (!this.unhideQueue.includes(cookieStoreId)) {
      this.unhideQueue.push(cookieStoreId);
      for (let object of containerState.hiddenTabs) { // eslint-disable-line prefer-const
        showHiddenPromises.push(browser.tabs.create({
          url: object.url || DEFAULT_TAB,
          windowId: newWindowObj.id,
          cookieStoreId
        }));
      }
    }

    if (hiddenDefaultTabToClose) {
      // Lets wait for hidden tabs to show before closing the others
      await showHiddenPromises;
    }

    containerState.hiddenTabs = [];

    // Let's close all the normal tab in the new window. In theory it
    // should be only the first tab, but maybe there are addons doing
    // crazy stuff.
    const tabs = await browser.tabs.query({windowId: newWindowObj.id});
    for (let tab of tabs) { // eslint-disable-line prefer-const
      if (tab.cookieStoreId !== cookieStoreId) {
        browser.tabs.remove(tab.id);
      }
    }
    const rv = await identityState.storageArea.set(cookieStoreId, containerState);
    this.unhideQueue.splice(this.unhideQueue.indexOf(cookieStoreId), 1);
    return rv;
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
    const identitiesPromise = identities.map(async (identity) => {
      const {cookieStoreId} = identity;
      const containerState = await identityState.storageArea.get(cookieStoreId);
      const openTabs = await browser.tabs.query({
        cookieStoreId,
        windowId
      });
      identitiesOutput[cookieStoreId] = {
        hasHiddenTabs: !!containerState.hiddenTabs.length,
        hasOpenTabs: !!openTabs.length,
        numberOfHiddenTabs: containerState.hiddenTabs.length,
        numberOfOpenTabs: openTabs.length,
        isIsolated: !!containerState.isIsolated
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
    /** @type {Map<string, {order: string, tabs: Tab[]}>} */
    const map = new Map;

    const lastTab = tabs.at(-1);
    /** @type {boolean} */
    let lastTabIsInTabGroup = !!lastTab && lastTab.groupId >= 0;

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

      if (tab.groupId >= 0) {
        // Skip over tabs in tab groups until it's possible to handle them better.
        continue;
      }

      if (!map.has(tab.cookieStoreId)) {
        const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(tab.cookieStoreId);
        map.set(tab.cookieStoreId, {order: userContextId, tabs: []});
      }
      map.get(tab.cookieStoreId).tabs.push(tab);
    }

    const containerOrderStorage = await browser.storage.local.get([CONTAINER_ORDER_STORAGE_KEY]);
    const containerOrder =
      containerOrderStorage && containerOrderStorage[CONTAINER_ORDER_STORAGE_KEY];

    if (containerOrder) {
      map.forEach((obj, key) => {
        obj.order = (key in containerOrder) ? containerOrder[key] : -1;
      });
    }

    // Let's sort the map.
    const sortMap = new Map([...map.entries()].sort((a, b) => a[1].order > b[1].order));

    // Let's move tabs.
    for (const {tabs} of sortMap.values()) {
      for (const tab of tabs) {
        ++pos;
        browser.tabs.move(tab.id, {
          windowId: windowObj.id,
          index: pinnedTabs ? pos : -1
        });
        // Pinned tabs are never grouped and always inserted in the front.
        if (!pinnedTabs && lastTabIsInTabGroup && browser.tabs.ungroup) {
          // If the last item in the tab strip is a grouped tab, moving a tab
          // to its position will also add it to the tab group. Since this code
          // is only sorting ungrouped tabs, this forcibly ungroups the first
          // tab to be moved. All subsequent iterations will only be moving
          // ungrouped tabs to the position of other ungrouped tabs.
          lastTabIsInTabGroup = false;
          browser.tabs.ungroup(tab.id);
        }
      }
    }
  },

  async hideTabs(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "hideTabs");
    const {cookieStoreId, windowId} = options;

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
      // do not show already opened url
      const noload = !object.pinned;
      if (object.url !== options.alreadyShowingUrl) {
        promises.push(this.openNewTab({
          userContextId: userContextId,
          url: object.url,
          nofocus: options.nofocus || false,
          noload: noload,
          pinned: object.pinned,
        }));
      }
    }

    containerState.hiddenTabs = [];

    await Promise.all(promises);
    return identityState.storageArea.set(options.cookieStoreId, containerState);
  },

  cookieStoreId(userContextId) {
    if (userContextId === 0) return "firefox-default";
    return `firefox-container-${userContextId}`;
  }
};


backgroundLogic.init();
