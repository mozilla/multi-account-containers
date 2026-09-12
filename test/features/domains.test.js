const {initializeWithTab} = require("../common");

describe("Catchall domains", function () {
  describe("set banana.example.com to 'Always open in' firefox-container-4", function () {
    const url1 = "http://banana.example.com";
    const url2 = "http://avocado.example.com";
    const domain = "example.com";

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

    describe("open avocado.example.com in a new tab in the default container", function () {
      beforeEach(async function () {
        await this.webExt.background.browser.tabs._create({
          cookieStoreId: "firefox-default",
          url: url2
        }, {
          options: {
            webRequestError: true // because request is canceled due to reopening
          }
        });
      });

      it("should not remove tab #2 or open the confirm page in tab #3", async function () {
        this.webExt.background.browser.tabs.create.should.not.have.been.called;
        this.webExt.background.browser.tabs.remove.should.not.have.been.called;
      });
    });

    describe("enable *.example.com in firefox-container-4", function () {
      beforeEach(async function () {
        await this.webExt.background.window.assignManager._setOrRemoveDomain(domain, "4");
      });

      describe("open avocado.example.com in a new tab in the default container", function () {
        beforeEach(async function () {
          this.newTab = await this.webExt.background.browser.tabs._create({
            cookieStoreId: "firefox-default",
            url: url2
          }, {
            options: {
              webRequestError: true // because request is canceled due to reopening
            }
          });
        });

        it("should remove tab #2 and open the confirm page in tab #3", async function () {
          this.webExt.background.browser.tabs.create.should.have.been.calledWithMatch({
            url: "moz-extension://fake/confirm-page.html?" +
                  `url=${encodeURIComponent(url2)}` +
                  `&cookieStoreId=${this.webExt.tab.cookieStoreId}`,
            cookieStoreId: undefined,
            openerTabId: null,
            index: 2,
            active: true
          });
          this.webExt.background.browser.tabs.remove.should.have.been.calledWith(this.newTab.id);
        });
      });
    });
  });
});
