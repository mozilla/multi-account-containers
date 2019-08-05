/**
  Utils for dealing with hosts.
  
  E.g. www.google.com:443
  */
const HostUtils = {
  getHost(pageUrl) {
    const url = new window.URL(pageUrl);
    if (url.port === "80" || url.port === "443") {
      return `${url.hostname}`;
    } else {
      return `${url.hostname}${url.port}`;
    }
  },
  
  // Wildcard subdomains: https://github.com/mozilla/multi-account-containers/issues/473
  hasSubdomain(host) {
    return host.indexOf(".") >= 0;
  },
  
  removeSubdomain(host) {
    const indexOfDot = host.indexOf(".");
    if (indexOfDot < 0) {
      return null;
    } else {
      return host.substring(indexOfDot + 1);
    }
  }    
};

/**
  Store data in 'named stores'.
  
  (In actual fact, all data for all stores is stored in the same storage area,
  but this class provides accessor methods to get/set only the data that applies
  to one specific named store, as identified in the constructor.)
 */
class AssignStore {
  constructor(name) {
    this.prefix = `${name}@@_`;
  }

  _storeKeyForKey(key) {
    if (Array.isArray(key)) {
      return key.map(oneKey => oneKey.startsWith(this.prefix) ? oneKey : `${this.prefix}${oneKey}`);
    } else if (key) {
      return key.startsWith(this.prefix) ? key : `${this.prefix}${key}`;
    } else {
      return null;
    }
  }
  
  _keyForStoreKey(storeKey) {
    if (Array.isArray(storeKey)) {
      return storeKey.map(oneStoreKey => oneStoreKey.startsWith(this.prefix) ? oneStoreKey.substring(this.prefix.length) : null);
    } else if (storeKey) {
      return storeKey.startsWith(this.prefix) ? storeKey.substring(this.prefix.length) : null;
    } else {
      return null;
    }
  }
  
  get(key) {
    if (typeof key !== "string") { return Promise.reject(new Error(`[AssignStore.get] Invalid key: ${key}`)); }  
    const storeKey = this._storeKeyForKey(key);
    return new Promise((resolve, reject) => {
      browser.storage.local.get([storeKey]).then((storageResponse) => {
        if (storeKey in storageResponse) {
          resolve(storageResponse[storeKey]);
        } else {
          resolve(null);
        }
      }).catch((e) => {
        reject(e);
      });
    });
  }

  getAll(keys) {
    if (keys && !Array.isArray(keys)) { return Promise.reject(new Error(`[AssignStore.getAll] Invalid keys: ${keys}`)); }
    const storeKeys = this._storeKeyForKey(keys);
    return new Promise((resolve, reject) => {
      browser.storage.local.get(storeKeys).then((storageResponse) => {
        if (storageResponse) {
          resolve(Object.assign({}, ...Object.entries(storageResponse).map(([oneStoreKey, data]) => {
            const key = this._keyForStoreKey(oneStoreKey);
            return key ? { [key]: data } : null;
          })));
        } else {
          resolve(null);
        }
      }).catch((e) => {
        reject(e);
      });
    });
  }
  
  set(key, data) {
    if (typeof key !== "string") { return Promise.reject(new Error(`[AssignStore.set] Expected String, but received ${key}`)); }
    const storeKey = this._storeKeyForKey(key);
    return browser.storage.local.set({
      [storeKey]: data
    });
  }

  remove(key) {
    if (typeof key !== "string") { return Promise.reject(new Error(`[AssignStore.remove] Expected String, but received ${key}`)); }
    const storeKey = this._storeKeyForKey(key);
    return browser.storage.local.remove(storeKey);
  }
  
  removeAll(keys) {
    if (keys && !Array.isArray(keys)) { return Promise.reject(new Error(`[AssignStore.removeAll] Invalid keys: ${keys}`)); }
    const storeKeys = this._storeKeyForKey(keys);
    return browser.storage.local.remove(storeKeys);
  }
}

/**
  Manages mappings of Site Host <-> Wildcard Host.
  
  E.g. drive.google.com <-> google.com
  
  Wildcard subdomains: https://github.com/mozilla/multi-account-containers/issues/473
 */
const WildcardManager = {
  bySite:     new AssignStore("siteToWildcardMap"),
  byWildcard: new AssignStore("wildcardToSiteMap"),

  // Site -> Wildcard
  get(site) {
    return this.bySite.get(site);
  },
  
  async getAll(sites) {
    return this.bySite.getAll(sites);
  },
  
  async set(site, wildcard) {
    // Remove existing site -> wildcard
    const oldSite = await this.byWildcard.get(wildcard);
    if (oldSite) { await this.bySite.remove(oldSite); }
    
    // Set new mappings site <-> wildcard
    await this.bySite.set(site, wildcard);
    await this.byWildcard.set(wildcard, site);
  },

  async remove(site) {
    const wildcard = await this.bySite.get(site);
    if (!wildcard) { return; }
    
    await this.bySite.remove(site);
    await this.byWildcard.remove(wildcard);
  },
  
  async removeAll(sites) {
    const data = await this.bySite.getAll(sites);
    const existingSites = Object.keys(data);
    const existingWildcards = Object.values(data);
    
    await this.bySite.removeAll(existingSites);
    await this.byWildcard.removeAll(existingWildcards);
  },
    
  // Site -> Site that owns Wildcard
  async match(site) {
    // Keep stripping subdomains off site domain until match a wildcard domain
    do {
      // Use the ever-shortening site hostname as if it is a wildcard
      const siteHavingWildcard = await this.byWildcard.get(site);
      if (siteHavingWildcard) { return siteHavingWildcard; }
    } while ((site = HostUtils.removeSubdomain(site)));
    return null;
  }        
};

/**
  Main interface for managing assignments.
 */
const assignManager = {
  MENU_ASSIGN_ID: "open-in-this-container",
  MENU_REMOVE_ID: "remove-open-in-this-container",
  MENU_SEPARATOR_ID: "separator",
  MENU_HIDE_ID: "hide-container",
  MENU_MOVE_ID: "move-to-new-window-container",

  storageArea: {
    store: new AssignStore("siteContainerMap"),
    exemptedTabs: {},

    setExempted(host, tabId) {
      if (!(host in this.exemptedTabs)) {
        this.exemptedTabs[host] = [];
      }
      this.exemptedTabs[host].push(tabId);
    },

    removeExempted(host) {
      this.exemptedTabs[host] = [];
    },

    isExemptedUrl(pageUrl, tabId) {
      const host = HostUtils.getHost(pageUrl);
      if (!(host in this.exemptedTabs)) {
        return false;
      }
      return this.exemptedTabs[host].includes(tabId);
    },

    async matchUrl(pageUrl) {
      const host = HostUtils.getHost(pageUrl);
      
      // Try exact match
      const result = await this.get(host);
      if (result) { return result; }
      
      // Try wildcard match
      const wildcard = await WildcardManager.match(host);
      if (wildcard) { return await this.get(wildcard); }
      
      return null;
    },

    async get(host) {
      const result = await this.store.get(host);
      if (result) {
        if (result.host !== host) { result.host = host; }
        result.wildcard = await WildcardManager.get(host);
      }
      return result;
    },

    async set(host, data, exemptedTabIds, wildcard) {
      // Store exempted tabs
      if (exemptedTabIds) {
        exemptedTabIds.forEach((tabId) => {
          this.setExempted(host, tabId);
        });
      }
      // Store wildcard mapping
      if (wildcard) {
        if (wildcard === host) {
          await WildcardManager.remove(host);
        } else {
          await WildcardManager.set(host, wildcard);        
        }
      }
      // Do not store wildcard property
      if (data.wildcard) {
        data = Object.assign(data);
        delete data.wildcard;
      }
      // Store assignment
      return this.store.set(host, data);
    },

    async remove(host) {
      // When we remove an assignment we should clear all the exemptions
      this.removeExempted(host);
      // ...and also clear the wildcard mapping
      await WildcardManager.remove(host);
      
      return this.store.remove(host);
    },

    async deleteContainer(userContextId) {
      const sitesByContainer = await this.getByContainer(userContextId);
      const sites = Object.keys(sitesByContainer);
      
      sites.forEach((site) => {
        // When we remove an assignment we should clear all the exemptions
        this.removeExempted(site);
      });
      
      // ...and also clear the wildcard mappings
      await WildcardManager.removeAll(sites);

      return this.store.removeAll(sites);
    },

    async getByContainer(userContextId) {
      // Get sites
      const sitesConfig = await this.store.getAll();
      const sites = Object.assign({}, ...Object.entries(sitesConfig).map(([host, data]) => {
        // For some reason this is stored as string... lets check them both as that
        if (String(data.userContextId) === String(userContextId)) {
          // In hindsight we should have stored this
          // TODO file a follow up to clean the storage onLoad
          data.host = host;
          return { [host]: data };
        } else {
          return null;
        }      
      }));
      
      // Add wildcards
      const hosts = Object.keys(sites);
      if (hosts.length > 0) {
        const sitesToWildcards = await WildcardManager.getAll(hosts);
        Object.entries(sitesToWildcards).forEach(([site, wildcard]) => {
          sites[site].wildcard = wildcard;
        });
      }
      
      return sites;
    }
  },

  _neverAsk(m) {
    const pageUrl = m.pageUrl;
    if (m.neverAsk === true) {
      // If we have existing data and for some reason it hasn't been deleted etc lets update it
      this.storageArea.matchUrl(pageUrl).then((siteSettings) => {
        if (siteSettings) {
          siteSettings.neverAsk = true;
          return this.storageArea.set(siteSettings.host, siteSettings);
        }
      }).catch((e) => {
        throw e;
      });
    }
  },

  // We return here so the confirm page can load the tab when exempted
  async _exemptTab(m) {
    const pageUrl = m.pageUrl;
    const host = HostUtils.getHost(pageUrl);
    this.storageArea.setExempted(host, m.tabId);
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
      this.storageArea.matchUrl(options.url)
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
        || tab.incognito
        || this.storageArea.isExemptedUrl(options.url, tab.id)) {
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
      this._onClickedHandler(info, tab);
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
    // Ensure we are not in incognito mode
    const url = new URL(tab.url);
    if (url.protocol === "about:"
        || url.protocol === "moz-extension:"
        || tab.incognito) {
      return false;
    }
    return true;
  },

  async _setOrRemoveAssignment(tabId, pageUrl, userContextId, remove, options) {
    let actionName;

    // https://github.com/mozilla/testpilot-containers/issues/626
    // Context menu has stored context IDs as strings, so we need to coerce
    // the value to a string for accurate checking
    userContextId = String(userContextId);

    const assignmentHost = HostUtils.getHost(pageUrl);
    if (!remove) {
      const tabs = await browser.tabs.query({});
      const wildcardHost = options && options.wildcard ? options.wildcard : null;
      const exemptedTabIds = tabs.filter((tab) => {
        const tabHost = HostUtils.getHost(tab.url);
        /* Auto exempt all tabs that exist for this hostname that are not in the same container */
        if ( (tabHost === assignmentHost ||
              (wildcardHost && tabHost.endsWith(wildcardHost))) &&
            this.getUserContextIdFromCookieStore(tab) !== userContextId) {
          return true;
        }
        return false;
      }).map((tab) => {
        return tab.id;
      });
      
      await this.storageArea.set(assignmentHost, {
        userContextId,
        neverAsk: false
      }, exemptedTabIds, (wildcardHost || assignmentHost));
      actionName = "added";
    } else {
      await this.storageArea.remove(assignmentHost);
      actionName = "removed";
    }
    if (!options || !options.silent) {
      browser.tabs.sendMessage(tabId, {
        text: `Successfully ${actionName} site to always open in this container`
      });
    }
    const tab = await browser.tabs.get(tabId);
    this.calculateContextMenu(tab);
  },
  
  async _setOrRemoveWildcard(tabId, pageUrl, userContextId, wildcard) {
    // Remove assignment
    await this._setOrRemoveAssignment(tabId, pageUrl, userContextId, true, {silent:true});
    // Add assignment
    await this._setOrRemoveAssignment(tabId, pageUrl, userContextId, false, {wildcard:wildcard, silent:true});  
  },

  async _getAssignment(tab) {
    const cookieStore = this.getUserContextIdFromCookieStore(tab);
    // Ensure we have a cookieStore to assign to
    if (cookieStore
        && this.isTabPermittedAssign(tab)) {
      return await this.storageArea.matchUrl(tab.url);
    }
    return false;
  },

  _getByContainer(userContextId) {
    return this.storageArea.getByContainer(userContextId);
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
  }
};

assignManager.init();
