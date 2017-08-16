const MAJOR_VERSIONS = ["2.3.0", "2.4.0"];
const badge = {
  init() {
    this.displayBrowserActionBadge();
  },
  async displayBrowserActionBadge() {
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
