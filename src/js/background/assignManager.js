/* jshint esversion: 8*/
const assignManager = {
  MENU_ASSIGN_ID: "open-in-this-container",
  MENU_REMOVE_ID: "remove-open-in-this-container",
  MENU_SEPARATOR_ID: "separator",
  MENU_HIDE_ID: "hide-container",
  MENU_MOVE_ID: "move-to-new-window-container",
  OPEN_IN_CONTAINER: "open-bookmark-in-container-tab",
  storageArea: {
    area: browser.storage.local,
    exemptedTabs: {},

    async getSynced() {
      const beenSynced = await this.area.get("beenSynced");
      if (Object.entries(beenSynced).length === 0) return false;
      return true;
     },

    setSynced() {
      this.area.set({beenSynced: true});
     },

    getSiteStoreKey(pageUrl) {
      const url = new window.URL(pageUrl);
      const storagePrefix = "siteContainerMap@@_";
      if (url.port === "80" || url.port === "443") {
        return `${storagePrefix}${url.hostname}`;
      } else {
        return `${storagePrefix}${url.hostname}${url.port}`;
      }
    },

    setExempted(pageUrl, tabId) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      if (!(siteStoreKey in this.exemptedTabs)) {
        this.exemptedTabs[siteStoreKey] = [];
      }
      this.exemptedTabs[siteStoreKey].push(tabId);
    },

    removeExempted(pageUrl) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      this.exemptedTabs[siteStoreKey] = [];
    },

    isExempted(pageUrl, tabId) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      if (!(siteStoreKey in this.exemptedTabs)) {
        return false;
      }
      return this.exemptedTabs[siteStoreKey].includes(tabId);
    },

    get(pageUrl) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      return new Promise((resolve, reject) => {
        this.area.get([siteStoreKey]).then((storageResponse) => {
          if (storageResponse && siteStoreKey in storageResponse) {
            resolve(storageResponse[siteStoreKey]);
          }
          resolve(null);
        }).catch((e) => {
          reject(e);
        });
      });
    },

    async set(pageUrl, data, exemptedTabIds) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      if (exemptedTabIds) {
        exemptedTabIds.forEach((tabId) => {
          this.setExempted(pageUrl, tabId);
        });
      }
      await this.area.set({
        [siteStoreKey]: data
      });
      await backup({undelete: siteStoreKey});
      return;
    },

    async remove(pageUrl) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      // When we remove an assignment we should clear all the exemptions
      this.removeExempted(pageUrl);
      await this.area.remove([siteStoreKey]);
      await backup({siteStoreKey});
      return;
    },

    async deleteContainer(userContextId) {
      const sitesByContainer = await this.getAssignedSites(userContextId);
      this.area.remove(Object.keys(sitesByContainer));
    },

    async getAssignedSites(userContextId = null) {
      const sites = {};
      const siteConfigs = await this.area.get();
      for(const urlKey of Object.keys(siteConfigs)) {
        if (urlKey.includes("siteContainerMap@@_")) {
        // For some reason this is stored as string... lets check them both as that
          if (!!userContextId && String(siteConfigs[urlKey].userContextId) !== String(userContextId)) {
            continue;
          }
          const site = siteConfigs[urlKey];
          // In hindsight we should have stored this
          // TODO file a follow up to clean the storage onLoad
          site.hostname = urlKey.replace(/^siteContainerMap@@_/, "");
          sites[urlKey] = site;
        }
      };
      return sites;
    },
  },

  _neverAsk(m) {
    const pageUrl = m.pageUrl;
    if (m.neverAsk === true) {
      // If we have existing data and for some reason it hasn't been deleted etc lets update it
      this.storageArea.get(pageUrl).then((siteSettings) => {
        if (siteSettings) {
          siteSettings.neverAsk = true;
          this.storageArea.set(pageUrl, siteSettings);
        }
      }).catch((e) => {
        throw e;
      });
    }
  },

  // We return here so the confirm page can load the tab when exempted
  async _exemptTab(m) {
    const pageUrl = m.pageUrl;
    this.storageArea.setExempted(pageUrl, m.tabId);
    return true;
  },

  // Before a request is handled by the browser we decide if we should route through a different container
  async onBeforeRequest(options) {
    if (options.frameId !== 0 || options.tabId === -1) {
      return {};
    }
    this.removeContextMenu();
    const [tab, siteSettings] = await Promise.all([
      browser.tabs.get(options.tabId),
      this.storageArea.get(options.url)
    ]);
    let container;
    try {
      container = await browser.contextualIdentities.get(backgroundLogic.cookieStoreId(siteSettings.userContextId));
    } catch (e) {
      container = false;
    }

    // The container we have in the assignment map isn't present any more so lets remove it
    //   then continue the existing load
    if (siteSettings && !container) {
      this.deleteContainer(siteSettings.userContextId);
      return {};
    }
    const userContextId = this.getUserContextIdFromCookieStore(tab);
    if (!siteSettings
        || userContextId === siteSettings.userContextId
        || this.storageArea.isExempted(options.url, tab.id)) {
      return {};
    }
    const removeTab = backgroundLogic.NEW_TAB_PAGES.has(tab.url)
      || (messageHandler.lastCreatedTab
        && messageHandler.lastCreatedTab.id === tab.id);
    const openTabId = removeTab ? tab.openerTabId : tab.id;

    if (!this.canceledRequests[tab.id]) {
      // we decided to cancel the request at this point, register canceled request
      this.canceledRequests[tab.id] = {
        requestIds: {
          [options.requestId]: true
        },
        urls: {
          [options.url]: true
        }
      };

      // since webRequest onCompleted and onErrorOccurred are not 100% reliable (see #1120)
      // we register a timer here to cleanup canceled requests, just to make sure we don't
      // end up in a situation where certain urls in a tab.id stay canceled
      setTimeout(() => {
        if (this.canceledRequests[tab.id]) {
          delete this.canceledRequests[tab.id];
        }
      }, 2000);
    } else {
      let cancelEarly = false;
      if (this.canceledRequests[tab.id].requestIds[options.requestId] ||
          this.canceledRequests[tab.id].urls[options.url]) {
        // same requestId or url from the same tab
        // this is a redirect that we have to cancel early to prevent opening two tabs
        cancelEarly = true;
      }
      // we decided to cancel the request at this point, register canceled request
      this.canceledRequests[tab.id].requestIds[options.requestId] = true;
      this.canceledRequests[tab.id].urls[options.url] = true;
      if (cancelEarly) {
        return {
          cancel: true
        };
      }
    }

    this.reloadPageInContainer(
      options.url,
      userContextId,
      siteSettings.userContextId,
      tab.index + 1,
      tab.active,
      siteSettings.neverAsk,
      openTabId
    );
    this.calculateContextMenu(tab);

    /* Removal of existing tabs:
        We aim to open the new assigned container tab / warning prompt in it's own tab:
          - As the history won't span from one container to another it seems most sane to not try and reopen a tab on history.back()
          - When users open a new tab themselves we want to make sure we don't end up with three tabs as per: https://github.com/mozilla/testpilot-containers/issues/421
        If we are coming from an internal url that are used for the new tab page (NEW_TAB_PAGES), we can safely close as user is unlikely losing history
        Detecting redirects on "new tab" opening actions is pretty hard as we don't get tab history:
        - Redirects happen from Short URLs and tracking links that act as a gateway
        - Extensions don't provide a way to history crawl for tabs, we could inject content scripts to do this
            however they don't run on about:blank so this would likely be just as hacky.
        We capture the time the tab was created and close if it was within the timeout to try to capture pages which haven't had user interaction or history.
    */
    if (removeTab) {
      browser.tabs.remove(tab.id);
    }
    return {
      cancel: true,
    };
  },

  init() {
    browser.contextMenus.onClicked.addListener((info, tab) => {
      info.bookmarkId ? this._onClickedBookmark(info) : this._onClickedHandler(info, tab);
    });

    // Before a request is handled by the browser we decide if we should route through a different container
    this.canceledRequests = {};
    browser.webRequest.onBeforeRequest.addListener((options) => {
      return this.onBeforeRequest(options);
    },{urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);

    // Clean up canceled requests
    browser.webRequest.onCompleted.addListener((options) => {
      if (this.canceledRequests[options.tabId]) {
        delete this.canceledRequests[options.tabId];
      }
    },{urls: ["<all_urls>"], types: ["main_frame"]});
    browser.webRequest.onErrorOccurred.addListener((options) => {
      if (this.canceledRequests[options.tabId]) {
        delete this.canceledRequests[options.tabId];
      }
    },{urls: ["<all_urls>"], types: ["main_frame"]});

    this.resetBookmarksMenuItem();

    // Run when installed and on startup
    browser.runtime.onInstalled.addListener(this.initSync);
    browser.runtime.onStartup.addListener(this.initSync);
  },

  async resetBookmarksMenuItem() {
    const hasPermission = await browser.permissions.contains({permissions: ["bookmarks"]});
    if (this.hadBookmark === hasPermission) {
      return;
    }
    this.hadBookmark = hasPermission;
    if (hasPermission) {
      this.initBookmarksMenu();
      browser.contextualIdentities.onCreated.addListener(this.contextualIdentityCreated);
      browser.contextualIdentities.onUpdated.addListener(this.contextualIdentityUpdated);
      browser.contextualIdentities.onRemoved.addListener(this.contextualIdentityRemoved);
    } else {
      this.removeBookmarksMenu();
      browser.contextualIdentities.onCreated.removeListener(this.contextualIdentityCreated);
      browser.contextualIdentities.onUpdated.removeListener(this.contextualIdentityUpdated);
      browser.contextualIdentities.onRemoved.removeListener(this.contextualIdentityRemoved);
    }
  },

  contextualIdentityCreated(changeInfo) {
    browser.contextMenus.create({
      parentId: assignManager.OPEN_IN_CONTAINER,
      id: changeInfo.contextualIdentity.cookieStoreId,
      title: changeInfo.contextualIdentity.name,
      icons: { "16": `img/usercontext.svg#${changeInfo.contextualIdentity.icon}` }
    });
  },

  contextualIdentityUpdated(changeInfo) {
    browser.contextMenus.update(changeInfo.contextualIdentity.cookieStoreId, {
      title: changeInfo.contextualIdentity.name,
      icons: { "16": `img/usercontext.svg#${changeInfo.contextualIdentity.icon}` }
    });
  },

  contextualIdentityRemoved(changeInfo) {
    browser.contextMenus.remove(changeInfo.contextualIdentity.cookieStoreId);
  },

  async _onClickedHandler(info, tab) {
    const userContextId = this.getUserContextIdFromCookieStore(tab);
    // Mapping ${URL(info.pageUrl).hostname} to ${userContextId}
    let remove;
    if (userContextId) {
      switch (info.menuItemId) {
      case this.MENU_ASSIGN_ID:
      case this.MENU_REMOVE_ID:
        if (info.menuItemId === this.MENU_ASSIGN_ID) {
          remove = false;
        } else {
          remove = true;
        }
        await this._setOrRemoveAssignment(tab.id, info.pageUrl, userContextId, remove);
        break;
      case this.MENU_MOVE_ID:
        backgroundLogic.moveTabsToWindow({
          cookieStoreId: tab.cookieStoreId,
          windowId: tab.windowId,
        });
        break;
      case this.MENU_HIDE_ID:
        backgroundLogic.hideTabs({
          cookieStoreId: tab.cookieStoreId,
          windowId: tab.windowId,
        });
        break;
      }
    }
  },

  async _onClickedBookmark(info) {

    async function _getBookmarksFromInfo(info) {
      const [bookmarkTreeNode] = await browser.bookmarks.get(info.bookmarkId);
      if (bookmarkTreeNode.type === "folder") {
        return await browser.bookmarks.getChildren(bookmarkTreeNode.id);
      }
      return [bookmarkTreeNode];
    }

    const bookmarks = await _getBookmarksFromInfo(info);
    for (const bookmark of bookmarks) {
      // Some checks on the urls from https://github.com/Rob--W/bookmark-container-tab/ thanks!
      if ( !/^(javascript|place):/i.test(bookmark.url) && bookmark.type !== "folder") {
        const openInReaderMode = bookmark.url.startsWith("about:reader");
        if(openInReaderMode) {
          try {
            const parsed = new URL(bookmark.url);
            bookmark.url = parsed.searchParams.get("url") + parsed.hash;
          } catch (err) {
            return err.message;
          }
        }
        browser.tabs.create({
          cookieStoreId: info.menuItemId,
          url: bookmark.url,
          openInReaderMode: openInReaderMode
        });
      }
    }
  },


  deleteContainer(userContextId) {
    this.storageArea.deleteContainer(userContextId);
  },

  getUserContextIdFromCookieStore(tab) {
    if (!("cookieStoreId" in tab)) {
      return false;
    }
    return backgroundLogic.getUserContextIdFromCookieStoreId(tab.cookieStoreId);
  },

  isTabPermittedAssign(tab) {
    // Ensure we are not an important about url
    const url = new URL(tab.url);
    if (url.protocol === "about:"
        || url.protocol === "moz-extension:") {
      return false;
    }
    return true;
  },

  async _setOrRemoveAssignment(tabId, pageUrl, userContextId, remove) {
    let actionName;

    // https://github.com/mozilla/testpilot-containers/issues/626
    // Context menu has stored context IDs as strings, so we need to coerce
    // the value to a string for accurate checking
    userContextId = String(userContextId);

    if (!remove) {
      const tabs = await browser.tabs.query({});
      const assignmentStoreKey = this.storageArea.getSiteStoreKey(pageUrl);
      const exemptedTabIds = tabs.filter((tab) => {
        const tabStoreKey = this.storageArea.getSiteStoreKey(tab.url);
        /* Auto exempt all tabs that exist for this hostname that are not in the same container */
        if (tabStoreKey === assignmentStoreKey &&
            this.getUserContextIdFromCookieStore(tab) !== userContextId) {
          return true;
        }
        return false;
      }).map((tab) => {
        return tab.id;
      });

      await this.storageArea.set(pageUrl, {
        userContextId,
        neverAsk: false
      }, exemptedTabIds);
      actionName = "added";
    } else {
      await this.storageArea.remove(pageUrl);
      actionName = "removed";
    }
    browser.tabs.sendMessage(tabId, {
      text: `Successfully ${actionName} site to always open in this container`
    });
    const tab = await browser.tabs.get(tabId);
    this.calculateContextMenu(tab);
  },

  async _getAssignment(tab) {
    const cookieStore = this.getUserContextIdFromCookieStore(tab);
    // Ensure we have a cookieStore to assign to
    if (cookieStore
        && this.isTabPermittedAssign(tab)) {
      return await this.storageArea.get(tab.url);
    }
    return false;
  },

  _getByContainer(userContextId) {
    return this.storageArea.getAssignedSites(userContextId);
  },

  removeContextMenu() {
    // There is a focus issue in this menu where if you change window with a context menu click
    // you get the wrong menu display because of async
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1215376#c16
    // We also can't change for always private mode
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1352102
    browser.contextMenus.remove(this.MENU_ASSIGN_ID);
    browser.contextMenus.remove(this.MENU_REMOVE_ID);
    browser.contextMenus.remove(this.MENU_SEPARATOR_ID);
    browser.contextMenus.remove(this.MENU_HIDE_ID);
    browser.contextMenus.remove(this.MENU_MOVE_ID);
  },

  async calculateContextMenu(tab) {
    this.removeContextMenu();
    const siteSettings = await this._getAssignment(tab);
    // Return early and not add an item if we have false
    // False represents assignment is not permitted
    if (siteSettings === false) {
      return false;
    }
    let checked = false;
    let menuId = this.MENU_ASSIGN_ID;
    const tabUserContextId = this.getUserContextIdFromCookieStore(tab);
    if (siteSettings &&
        Number(siteSettings.userContextId) === Number(tabUserContextId)) {
      checked = true;
      menuId = this.MENU_REMOVE_ID;
    }
    browser.contextMenus.create({
      id: menuId,
      title: "Always Open in This Container",
      checked,
      type: "checkbox",
      contexts: ["all"],
    });

    browser.contextMenus.create({
      id: this.MENU_SEPARATOR_ID,
      type: "separator",
      contexts: ["all"],
    });

    browser.contextMenus.create({
      id: this.MENU_HIDE_ID,
      title: "Hide This Container",
      contexts: ["all"],
    });

    browser.contextMenus.create({
      id: this.MENU_MOVE_ID,
      title: "Move Tabs to a New Window",
      contexts: ["all"],
    });
  },

  encodeURLProperty(url) {
    return encodeURIComponent(url).replace(/[!'()*]/g, (c) => {
      const charCode = c.charCodeAt(0).toString(16);
      return `%${charCode}`;
    });
  },

  reloadPageInContainer(url, currentUserContextId, userContextId, index, active, neverAsk = false, openerTabId = null) {
    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    const loadPage = browser.extension.getURL("confirm-page.html");
    // False represents assignment is not permitted
    // If the user has explicitly checked "Never Ask Again" on the warning page we will send them straight there
    if (neverAsk) {
      browser.tabs.create({url, cookieStoreId, index, active, openerTabId});
    } else {
      let confirmUrl = `${loadPage}?url=${this.encodeURLProperty(url)}&cookieStoreId=${cookieStoreId}`;
      let currentCookieStoreId;
      if (currentUserContextId) {
        currentCookieStoreId = backgroundLogic.cookieStoreId(currentUserContextId);
        confirmUrl += `&currentCookieStoreId=${currentCookieStoreId}`;
      }
      browser.tabs.create({
        url: confirmUrl,
        cookieStoreId: currentCookieStoreId,
        openerTabId,
        index,
        active
      }).then(() => {
        // We don't want to sync this URL ever nor clutter the users history
        browser.history.deleteUrl({url: confirmUrl});
      }).catch((e) => {
        throw e;
      });
    }
  },

  async initBookmarksMenu() {
    browser.contextMenus.create({
      id: this.OPEN_IN_CONTAINER,
      title: "Open Bookmark in Container Tab",
      contexts: ["bookmark"],
    });

    const identities = await browser.contextualIdentities.query({});
    for (const identity of identities) {
      browser.contextMenus.create({
        parentId: this.OPEN_IN_CONTAINER,
        id: identity.cookieStoreId,
        title: identity.name,
        icons: { "16": `img/usercontext.svg#${identity.icon}` }
      });
    }
  },

  async removeBookmarksMenu() {
    browser.contextMenus.remove(this.OPEN_IN_CONTAINER);
    const identities = await browser.contextualIdentities.query({});
    for (const identity of identities) {
      browser.contextMenus.remove(identity.cookieStoreId);
    }
  },

  async initSync() {
    const syncInfo = await browser.storage.sync.get();
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

assignManager.init();

async function backup(options) {
  console.log("backup");
  // remove listeners to avoid an infinite loop!
  browser.storage.onChanged.removeListener(syncOnChangedListener);
  removeContextualIdentityListeners(syncCIListenerList);

  await updateSyncIdentities();
  await updateCookieStoreIdMap();
  await updateSyncSiteAssignments();
  if (options && options.uuid) await updateDeletedIdentityList(options.uuid);
  if (options && options.siteStoreKey) await addToDeletedSitesList(options.siteStoreKey);
  if (options && options.undelete) await removeFromDeletedSitesList(options.undelete);
  // for testing
  const storage = await browser.storage.sync.get();
  console.log("in sync: ", storage);
  const localStorage = await browser.storage.local.get();
  console.log("inLocal:", localStorage);
  // end testing 

  await browser.storage.onChanged.addListener(syncOnChangedListener);
  await addContextualIdentityListeners(syncCIListenerList);
}

async function updateSyncIdentities() {
  const identities = await browser.contextualIdentities.query({});
  await browser.storage.sync.set({ identities });
}

async function updateCookieStoreIdMap() {
  const cookieStoreIDmap = await identityState.getCookieStoreIDuuidMap();
  await browser.storage.sync.set({ cookieStoreIDmap });
}

async function updateSyncSiteAssignments() {
  const assignedSites = await assignManager.storageArea.getAssignedSites();
  await browser.storage.sync.set({ assignedSites });
}

async function updateDeletedIdentityList(deletedIdentityUUID) {
  let { deletedIdentityList } = await browser.storage.sync.get("deletedIdentityList");
  if (!deletedIdentityList) deletedIdentityList = [];
  if (deletedIdentityList.find(element => element === deletedIdentityUUID)) return;
  deletedIdentityList.push(deletedIdentityUUID);
  await browser.storage.sync.set({ deletedIdentityList });
}

async function addToDeletedSitesList(siteStoreKey) {
  let { deletedSiteList } = await browser.storage.sync.get("deletedSiteList");
  if (!deletedSiteList) deletedSiteList = [];
  if (deletedSiteList.find(element => element === siteStoreKey)) return;
  deletedSiteList.push(siteStoreKey);
  await browser.storage.sync.set({ deletedSiteList });
}

async function removeFromDeletedSitesList(siteStoreKey) {
  let { deletedSiteList } = await browser.storage.sync.get("deletedSiteList");
  if (!deletedSiteList) return;
  deletedSiteList = deletedSiteList.filter(element => element !== siteStoreKey);
  await browser.storage.sync.set({ deletedSiteList });
}

browser.resetMAC1 = async function () {
  // for debugging and testing: remove all containers except the default 4 and the first one created
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
  browser.storage.sync.set(syncData);

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
  browser.storage.sync.set(syncData);

  // FF1 with updates from FF2 (intial sync w/ default 4 + 1 with some changes)
  removeContextualIdentityListeners(syncCIListenerList);
  browser.contextualIdentities.update("firefox-container-3", {color:"purple", icon:"fruit"});
  //browser.contextualIdentities.create({name: "Container #02", icon: "vacation", color: "yellow"});
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
  browser.storage.sync.set(syncData);

  // FF1 with updates from FF2 (intial sync w/ default 4 + 1 with some changes)
  removeContextualIdentityListeners(syncCIListenerList);
  browser.contextualIdentities.update("firefox-container-3", {color:"purple", icon:"fruit"});
  //browser.contextualIdentities.create({name: "Container #02", icon: "vacation", color: "yellow"});
  browser.storage.local.clear();
  const localData = {"beenSynced":!0,"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":7,"identitiesState@@_firefox-container-1":{"hiddenTabs":[],"macAddonUUID":"4dc76734-5b71-4f2e-85d0-1cb199ae3821"},"identitiesState@@_firefox-container-2":{"hiddenTabs":[],"macAddonUUID":"30308b8d-393c-4375-b9a1-afc59f0dea79"},"identitiesState@@_firefox-container-3":{"hiddenTabs":[],"macAddonUUID":"7419c94d-85d7-4d76-94c0-bacef1de722f"},"identitiesState@@_firefox-container-4":{"hiddenTabs":[],"macAddonUUID":"2b9fe881-e552-4df9-8cab-922f4688bb68"},"identitiesState@@_firefox-container-6":{"hiddenTabs":[],"macAddonUUID":"db7f622e-682b-4556-968a-6e2542ff3b26"},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}};
  browser.storage.local.set(localData);

};

async function restore(inSync) {
  console.log("restore");
  await reconcileIdentitiesByUUID(inSync);
  await reconcileSiteAssignments(inSync);
  await backup();
}

function syncOnChangedListener (changes, areaName) {
  console.log("Listener Placed")
  console.trace();
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
      const deletedCookieStoreId = await identityState.lookupCookieStoreId(deletedUUID);
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
      //for testing purposes:
      const getIdent = await browser.contextualIdentities.get(localCookieStoreID);
      if (getIdent.name !== identityInfo.name) {console.log(getIdent.name, "Change name: ", identityInfo.name)}
      if (getIdent.color !== identityInfo.color) {console.log(getIdent.name, "Change color: ", identityInfo.color)}
      if (getIdent.icon !== identityInfo.icon) {console.log(getIdent.name, "Change icon: ", identityInfo.icon)}
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

async function restoreFirstRun(inSync) {
  console.log("restoreFirstRun");
  await reconcileIdentitiesByName(inSync);
  const firstRun = true;
  await reconcileSiteAssignments(inSync, firstRun);
  backup();
}

/*
 * Checks for the container name. If it exists, they are assumed to be the same container,
 * and the color and icon are overwritten from sync, if different.
 */
async function reconcileIdentitiesByName(inSync){
  console.log("reconcileIdentitiesByName");
  const localIdentities = await browser.contextualIdentities.query({});
  const syncIdentities = inSync.identities;
  const cookieStoreIDmap = inSync.cookieStoreIDmap;
  for (const syncIdentity of inSync.identities) {
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
    //for testing purposes:
    if (match.color !== syncIdentity.color) {console.log(match.name, "Change color: ", syncIdentity.color)}
    if (match.icon !== syncIdentity.icon) {console.log(match.name, "Change icon: ", syncIdentity.icon)}
    // end testing
    await browser.contextualIdentities.update(match.cookieStoreId, {name: syncIdentity.name, color: syncIdentity.color, icon: syncIdentity.icon});
    await identityState.updateUUID(match.cookieStoreId, syncIdentity.macAddonUUID);
  }
}

/*
 * Checks for site previously assigned. If it exists, and has the same container assignment, 
 * the assignment is kept. If it exists, but has a different assignment, the user is prompted
 * (not yet implemented). If it does not exist, it is created.
 */
async function reconcileSiteAssignments(inSync, firstSync = false) {
  console.log("reconcileSiteAssignments");
  const assignedSitesLocal = await assignManager.storageArea.getAssignedSites();
  const assignedSitesFromSync = inSync.assignedSites;
  if (inSync.hasOwnProperty("deletedSiteList")){
    for(const siteStoreKey of inSync.deletedSiteList) {
      if (assignedSitesLocal.hasOwnProperty(siteStoreKey)) {
        assignManager.storageArea.remove(siteStoreKey.replace(/^siteContainerMap@@_/, "https://"));
      }
    }
  }
  for(const urlKey of Object.keys(assignedSitesFromSync)) {
    if (assignedSitesLocal.hasOwnProperty(urlKey)) {
      const syncCookieStoreId = "firefox-container-" + assignedSitesFromSync[urlKey].userContextId;
      const syncUUID = await inSync.cookieStoreIDmap[syncCookieStoreId];
      const assignedSite = assignedSitesLocal[urlKey];
      const localCookieStoreId = "firefox-container-" + assignedSite.userContextId;
      const localIdentityUUID = await identityState.storageArea.get(localCookieStoreId).macAddonUUID;
      if (syncUUID === localIdentityUUID) {
        continue;
      }
      // overwrite with Sync data. Sync is the source of truth
      await setAsignmentWithUUID(syncUUID, assignedSite, urlKey);
      continue;
    }
    const assignedSite = assignedSitesFromSync[urlKey];
    console.log("new assignment ", assignedSite, ": ", assignedSite.userContextId)
    const newUUID = await inSync.cookieStoreIDmap["firefox-container-" + assignedSite.userContextId];
    await setAsignmentWithUUID(newUUID, assignedSite, urlKey);
  }
}

async function setAsignmentWithUUID (newUUID, assignedSite, urlKey) {
  const cookieStoreId = await identityState.lookupCookieStoreId(newUUID);
  if (cookieStoreId) {
    assignedSite.userContextId = cookieStoreId.replace(/^firefox-container-/, "");
    await assignManager.storageArea.set(
      urlKey.replace(/^siteContainerMap@@_/, "https://"),
      assignedSite
    );
    return;
  }
  throw new Error ("No cookieStoreId found for: ", newUUID, assignedSite, urlKey);
}

async function runSync() {
  browser.storage.onChanged.removeListener(syncOnChangedListener);
  removeContextualIdentityListeners(syncCIListenerList);
  console.log("runSync");
  await identityState.storageArea.cleanup();
  const inSync = await browser.storage.sync.get();
  await cleanupSync(inSync);
  if (Object.entries(inSync).length === 0){
    console.log("no sync storage, backing up...");
    await backup();
    return;
  }
  console.log("storage found, attempting to restore ...");
  await restore(inSync);
}

const syncCIListenerList = [backup, addToDeletedList, backup];

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
  console.log("addToDeletedList", identity.cookieStoreId)
  const deletedUUID = await identityState.lookupMACaddonUUID(identity.cookieStoreId);
  await identityState.storageArea.remove(identity.cookieStoreId)
  console.log(deletedUUID)
  backup({uuid: deletedUUID});
}

async function runFirstSync() {
  console.log("runFirstSync");
  await identityState.storageArea.cleanup();
  const localIdentities = await browser.contextualIdentities.query({});
  await addUUIDsToContainers(localIdentities);
  const inSync = await browser.storage.sync.get();
  if (Object.entries(inSync).length === 0){
    console.log("no sync storage, backing up...");
    await backup();
  } else {
    await cleanupSync(inSync);
    console.log("storage found, attempting to restore ...");
    await restoreFirstRun(inSync);
  }
  await assignManager.storageArea.setSynced();
}

async function addUUIDsToContainers(localIdentities) {
  for (const identity of localIdentities) {
    await identityState.addUUID(identity.cookieStoreId);
  }
}

async function cleanupSync(inSync) {
  console.log("cleanupSync")
  const identitiesList = inSync.identities;
  console.log(identitiesList)
  const cookieStoreIDmap = inSync.cookieStoreIDmap;
  console.log(cookieStoreIDmap)
  for(const cookieStoreId of Object.keys(cookieStoreIDmap)) {
    const match = identitiesList.find(syncIdentity => syncIdentity.cookieStoreId === cookieStoreId);
    if (!match) {
      delete inSync.cookieStoreIDmap[cookieStoreId];
      await browser.storage.sync.set({cookieStoreIDmap: inSync.cookieStoreIDmap});
      console.log("removed ", cookieStoreId, " from sync list");
    }
  }
}