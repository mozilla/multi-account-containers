const assignManager = {
  CLOSEABLE_WINDOWS: new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
  ]),
  MENU_ASSIGN_ID: "open-in-this-container",
  MENU_REMOVE_ID: "remove-open-in-this-container",
  storageArea: {
    area: browser.storage.local,

    getSiteStoreKey(pageUrl) {
      const url = new window.URL(pageUrl);
      const storagePrefix = "siteContainerMap@@_";
      return `${storagePrefix}${url.hostname}`;
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

    set(pageUrl, data) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      return this.area.set({
        [siteStoreKey]: data
      });
    },

    remove(pageUrl) {
      const siteStoreKey = this.getSiteStoreKey(pageUrl);
      return this.area.remove([siteStoreKey]);
    },

    deleteContainer(userContextId) {
      const removeKeys = [];
      this.area.get().then((siteConfigs) => {
        Object.keys(siteConfigs).forEach((key) => {
          // For some reason this is stored as string... lets check them both as that
          if (String(siteConfigs[key].userContextId) === String(userContextId)) {
            removeKeys.push(key);
          }
        });
        this.area.remove(removeKeys);
      }).catch((e) => {
        throw e;
      });
    }
  },

  init() {
    browser.runtime.onMessage.addListener((neverAskMessage) => {
      const pageUrl = neverAskMessage.pageUrl;
      if (neverAskMessage.neverAsk === true) {
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
    });

    browser.contextMenus.onClicked.addListener((info, tab) => {
      const userContextId = this.getUserContextIdFromCookieStore(tab);
      // Mapping ${URL(info.pageUrl).hostname} to ${userContextId}
      if (userContextId) {
        let actionName;
        let storageAction;
        if (info.menuItemId === this.MENU_ASSIGN_ID) {
          actionName = "added";
          storageAction = this.storageArea.set(info.pageUrl, {
            userContextId,
            neverAsk: false
          });
        } else {
          actionName = "removed";
          storageAction = this.storageArea.remove(info.pageUrl);
        }
        storageAction.then(() => {
          browser.notifications.create({
            type: "basic",
            title: "Containers",
            message: `Successfully ${actionName} site to always open in this container`,
            iconUrl: browser.extension.getURL("/img/onboarding-1.png")
          });
          browser.runtime.sendMessage({
            method: "sendTelemetryPayload",
            event: `${actionName}-container-assignment`,
            userContextId: userContextId,
          });
          this.calculateContextMenu(tab);
        }).catch((e) => {
          throw e;
        });
      }
    });

    // Before a request is handled by the browser we decide if we should route through a different container
    browser.webRequest.onBeforeRequest.addListener((options) => {
      if (options.frameId !== 0 || options.tabId === -1) {
        return {};
      }
      return Promise.all([
        browser.tabs.get(options.tabId),
        this.storageArea.get(options.url)
      ]).then(([tab, siteSettings]) => {
        const userContextId = this.getUserContextIdFromCookieStore(tab);
        if (!siteSettings
            || userContextId === siteSettings.userContextId
            || tab.incognito) {
          return {};
        }

        this.reloadPageInContainer(options.url, siteSettings.userContextId, tab.index + 1, siteSettings.neverAsk);
        this.calculateContextMenu(tab);
        // If the user just opened the tab, we can auto close it
        if (this.CLOSEABLE_WINDOWS.has(tab.url)) {
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
    if (this.CLOSEABLE_WINDOWS.has(tab.url)
        || tab.incognito) {
      return false;
    }
    return true;
  },

  calculateContextMenu(tab) {
    // There is a focus issue in this menu where if you change window with a context menu click
    // you get the wrong menu display because of async
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1215376#c16
    // We also can't change for always private mode
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1352102
    const cookieStore = this.getUserContextIdFromCookieStore(tab);
    browser.contextMenus.remove(this.MENU_ASSIGN_ID);
    browser.contextMenus.remove(this.MENU_REMOVE_ID);
    // Ensure we have a cookieStore to assign to
    if (cookieStore
        && this.isTabPermittedAssign(tab)) {
      this.storageArea.get(tab.url).then((siteSettings) => {
        // ✓ This is to mitigate https://bugzilla.mozilla.org/show_bug.cgi?id=1351418
        let prefix = "   "; // Alignment of non breaking space, unknown why this requires so many spaces to align with the tick
        let menuId = this.MENU_ASSIGN_ID;
        if (siteSettings) {
          prefix = "✓";
          menuId = this.MENU_REMOVE_ID;
        }
        browser.contextMenus.create({
          id: menuId,
          title: `${prefix} Always Open in This Container`,
          checked: true,
          contexts: ["all"],
        });
      }).catch((e) => {
        throw e;
      });
    }
  },

  reloadPageInContainer(url, userContextId, index, neverAsk = false) {
    const loadPage = browser.extension.getURL("confirm-page.html");
    // If the user has explicitly checked "Never Ask Again" on the warning page we will send them straight there
    if (neverAsk) {
      browser.tabs.create({url, cookieStoreId: `firefox-container-${userContextId}`, index});
      browser.runtime.sendMessage({
        method: "sendTelemetryPayload",
        event: "auto-reload-page-in-container",
        userContextId: userContextId,
      });
    } else {
      browser.runtime.sendMessage({
        method: "sendTelemetryPayload",
        event: "prompt-to-reload-page-in-container",
        userContextId: userContextId,
      });
      const confirmUrl = `${loadPage}?url=${url}`;
      browser.tabs.create({url: confirmUrl, cookieStoreId: `firefox-container-${userContextId}`, index}).then(() => {
        // We don't want to sync this URL ever nor clutter the users history
        browser.history.deleteUrl({url: confirmUrl});
      }).catch((e) => {
        throw e;
      });
    }
  }
};

const messageHandler = {
  init() {
    // Handles messages from index.js
    const port = browser.runtime.connect();
    port.onMessage.addListener(m => {
      switch (m.type) {
      case "lightweight-theme-changed":
        themeManager.update(m.message);
        break;
      case "delete-container":
        assignManager.deleteContainer(m.message.userContextId);
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
      browser.tabs.get(info.tabId).then((tab) => {
        tabPageCounter.initTabCounter(tab);
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        throw e;
      });
    });

    browser.windows.onFocusChanged.addListener((windowId) => {
      browser.tabs.query({active: true, windowId}).then((tabs) => {
        if (tabs && tabs[0]) {
          tabPageCounter.initTabCounter(tabs[0]);
          assignManager.calculateContextMenu(tabs[0]);
        }
      }).catch((e) => {
        throw e;
      });
    });

    browser.webRequest.onCompleted.addListener((details) => {
      if (details.frameId !== 0 || details.tabId === -1) {
        return {};
      }

      browser.tabs.get(details.tabId).then((tab) => {
        tabPageCounter.incrementTabCount(tab);
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        throw e;
      });
    }, {urls: ["<all_urls>"], types: ["main_frame"]});
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
  counter: {},

  initTabCounter(tab) {
    if (tab.id in this.counter) {
      return;
    }
    this.counter[tab.id] = {
      "cookieStoreId": tab.cookieStoreId,
      "pageRequests": 0
    };
  },

  sendTabCountAndDelete(tabId) {
    browser.runtime.sendMessage({
      method: "sendTelemetryPayload",
      event: "page-requests-completed-per-tab",
      userContextId: this.counter[tabId].cookieStoreId,
      pageRequestCount: this.counter[tabId].pageRequests
    });
    delete this.counter[tabId];
  },

  incrementTabCount(tab) {
    this.counter[tab.id].pageRequests++;
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
