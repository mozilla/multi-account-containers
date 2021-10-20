const MAJOR_VERSIONS = ["2.3.0", "2.4.0", "6.2.0", "8.0.0"];
const badge = {
  async init() {
    const currentWindow = await browser.windows.getCurrent();
    this.displayBrowserActionBadge(currentWindow);
  },

  async displayBrowserActionBadge() {
    const extensionInfo = await backgroundLogic.getExtensionInfo();
    const storage = await browser.storage.local.get({ browserActionBadgesClicked: [] });

    if (MAJOR_VERSIONS.indexOf(extensionInfo.version) > -1 &&
      storage.browserActionBadgesClicked.indexOf(extensionInfo.version) < 0) {
      browser.browserAction.setBadgeBackgroundColor({ color: "rgba(0,217,0,255)" });
      browser.browserAction.setBadgeText({ text: "NEW" });
    }
  }
};

badge.init();
