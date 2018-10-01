const MAJOR_VERSIONS = ["2.3.0", "2.4.0"];
const badge = {
  async init() {
    const currentWindow = await browser.windows.getCurrent();
    this.displayBrowserActionBadge(currentWindow.incognito);
  },

  disableAddon(tabId) {
    browser.browserAction.disable(tabId);
    browser.browserAction.setTitle({ tabId, title: "Containers disabled in Private Browsing Mode" });
  },

  async displayBrowserActionBadge(rgba_values,text) {
    const extensionInfo = await backgroundLogic.getExtensionInfo();
    const storage = await browser.storage.local.get({browserActionBadgesClicked: []});

    if (MAJOR_VERSIONS.indexOf(extensionInfo.version) > -1 &&
        storage.browserActionBadgesClicked.indexOf(extensionInfo.version) < 0) {
      browser.browserAction.setBadgeBackgroundColor({color: rgba_values});
      browser.browserAction.setBadgeText({text: text});
    }
  }
};

badge.init();
