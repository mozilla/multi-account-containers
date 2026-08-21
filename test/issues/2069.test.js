const {expect, initializeWithTab} = require("../common");

// https://github.com/mozilla/multi-account-containers/issues/2069
describe("#2069", function () {
  const assignedUrl = "https://amazon.com/";

  const assign = async (webExt) => {
    await webExt.background.window.assignManager.storageArea.set(assignedUrl, {
      userContextId: "4",
      neverAsk: true
    }, []);
    // create and drop an unrelated tab so messageHandler's "just created
    // this tab" grace period no longer refers to our tab under test - only
    // the homepage/new-tab-page detection should cause it to be replaced
    await webExt.background.browser.tabs._create({url: "about:blank"});
  };

  describe("when the current tab shows the browser's homepage", function () {
    const homepageUrl = "https://google.com/";

    beforeEach(async function () {
      this.webExt = await initializeWithTab({
        cookieStoreId: "firefox-default",
        url: homepageUrl
      });
      this.webExt.background.browser.browserSettings.homepageOverride.get
        .resolves({value: homepageUrl, levelOfControl: "controlled_by_this_extension"});

      await assign(this.webExt);

      await this.webExt.background.browser.tabs._navigate(this.webExt.tab.id, assignedUrl);
    });

    afterEach(function () {
      this.webExt.destroy();
    });

    it("should replace the homepage tab instead of opening a second tab", function () {
      expect(this.webExt.background.browser.tabs.remove).to.have.been.calledWith(this.webExt.tab.id);
    });
  });

  describe("when the current tab shows a custom new-tab page from another extension", function () {
    const newTabUrl = "moz-extension://other-addon/newtab.html";

    beforeEach(async function () {
      this.webExt = await initializeWithTab({
        cookieStoreId: "firefox-default",
        url: newTabUrl
      });
      this.webExt.background.browser.browserSettings.newTabPageOverride.get
        .resolves({value: newTabUrl, levelOfControl: "controlled_by_other_extensions"});

      await assign(this.webExt);

      await this.webExt.background.browser.tabs._navigate(this.webExt.tab.id, assignedUrl);
    });

    afterEach(function () {
      this.webExt.destroy();
    });

    it("should replace the custom new-tab page instead of opening a second tab", function () {
      expect(this.webExt.background.browser.tabs.remove).to.have.been.calledWith(this.webExt.tab.id);
    });
  });
});
