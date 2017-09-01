const messageHandler = {
  // After the timer completes we assume it's a tab the user meant to keep open
  // We use this to catch redirected tabs that have just opened
  // If this were in platform we would change how the tab opens based on "new tab" link navigations such as ctrl+click
  LAST_CREATED_TAB_TIMER: 2000,
  unhideQueue: [],

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
      case "sortTabs":
        backgroundLogic.sortTabs();
        break;
      case "showTabs":
        backgroundLogic.showTabs({cookieStoreId: m.cookieStoreId});
        break;
      case "hideTabs":
        backgroundLogic.hideTabs({
          cookieStoreId: m.cookieStoreId,
          windowId: m.windowId
        });
        break;
      case "checkIncompatibleAddons":
        // TODO
        break;
      case "moveTabsToWindow":
        response = backgroundLogic.moveTabsToWindow({
          cookieStoreId: m.cookieStoreId,
          windowId: m.windowId
        });
        break;
      case "getTabs":
        response = backgroundLogic.getTabs({
          cookieStoreId: m.cookieStoreId,
          windowId: m.windowId
        });
        break;
      case "queryIdentitiesState":
        response = backgroundLogic.queryIdentitiesState(m.message.windowId);
        break;
      case "exemptContainerAssignment":
        response = assignManager._exemptTab(m);
        break;
      }
      return response;
    });

    if (browser.contextualIdentities.onRemoved) {
      browser.contextualIdentities.onRemoved.addListener(({contextualIdentity}) => {
        const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(contextualIdentity.cookieStoreId);
        backgroundLogic.deleteContainer(userContextId, true);
      });
    }

    browser.tabs.onActivated.addListener((info) => {
      assignManager.removeContextMenu();
      browser.tabs.get(info.tabId).then((tab) => {
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        throw e;
      });
    });

    browser.windows.onFocusChanged.addListener((windowId) => {
      this.onFocusChangedCallback(windowId);
    });

    browser.webRequest.onCompleted.addListener((details) => {
      if (details.frameId !== 0 || details.tabId === -1) {
        return {};
      }
      assignManager.removeContextMenu();

      browser.tabs.get(details.tabId).then((tab) => {
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        throw e;
      });
    }, {urls: ["<all_urls>"], types: ["main_frame"]});

    browser.tabs.onCreated.addListener((tab) => {
      // lets remember the last tab created so we can close it if it looks like a redirect
      this.lastCreatedTab = tab;
      if (tab.cookieStoreId) {
        this.unhideContainer(tab.cookieStoreId);
      }
      setTimeout(() => {
        this.lastCreatedTab = null;
      }, this.LAST_CREATED_TAB_TIMER);
    });
  },

  async unhideContainer(cookieStoreId) {
    if (!this.unhideQueue.includes(cookieStoreId)) {
      this.unhideQueue.push(cookieStoreId);
      // Unhide all hidden tabs
      await backgroundLogic.showTabs({
        cookieStoreId
      });
      this.unhideQueue.splice(this.unhideQueue.indexOf(cookieStoreId), 1);
    }
  },

  async onFocusChangedCallback(windowId) {
    assignManager.removeContextMenu();
    const currentWindow = await browser.windows.getCurrent();
    // browserAction loses background color in new windows ...
    // https://bugzil.la/1314674
    // https://github.com/mozilla/testpilot-containers/issues/608
    // ... so re-call displayBrowserActionBadge on window changes
    badge.displayBrowserActionBadge(currentWindow.incognito);
    browser.tabs.query({active: true, windowId}).then((tabs) => {
      if (tabs && tabs[0]) {
        assignManager.calculateContextMenu(tabs[0]);
      }
    }).catch((e) => {
      throw e;
    });
  }
};

// Lets do this last as theme manager did a check before connecting before
messageHandler.init();
