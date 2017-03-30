const themeManager = {
  existingTheme: null,
  init() {
    this.check();

    const port = browser.runtime.connect();
    port.onMessage.addListener(m => {
      if (m.type === "lightweight-theme-changed") {
        this.update(m.theme);
      }
    });
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

  init() {
    browser.tabs.onCreated.addListener(this.initTabCounter.bind(this));
    browser.tabs.onRemoved.addListener(this.sendTabCountAndDelete.bind(this));
    browser.webRequest.onCompleted.addListener(this.incrementTabCount.bind(this), {urls: ["<all_urls>"], types: ["main_frame"]});
  },

  initTabCounter(tab) {
    this.counter[tab.id] = {
      "cookieStoreId": tab.cookieStoreId,
      "pageRequests": 0
    };
  },

  sendTabCountAndDelete(tab) {
    browser.runtime.sendMessage({
      method: "sendTelemetryPayload",
      event: "page-requests-completed-per-tab",
      userContextId: this.counter[tab].cookieStoreId,
      pageRequestCount: this.counter[tab].pageRequests
    });
    delete this.counter[tab.id];
  },

  incrementTabCount(details) {
    browser.tabs.get(details.tabId).then(tab => {
      this.counter[tab.id].pageRequests++;
    }).catch(e => {
      throw e;
    });
  }
};

themeManager.init();
tabPageCounter.init();

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
