const assignManager = {
  MENU_ASSIGN_ID: "open-in-this-container",
  MENU_REMOVE_ID: "remove-open-in-this-container",
  storageArea: {
    area: browser.storage.local,
    exemptedTabs: {},

    getSiteStoreKey(pageUrl) {
      const url = new window.URL(pageUrl);
      const storagePrefix = "siteContainerMap@@_";
      return `${storagePrefix}${url.hostname}`;
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
      const sitesByContainer = await this.getByContainer(userContextId);
      this.area.remove(Object.keys(sitesByContainer));
    },

    async getByContainer(userContextId) {
      const sites = {};
      const siteConfigs = await this.area.get();
      Object.keys(siteConfigs).forEach((key) => {
        // For some reason this is stored as string... lets check them both as that
        if (String(siteConfigs[key].userContextId) === String(userContextId)) {
          const site = siteConfigs[key];
          // In hindsight we should have stored this
          // TODO file a follow up to clean the storage onLoad
          site.hostname = key.replace(/^siteContainerMap@@_/, "");
          sites[key] = site;
        }
      });
      return sites;
    }
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

  init() {
    browser.contextMenus.onClicked.addListener((info, tab) => {
      this._onClickedHandler(info, tab);
    });

    // Before a request is handled by the browser we decide if we should route through a different container
    browser.webRequest.onBeforeRequest.addListener((options) => {
      if (options.frameId !== 0 || options.tabId === -1) {
        return {};
      }
      this.removeContextMenu();
      return Promise.all([
        browser.tabs.get(options.tabId),
        this.storageArea.get(options.url)
      ]).then(([tab, siteSettings]) => {
        const userContextId = this.getUserContextIdFromCookieStore(tab);
        if (!siteSettings
            || userContextId === siteSettings.userContextId
            || tab.incognito
            || this.storageArea.isExempted(options.url, tab.id)) {
          return {};
        }

        this.reloadPageInContainer(options.url, userContextId, siteSettings.userContextId, tab.index + 1, siteSettings.neverAsk);
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
        if (backgroundLogic.NEW_TAB_PAGES.has(tab.url)
            || (messageHandler.lastCreatedTab
            && messageHandler.lastCreatedTab.id === tab.id)) {
          browser.tabs.remove(tab.id);
        }
        return {
          cancel: true,
        };
      }).catch((e) => {
        throw e;
      });
    },{urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);
  },

  async _onClickedHandler(info, tab) {
    const userContextId = this.getUserContextIdFromCookieStore(tab);
    // Mapping ${URL(info.pageUrl).hostname} to ${userContextId}
    if (userContextId) {
     // let actionName;
      let remove;
      if (info.menuItemId === this.MENU_ASSIGN_ID) {
        remove = false;
      } else {
        remove = true;
      }
      await this._setOrRemoveAssignment(tab.id, info.pageUrl, userContextId, remove);
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
    backgroundLogic.sendTelemetryPayload({
      event: `${actionName}-container-assignment`,
      userContextId: userContextId,
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
  },

  async calculateContextMenu(tab) {
    this.removeContextMenu();
    const siteSettings = await this._getAssignment(tab);
    // Return early and not add an item if we have false
    // False represents assignment is not permitted
    if (siteSettings === false) {
      return false;
    }
    // ✓ This is to mitigate https://bugzilla.mozilla.org/show_bug.cgi?id=1351418
    let prefix = "   "; // Alignment of non breaking space, unknown why this requires so many spaces to align with the tick
    let menuId = this.MENU_ASSIGN_ID;
    const tabUserContextId = this.getUserContextIdFromCookieStore(tab);
    if (siteSettings &&
        Number(siteSettings.userContextId) === Number(tabUserContextId)) {
      prefix = "✓";
      menuId = this.MENU_REMOVE_ID;
    }
    browser.contextMenus.create({
      id: menuId,
      title: `${prefix} Always Open in This Container`,
      checked: true,
      contexts: ["all"],
    });
  },

  reloadPageInContainer(url, currentUserContextId, userContextId, index, neverAsk = false) {
    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    const loadPage = browser.extension.getURL("confirm-page.html");
    // False represents assignment is not permitted
    // If the user has explicitly checked "Never Ask Again" on the warning page we will send them straight there
    if (neverAsk) {
      browser.tabs.create({url, cookieStoreId, index});
      backgroundLogic.sendTelemetryPayload({
        event: "auto-reload-page-in-container",
        userContextId: userContextId,
      });
    } else {
      backgroundLogic.sendTelemetryPayload({
        event: "prompt-to-reload-page-in-container",
        userContextId: userContextId,
      });
      let confirmUrl = `${loadPage}?url=${encodeURIComponent(url)}&cookieStoreId=${cookieStoreId}`;
      let currentCookieStoreId;
      if (currentUserContextId) {
        currentCookieStoreId = backgroundLogic.cookieStoreId(currentUserContextId);
        confirmUrl += `&currentCookieStoreId=${currentCookieStoreId}`;
      }
      browser.tabs.create({
        url: confirmUrl,
        cookieStoreId: currentCookieStoreId,
        index
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
