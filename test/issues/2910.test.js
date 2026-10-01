const {initializeWithTab, nextTick} = require("../common");

describe("#2910", function () {
  const url = "http://example.com";

  beforeEach(async function () {
    this.webExt = await initializeWithTab({
      cookieStoreId: "firefox-default",
      url
    });
    this.initialTabId = this.webExt.tab.id;
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("set to 'Always open in' firefox-container-4", function () {
    beforeEach(async function () {
      // popup click to set assignment for activeTab.url
      await this.webExt.popup.helper.clickElementById("always-open-in");
      await nextTick();
      await this.webExt.popup.helper.clickElementByQuerySelectorAll("#picker-identities-list > .menu-item");
    });

    it("should open the page in a new tab and add an exemption for the initial tab", async function () {
      // should have created a new tab with the confirm page
      this.webExt.background.browser.tabs.create.should.have.been.calledWithMatch({
        active: true,
        cookieStoreId: "firefox-container-4",
        index: 1,
        openerTabId: null,
        url: "http://example.com"
      });
      // should have added the initial tab to the exempted list
      const siteStoreKey = this.webExt.background.window.assignManager.storageArea.getSiteStoreKey(url);
      const isExempted = this.webExt.background.window.assignManager.storageArea.isExempted(siteStoreKey, this.initialTabId);
      isExempted.should.be.true;
    });

    describe("delete firefox-container-4", function () {
      beforeEach(async function () {
        await this.webExt.background.window.assignManager.deleteContainer("4");
        await nextTick();
      });

      it("should have removed the initial tab's exemption", function () {
        const siteStoreKey = this.webExt.background.window.assignManager.storageArea.getSiteStoreKey(url);
        const isExempted = this.webExt.background.window.assignManager.storageArea.isExempted(siteStoreKey, this.initialTabId);
        isExempted.should.be.false;
      });
    });
  });
});
