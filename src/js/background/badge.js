const MAJOR_VERSIONS = ["2.3.0", "2.4.0"];
const badge = {
  const init = async () => {
    const currentWindow = await browser.windows.getCurrent();
    this.displayBrowserActionBadge(currentWindow.incognito);
  },

  disableAddon(tabId) {
    browser.browserAction.disable(tabId);
    browser.browserAction.setTitle({ tabId, title: "Containers disabled in Private Browsing Mode" });
  },

  const displayBrowserActionBadge = async () => {
    const extensionInfo = await backgroundLogic.getExtensionInfo();
    const storage = await browser.storage.local.get({browserActionBadgesClicked: []});

    if (MAJOR_VERSIONS.indexOf(extensionInfo.version) > -1 &&
        storage.browserActionBadgesClicked.indexOf(extensionInfo.version) < 0) {
      browser.browserAction.setBadgeBackgroundColor({color: "rgba(0,217,0,255)"});
      browser.browserAction.setBadgeText({text: "NEW"});
    }
  }
};

badge.init();
