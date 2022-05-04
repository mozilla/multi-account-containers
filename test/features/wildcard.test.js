const {initializeWithTab} = require("../common");

describe("Wildcard Subdomains Feature", function () {
  const url1 = "http://www.example.com";
  const url2 = "http://zzz.example.com";
  const wildcardHostname = "example.com";

  beforeEach(async function () {
    this.webExt = await initializeWithTab({
      cookieStoreId: "firefox-container-4",
      url: url1
    });
    await this.webExt.popup.helper.clickElementById("always-open-in");
    await this.webExt.popup.helper.clickElementByQuerySelectorAll("#picker-identities-list > .menu-item");
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("open new Tab with different subdomain in the default container", function () {
    beforeEach(async function () {
      // new Tab opening url2 in default container
      await this.webExt.background.browser.tabs._create({
        cookieStoreId: "firefox-default",
        url: url2
      }, {
        options: {
          webRequestError: true // because request is canceled due to reopening
        }
      });
    });

    it("should not open the confirm page", async function () {
      this.webExt.background.browser.tabs.create.should.not.have.been.called;
    });

    it("should not remove the new Tab that got opened in the default container", function () {
      this.webExt.background.browser.tabs.remove.should.not.have.been.called;
    });
  });

  describe("set wildcard hostname and then open new Tab with different subdomain in the default container", function () {
    let newTab;
    beforeEach(async function () {
      // Set wildcard
      await this.webExt.background.window.assignManager._setWildcardHostnameForAssignment(url1, wildcardHostname);

      // new Tab opening url2 in default container
      newTab = await this.webExt.background.browser.tabs._create({
        cookieStoreId: "firefox-default",
        url: url2
      }, {
        options: {
          webRequestError: true // because request is canceled due to reopening
        }
      });
    });

    it("should open the confirm page", async function () {
      this.webExt.background.browser.tabs.create.should.have.been.calledWithMatch({
        url: "moz-extension://fake/confirm-page.html?" +
               `url=${encodeURIComponent(url2)}` +
               `&cookieStoreId=${this.webExt.tab.cookieStoreId}`,
        cookieStoreId: undefined,
        openerTabId: null,
        index: 2,
        active: true
      });
    });

    it("should remove the new Tab that got opened in the default container", function () {
      this.webExt.background.browser.tabs.remove.should.have.been.calledWith(newTab.id);
    });
  });
});
