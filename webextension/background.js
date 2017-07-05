const MAJOR_VERSIONS = ["2.3.0", "2.4.0"];
const LOOKUP_KEY = "$ref";

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
    const cookieStore = tab.cookieStoreId;
    const container = cookieStore.replace("firefox-container-", "");
    if (container !== cookieStore) {
      return container;
    }
    return false;
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


const backgroundLogic = {
  NEW_TAB_PAGES: new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
  ]),

  deleteContainer(userContextId) {
    this.sendTelemetryPayload({
      event: "delete-container",
      userContextId
    });

    const removeTabsPromise = this._containerTabs(userContextId).then((tabs) => {
      const tabIds = tabs.map((tab) => tab.id);
      return browser.tabs.remove(tabIds);
    });

    return new Promise((resolve) => {
      removeTabsPromise.then(() => {
        const removed = browser.contextualIdentities.remove(this.cookieStoreId(userContextId));
        removed.then(() => {
          assignManager.deleteContainer(userContextId);
          browser.runtime.sendMessage({
            method: "forgetIdentityAndRefresh"
          }).then(() => {
            resolve({done: true, userContextId});
          }).catch((e) => {throw e;});
        }).catch((e) => {throw e;});
      }).catch((e) => {throw e;});
    });
  },

  createOrUpdateContainer(options) {
    let donePromise;
    if (options.userContextId !== "new") {
      donePromise = browser.contextualIdentities.update(
        this.cookieStoreId(options.userContextId),
        options.params
      );
      this.sendTelemetryPayload({
        event: "edit-container",
        userContextId: options.userContextId
      });
    } else {
      donePromise = browser.contextualIdentities.create(options.params);
      this.sendTelemetryPayload({
        event: "add-container"
      });
    }
    return donePromise.then(() => {
      browser.runtime.sendMessage({
        method: "refreshNeeded"
      });
    });
  },

  openTab(options) {
    let url = options.url || undefined;
    const userContextId = ("userContextId" in options) ? options.userContextId : 0;
    const active = ("nofocus" in options) ? options.nofocus : true;
    const source = ("source" in options) ? options.source : null;

    // Only send telemetry for tabs opened by UI - i.e., not via showTabs
    if (source && userContextId) {
      this.sendTelemetryPayload({
        "event": "open-tab",
        "eventSource": source,
        "userContextId": userContextId,
        "clickedContainerTabCount": LOOKUP_KEY
      });
    }
    // Autofocus url bar will happen in 54: https://bugzilla.mozilla.org/show_bug.cgi?id=1295072

    // We can't open new tab pages, so open a blank tab. Used in tab un-hide
    if (this.NEW_TAB_PAGES.has(url)) {
      url = undefined;
    }

    // Unhide all hidden tabs
    browser.runtime.sendMessage({
      method: "showTabs",
      userContextId: options.userContextId
    });
    return browser.tabs.create({
      url,
      active,
      pinned: options.pinned || false,
      cookieStoreId: backgroundLogic.cookieStoreId(options.userContextId)
    });
  },

  sendTelemetryPayload(message = {}) {
    if (!message.event) {
      throw new Error("Missing event name for telemetry");
    }
    message.method = "sendTelemetryPayload";
    browser.runtime.sendMessage(message);
  },

  cookieStoreId(userContextId) {
    return `firefox-container-${userContextId}`;
  },

  _containerTabs(userContextId) {
    return browser.tabs.query({
      cookieStoreId: this.cookieStoreId(userContextId)
    }).catch((e) => {throw e;});
  },
};

const messageHandler = {
  // After the timer completes we assume it's a tab the user meant to keep open
  // We use this to catch redirected tabs that have just opened
  // If this were in platform we would change how the tab opens based on "new tab" link navigations such as ctrl+click
  LAST_CREATED_TAB_TIMER: 2000,

  init() {
    // Handles messages from webextension code
    browser.runtime.onMessage.addListener((m) => {
      let response;

      switch (m.method) {
      case "deleteContainer":
        response = backgroundLogic.deleteContainer(m.message.userContextId);
        break;
      case "createOrUpdateContainer":
        response = backgroundLogic.createOrUpdateContainer(m.message);
        break;
      case "openTab":
        // Same as open-tab for index.js
        response = backgroundLogic.openTab(m.message);
        break;
      case "neverAsk":
        assignManager._neverAsk(m);
        break;
      case "getAssignment":
        response = browser.tabs.get(m.tabId).then((tab) => {
          return assignManager._getAssignment(tab);
        });
        break;
      case "getAssignmentObjectByContainer":
        response = assignManager._getByContainer(m.message.userContextId);
        break;
      case "setOrRemoveAssignment":
        // m.tabId is used for where to place the in content message
        // m.url is the assignment to be removed/added
        response = browser.tabs.get(m.tabId).then((tab) => {
          return assignManager._setOrRemoveAssignment(tab.id, m.url, m.userContextId, m.value);
        });
        break;
      case "exemptContainerAssignment":
        response = assignManager._exemptTab(m);
        break;
      }
      return response;
    });

    // Handles messages from sdk code
    const port = browser.runtime.connect();
    port.onMessage.addListener(m => {
      switch (m.type) {
      case "lightweight-theme-changed":
        themeManager.update(m.message);
        break;
      case "open-tab":
        backgroundLogic.openTab(m.message);
        break;
      default:
        throw new Error(`Unhandled message type: ${m.message}`);
      }
    });

    browser.tabs.onCreated.addListener((tab) => {
      // This works at capturing the tabs as they are created
      // However we need onFocusChanged and onActivated to capture the initial tab
      if (tab.id === -1) {
        return {};
      }
      tabPageCounter.initTabCounter(tab);
    });

    browser.tabs.onRemoved.addListener((tabId) => {
      if (tabId === -1) {
        return {};
      }
      tabPageCounter.sendTabCountAndDelete(tabId);
    });

    browser.tabs.onActivated.addListener((info) => {
      assignManager.removeContextMenu();
      browser.tabs.get(info.tabId).then((tab) => {
        tabPageCounter.initTabCounter(tab);
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        throw e;
      });
    });

    browser.windows.onFocusChanged.addListener((windowId) => {
      assignManager.removeContextMenu();
      // browserAction loses background color in new windows ...
      // https://bugzil.la/1314674
      // https://github.com/mozilla/testpilot-containers/issues/608
      // ... so re-call displayBrowserActionBadge on window changes
      displayBrowserActionBadge();
      browser.tabs.query({active: true, windowId}).then((tabs) => {
        if (tabs && tabs[0]) {
          tabPageCounter.initTabCounter(tabs[0]);
          assignManager.calculateContextMenu(tabs[0]);
        }
      }).catch((e) => {
        throw e;
      });
    });

    browser.idle.onStateChanged.addListener((newState) => {
      browser.tabs.query({}).then(tabs => {
        for (let tab of tabs) { // eslint-disable-line prefer-const
          if (newState === "idle") {
            tabPageCounter.sendTabCountAndDelete(tab.id, "user-went-idle");
          } else if (newState === "active" && tab.active) {
            tabPageCounter.initTabCounter(tab);
          }
        }
      }).catch(e => {
        throw e;
      });
    });

    browser.webRequest.onCompleted.addListener((details) => {
      if (details.frameId !== 0 || details.tabId === -1) {
        return {};
      }
      assignManager.removeContextMenu();

      browser.tabs.get(details.tabId).then((tab) => {
        tabPageCounter.incrementTabCount(tab);
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        throw e;
      });
    }, {urls: ["<all_urls>"], types: ["main_frame"]});

    // lets remember the last tab created so we can close it if it looks like a redirect
    browser.tabs.onCreated.addListener((details) => {
      this.lastCreatedTab = details;
      setTimeout(() => {
        this.lastCreatedTab = null;
      }, this.LAST_CREATED_TAB_TIMER);
    });

  }
};

const themeManager = {
  existingTheme: null,
  init() {
    this.check();
  },
  setPopupIcon(theme) {
    let icons = {
      16: "img/container-site-d-24.png",
      32: "img/container-site-d-48.png"
    };
    if (theme === "firefox-compact-dark@mozilla.org") {
      icons = {
        16: "img/container-site-w-24.png",
        32: "img/container-site-w-48.png"
      };
    }
    browser.browserAction.setIcon({
      path: icons
    });
  },
  check() {
    browser.runtime.sendMessage({
      method: "getTheme"
    }).then((theme) => {
      this.update(theme);
    }).catch(() => {
      throw new Error("Unable to get theme");
    });
  },
  update(theme) {
    if (this.existingTheme !== theme) {
      this.setPopupIcon(theme);
      this.existingTheme = theme;
    }
  }
};

const tabPageCounter = {
  counters: {},

  initTabCounter(tab) {
    if (tab.id in this.counters) {
      if (!("activity" in this.counters[tab.id])) {
        this.counters[tab.id].activity = {
          "cookieStoreId": tab.cookieStoreId,
          "pageRequests": 0
        };
      }
      if (!("tab" in this.counters[tab.id])) {
        this.counters[tab.id].tab = {
          "cookieStoreId": tab.cookieStoreId,
          "pageRequests": 0
        };
      }
    } else {
      this.counters[tab.id] = {};
      this.counters[tab.id].tab = {
        "cookieStoreId": tab.cookieStoreId,
        "pageRequests": 0
      };
      this.counters[tab.id].activity = {
        "cookieStoreId": tab.cookieStoreId,
        "pageRequests": 0
      };
    }
  },

  sendTabCountAndDelete(tabId, why = "user-closed-tab") {
    if (!(this.counters[tabId])) {
      return;
    }
    if (why === "user-closed-tab" && this.counters[tabId].tab) {
      backgroundLogic.sendTelemetryPayload({
        event: "page-requests-completed-per-tab",
        userContextId: this.counters[tabId].tab.cookieStoreId,
        pageRequestCount: this.counters[tabId].tab.pageRequests
      });
      // When we send the ping because the user closed the tab,
      // delete both the 'tab' and 'activity' counters
      delete this.counters[tabId];
    } else if (why === "user-went-idle" && this.counters[tabId].activity) {
      backgroundLogic.sendTelemetryPayload({
        event: "page-requests-completed-per-activity",
        userContextId: this.counters[tabId].activity.cookieStoreId,
        pageRequestCount: this.counters[tabId].activity.pageRequests
      });
      // When we send the ping because the user went idle,
      // only reset the 'activity' counter
      this.counters[tabId].activity = {
        "cookieStoreId": this.counters[tabId].tab.cookieStoreId,
        "pageRequests": 0
      };
    }
  },

  incrementTabCount(tab) {
    this.counters[tab.id].tab.pageRequests++;
    this.counters[tab.id].activity.pageRequests++;
  }
};

assignManager.init();
themeManager.init();
// Lets do this last as theme manager did a check before connecting before
messageHandler.init();

browser.runtime.sendMessage({
  method: "getPreference",
  pref: "browser.privatebrowsing.autostart"
}).then(pbAutoStart => {

  // We don't want to disable the addon if we are in auto private-browsing.
  if (!pbAutoStart) {
    browser.tabs.onCreated.addListener(tab => {
      if (tab.incognito) {
        disableAddon(tab.id);
      }
    });

    browser.tabs.query({}).then(tabs => {
      for (let tab of tabs) { // eslint-disable-line prefer-const
        if (tab.incognito) {
          disableAddon(tab.id);
        }
      }
    }).catch(() => {});
  }
}).catch(() => {});

function disableAddon(tabId) {
  browser.browserAction.disable(tabId);
  browser.browserAction.setTitle({ tabId, title: "Containers disabled in Private Browsing Mode" });
}

async function getExtensionInfo() {
  const manifestPath = browser.extension.getURL("manifest.json");
  const response = await fetch(manifestPath);
  const extensionInfo = await response.json();
  return extensionInfo;
}

async function displayBrowserActionBadge() {
  const extensionInfo = await getExtensionInfo();
  const storage = await browser.storage.local.get({browserActionBadgesClicked: []});

  if (MAJOR_VERSIONS.indexOf(extensionInfo.version) > -1 &&
      storage.browserActionBadgesClicked.indexOf(extensionInfo.version) < 0) {
    browser.browserAction.setBadgeBackgroundColor({color: "rgba(0,217,0,255)"});
    browser.browserAction.setBadgeText({text: "NEW"});
  }
}
displayBrowserActionBadge();
