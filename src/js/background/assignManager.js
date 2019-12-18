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

    getSynced() {
      const beenSynced = this.area.get("beenSynced");
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

    set(pageUrl, data, exemptedTabIds) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      if (exemptedTabIds) {
        exemptedTabIds.forEach((tabId) => {
          this.setExempted(pageUrl, tabId);
        });
      }
      return this.area.set({
        [siteStoreKey]: data
      });
    },

    remove(pageUrl) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      // When we remove an assignment we should clear all the exemptions
      this.removeExempted(pageUrl);
      return this.area.remove([siteStoreKey]);
    },

    async deleteContainer(userContextId) {
      const sitesByContainer = await this.getAssignedSites(userContextId);
      this.area.remove(Object.keys(sitesByContainer));
    },

    async getAssignedSites(userContextId = null) {
      const sites = {};
      const siteConfigs = await this.area.get();
      for(const key of Object.keys(siteConfigs)) {
        if (key.includes("siteContainerMap@@_")) {
        // For some reason this is stored as string... lets check them both as that
          if (!!userContextId && String(siteConfigs[key].userContextId) !== String(userContextId)) {
            continue;
          }
          const site = siteConfigs[key];
          // In hindsight we should have stored this
          // TODO file a follow up to clean the storage onLoad
          site.hostname = key.replace(/^siteContainerMap@@_/, "");
          sites[key] = site;
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
    console.log("initSync");
    const beenSynced = await assignManager.storageArea.getSynced();
    if (beenSynced){
      runSync();
      return;
    }
    runFirstSync();
  },
};

assignManager.init();

async function backup() {
  browser.storage.onChanged.removeListener(runSync);
  const identities = await browser.contextualIdentities.query({});
  console.log("backup", identities);
  await browser.storage.sync.set({ identities: identities });
  const cookieStoreIDmap = await identityState.getCookieStoreIDuuidMap();
  await browser.storage.sync.set({ cookieStoreIDmap: cookieStoreIDmap });
  const assignedSites = await assignManager.storageArea.getAssignedSites();
  await browser.storage.sync.set({ assignedSites: assignedSites});
  const storage = await browser.storage.sync.get();
  console.log("in sync: ", storage);
  //browser.storage.onChanged.addListener(runSync);
}

browser.resetMAC1 = async function () {
  // for debugging and testing: remove all containers except the default 4 and the first one created
  browser.storage.onChanged.removeListener(runSync);

  // sync state on install: no sync data
  await browser.storage.sync.clear();

  // FF1: no sync, Only default containers and 1 extra
  browser.storage.local.clear();
  const localData = {"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":6,"identitiesState@@_firefox-container-1":{"hiddenTabs":[]},"identitiesState@@_firefox-container-2":{"hiddenTabs":[]},"identitiesState@@_firefox-container-3":{"hiddenTabs":[]},"identitiesState@@_firefox-container-4":{"hiddenTabs":[]},"identitiesState@@_firefox-container-6":{"hiddenTabs":[]},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":true},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":true},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":false}};
  browser.storage.local.set(localData);
};

browser.resetMAC2 = async function () {
  // for debugging and testing: remove all containers except the default 4 and the first one created
  browser.storage.onChanged.removeListener(runSync);

  // sync state after FF1 (default + 1)
  await browser.storage.sync.clear();
  const syncData = {"cookieStoreIDmap":{"firefox-container-1":"4dc76734-5b71-4f2e-85d0-1cb199ae3821","firefox-container-2":"30308b8d-393c-4375-b9a1-afc59f0dea79","firefox-container-3":"7419c94d-85d7-4d76-94c0-bacef1de722f","firefox-container-4":"2b9fe881-e552-4df9-8cab-922f4688bb68","firefox-container-6":"db7f622e-682b-4556-968a-6e2542ff3b26"},"assignedSites":{"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}},"identities":[{"name":"Personal","icon":"fingerprint","iconUrl":"resource://usercontext-content/fingerprint.svg","color":"blue","colorCode":"#37adff","cookieStoreId":"firefox-container-1"},{"name":"Work","icon":"briefcase","iconUrl":"resource://usercontext-content/briefcase.svg","color":"orange","colorCode":"#ff9f00","cookieStoreId":"firefox-container-2"},{"name":"Banking","icon":"dollar","iconUrl":"resource://usercontext-content/dollar.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-3"},{"name":"Shopping","icon":"cart","iconUrl":"resource://usercontext-content/cart.svg","color":"pink","colorCode":"#ff4bda","cookieStoreId":"firefox-container-4"},{"name":"Container #01","icon":"chill","iconUrl":"resource://usercontext-content/chill.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-6"}]};
  browser.storage.sync.set(syncData);

  // FF2 (intial sync w/ default 4 + 1 with some changes)
  removeContextualIdentityListeners(backup);
  browser.contextualIdentities.update("firefox-container-2", {color:"purple"});
  browser.contextualIdentities.update("firefox-container-4", {icon:"pet"});
  browser.storage.local.clear();
  const localData = {"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":7,"identitiesState@@_firefox-container-1":{"hiddenTabs":[]},"identitiesState@@_firefox-container-2":{"hiddenTabs":[]},"identitiesState@@_firefox-container-3":{"hiddenTabs":[]},"identitiesState@@_firefox-container-4":{"hiddenTabs":[]},"identitiesState@@_firefox-container-6":{"hiddenTabs":[]},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1}};
  browser.storage.local.set(localData);

};

browser.resetMAC3 = async function () {
  // for debugging and testing: remove all containers except the default 4 and the first one created
  browser.storage.onChanged.removeListener(runSync);

  // sync state after FF2 synced
  await browser.storage.sync.clear();
  const syncData = {"identities":[{"name":"Personal","icon":"fingerprint","iconUrl":"resource://usercontext-content/fingerprint.svg","color":"blue","colorCode":"#37adff","cookieStoreId":"firefox-container-1"},{"name":"Work","icon":"briefcase","iconUrl":"resource://usercontext-content/briefcase.svg","color":"orange","colorCode":"#ff9f00","cookieStoreId":"firefox-container-2"},{"name":"Banking","icon":"dollar","iconUrl":"resource://usercontext-content/dollar.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-3"},{"name":"Shopping","icon":"cart","iconUrl":"resource://usercontext-content/cart.svg","color":"pink","colorCode":"#ff4bda","cookieStoreId":"firefox-container-4"},{"name":"Container #01","icon":"chill","iconUrl":"resource://usercontext-content/chill.svg","color":"green","colorCode":"#51cd00","cookieStoreId":"firefox-container-6"}],"cookieStoreIDmap":{"firefox-container-1":"021feeaa-fb44-49ce-91fb-673277afbf95","firefox-container-2":"7bc490d6-b711-46b7-b5a0-c48411e787d3","firefox-container-3":"65e15c60-c90a-40c1-ac61-ca95f21c9325","firefox-container-4":"4c0eb718-b43f-4f62-b2dc-d0c5f912fe5d","firefox-container-6":"266d9c04-fdd5-4d27-a44e-73c69b88ce0a"},"assignedSites":{"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1,"hostname":"developer.mozilla.org"},"siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":!0,"hostname":"twitter.com"},"siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":!1,"hostname":"www.linkedin.com"}}};
  browser.storage.sync.set(syncData);

  // FF1 with updates from FF2 (intial sync w/ default 4 + 1 with some changes)
  removeContextualIdentityListeners(backup);
  browser.contextualIdentities.update("firefox-container-3", {color:"purple", icon:"fruit"});
  //browser.contextualIdentities.create({name: "Container #02", icon: "vacation", color: "yellow"});
  browser.storage.local.clear();
  const localData = {"beenSynced":!0,"browserActionBadgesClicked":["6.1.1"],"containerTabsOpened":10,"identitiesState@@_firefox-container-1":{"hiddenTabs":[],"macAddonUUID":"a12c1ecf-52cd-4a2d-99e3-5e479b396f75"},"identitiesState@@_firefox-container-14":{"hiddenTabs":[],"macAddonUUID":"ee62f98b-6ec8-4ac7-9c6f-b76b1c3d91b4"},"identitiesState@@_firefox-container-2":{"hiddenTabs":[],"macAddonUUID":"d7d9a177-6bd4-4558-9495-03a8fb69443c"},"identitiesState@@_firefox-container-3":{"hiddenTabs":[],"macAddonUUID":"e04fc120-53cb-4d96-b960-b5ef8d285eca"},"identitiesState@@_firefox-container-4":{"hiddenTabs":[],"macAddonUUID":"eaff1081-32df-4dcc-aac4-a378655671ae"},"identitiesState@@_firefox-container-6":{"hiddenTabs":[],"macAddonUUID":"c9069f2f-346f-43c1-a071-8bcb74fa3fc2"},"identitiesState@@_firefox-default":{"hiddenTabs":[]},"onboarding-stage":5,"siteContainerMap@@_developer.mozilla.org":{"userContextId":"6","neverAsk":!1},"siteContainerMap@@_www.hotjar.com":{"userContextId":"6","neverAsk":!0}};
  browser.storage.local.set(localData);

};

async function restore(inSync) {
  removeContextualIdentityListeners(backup);
  browser.storage.onChanged.removeListener(runSync);
  reconcileIdentitiesByUUID(inSync);
  reconcileSiteAssignments(inSync);
  addContextualIdentityListeners(backup);
  //browser.storage.onChanged.addListener(runSync);
  backup();
}

/*
 * Matches uuids in sync to uuids locally, and updates containers accordingly.
 * If there is no match, it creates the new container.
 */
async function reconcileIdentitiesByUUID(inSync) {
  const syncIdentities = inSync.identities;
  const syncCookieStoreIDmap = inSync.cookieStoreIDmap;

  for (const syncCookieStoreID of Object.keys(syncCookieStoreIDmap)) {
    const syncUUID = syncCookieStoreIDmap[syncCookieStoreID];
    //find localCookiesStoreID by looking up the syncUUID
    const localCookieStoreID = await identityState.lookupCookieStoreId(syncUUID);
    console.log("rIBU", localCookieStoreID);
    // get correct indentity info from sync
    identityInfo = findIdentityFromSync(syncCookieStoreID, syncIdentities);
    console.log(identityInfo);
    if (localCookieStoreID) {
      // update the local container with the sync data
      console.log(localCookieStoreID);
      browser.contextualIdentities.update(localCookieStoreID, identityInfo);
      continue;
    }
    //not found, create new with same UUID
    const newIdentity = browser.contextualIdentities.create(identityInfo);
    indentityState.updateUUID(newIdentity.cookieStoreId, syncUUID);
  }
}

function findIdentityFromSync(cookieStoreId, identitiesList){
  console.log(cookieStoreId, identitiesList);
  for (const identity of identitiesList) {
    const { name, color, icon } = identity;
    if (identity.cookieStoreId === cookieStoreId) return { name, color, icon };
  }
}

async function restoreFirstRun(inSync) {
  removeContextualIdentityListeners(backup);
  browser.storage.onChanged.removeListener(runSync);
  await reconcileIdentitiesByName(inSync);
  const firstRun = true;
  await reconcileSiteAssignments(inSync, firstRun);
  addContextualIdentityListeners(backup);
  browser.storage.onChanged.addListener(runSync);
  backup();
}

/*
 * Checks for the container name. If it exists, they are assumed to be the same container,
 * and the color and icon are overwritten from sync, if different.
 */
async function reconcileIdentitiesByName(inSync){
  const localIdentities = await browser.contextualIdentities.query({});
  const syncIdentities = inSync.identities;
  const cookieStoreIDmap = inSync.cookieStoreIDmap;
  for (const syncIdentity of inSync.identities) {
    syncIdentity.macAddonUUID = cookieStoreIDmap[syncIdentity.cookieStoreId];
    const compareNames = function (localIdentity) { return (localIdentity.name === syncIdentity.name); };
    const match = localIdentities.find(compareNames);
    if (!match) {
      newIdentity = await browser.contextualIdentities.create({name: syncIdentity.name, color: syncIdentity.color, icon: syncIdentity.icon});
      identityState.updateUUID(newIdentity.cookieStoreId, syncIdentity.macAddonUUID);
      continue;
    }
    if (syncIdentity.color === match.color && syncIdentity.icon === match.icon) {
      console.log("everything is the same:", syncIdentity, match);
      identityState.updateUUID(match.cookieStoreId, syncIdentity.macAddonUUID);
      continue;
    }
    console.log("somethings are different:", syncIdentity, match);
    browser.contextualIdentities.update(match.cookieStoreId, {name: syncIdentity.name, color: syncIdentity.color, icon: syncIdentity.icon});
    identityState.updateUUID(match.cookieStoreId, syncIdentity.macAddonUUID);
  }
}

/*
 * Checks for site previously assigned. If it exists, and has the same container assignment, 
 * the assignment is kept. If it exists, but has a different assignment, the user is prompted
 * (not yet implemented). If it does not exist, it is created.
 */
async function reconcileSiteAssignments(inSync, firstSync = false) {
  const assignedSitesLocal = await assignManager.storageArea.getAssignedSites();
  console.log(assignedSitesLocal);
  const syncAssignedSites = inSync.assignedSites;
  console.log(syncAssignedSites);
  for(const key of Object.keys(syncAssignedSites)) {
    if (assignedSitesLocal.hasOwnProperty(key)) {
      const syncCookieStoreId = "firefox-container-" + syncAssignedSites[key].userContextId;
      const syncUUID = await inSync.cookieStoreIDmap[syncCookieStoreId];
      const assignedSite = assignedSitesLocal[key];
      const localCookieStoreId = "firefox-container-" + assignedSite.userContextId;
      if (syncUUID === identityState.storageArea.get(localCookieStoreId).macAddonUUID) {
        continue;
      }
      if (!firstSync) {
        // overwrite with Sync data
        setAsignmentWithUUID(syncUUID, assignedSite);
        // assignedSite.userContextId = identityState.lookupCookieStoreId(syncUUID).replace(/^firefox-container-/, ""); 
        // assignManager.storageArea.set(
        //   key.replace(/^siteContainerMap@@_/, "https://"),
        //   assignedSite
        // );
        continue;
      }
      // TODO: on First Sync only, if uuids are not the same, 
      // ask user where to assign the site.
      continue;
    }
    const assignedSite = syncAssignedSites[key];
    console.log("assignedSite", assignedSite);
    const newUUID = await inSync.cookieStoreIDmap["firefox-container-" + assignedSite.userContextId];
    console.log("newUUID", newUUID);
    // setAsignmentWithUUID(newUUID, assignedSite);
    const cookieStoreId = await identityState.lookupCookieStoreId(newUUID);
    assignedSite.userContextId = cookieStoreId.replace(/^firefox-container-/, "");
    assignManager.storageArea.set(
      key.replace(/^siteContainerMap@@_/, "https://"),
      assignedSite
    );
  }
}

async function setAsignmentWithUUID (newUUID, assignedSite) {
  console.log("setAssingment UUID: ", newUUID);
  const cookieStoreId = await identityState.lookupCookieStoreId(newUUID);
  console.log(cookieStoreId);
  // if (cookieStoreId) {
    assignedSite.userContextId = cookieStoreId.replace(/^firefox-container-/, "");
    console.log(assignedSite.userContextId);
    assignManager.storageArea.set(
      key.replace(/^siteContainerMap@@_/, "https://"),
      assignedSite
    );
  // }
}

async function runSync() {
  console.log("runSync");
  const inSync = await browser.storage.sync.get();
  if (Object.entries(inSync).length === 0){
    console.log("no sync storage, backing up...");
    backup();
    return;
  }
  console.log("storage found, attempting to restore ...");
  restore(inSync);
}

function addContextualIdentityListeners(listener) {
  browser.contextualIdentities.onCreated.addListener(listener);
  browser.contextualIdentities.onRemoved.addListener(listener);
  browser.contextualIdentities.onUpdated.addListener(listener);
}

function removeContextualIdentityListeners(listener) {
  browser.contextualIdentities.onCreated.removeListener(listener);
  browser.contextualIdentities.onRemoved.removeListener(listener);
  browser.contextualIdentities.onUpdated.removeListener(listener);
}

async function runFirstSync() {
  console.log("runFirstSync");
  const localIdentities = await browser.contextualIdentities.query({});
  addUUIDsToContainers(localIdentities);
  const inSync = await browser.storage.sync.get();
  if (Object.entries(inSync).length === 0){
    console.log("no sync storage, backing up...");
    backup();
  } else {
    console.log("storage found, attempting to restore ...");
    restoreFirstRun(inSync);
  }
  assignManager.storageArea.setSynced();
}

async function addUUIDsToContainers(localIdentities) {
  for (const identity of localIdentities) {
    identityState.addUUID(identity.cookieStoreId);
  }
}
