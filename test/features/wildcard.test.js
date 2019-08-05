// Wildcard subdomains: https://github.com/mozilla/multi-account-containers/issues/473
describe("Wildcard Subdomains Feature", () => {
  const activeTab = {
    id: 1,
    cookieStoreId: "firefox-container-1",
    url: "http://www.example.com",
    index: 0
  };
  beforeEach(async () => {
    await helper.browser.initializeWithTab(activeTab);
  });

  describe("click the 'Always open in' checkbox in the popup", () => {
    beforeEach(async () => {
      // popup click to set assignment for activeTab.url
      await helper.popup.clickElementById("container-page-assigned");
    });

    describe("click the assigned URL's subdomain to convert it to a wildcard", () => {
      beforeEach(async () => {
        await helper.popup.setWildcard(activeTab, "example.com");
      });

      describe("open new Tab with a different subdomain in the default container", () => {
        const newTab = {
          id: 2,
          cookieStoreId: "firefox-default",
          url: "http://mail.example.com",
          index: 1,
          active: true
        };
        beforeEach(async () => {
          await helper.browser.openNewTab(newTab);
        });

        it("should open the confirm page", async () => {
          // should have created a new tab with the confirm page
          background.browser.tabs.create.should.have.been.calledWith({
            url: "moz-extension://multi-account-containers/confirm-page.html?" +
                 `url=${encodeURIComponent(newTab.url)}` +
                 `&cookieStoreId=${activeTab.cookieStoreId}`,
            cookieStoreId: undefined,
            openerTabId: null,
            index: 2,
            active: true
          });
        });

        it("should remove the new Tab that got opened in the default container", () => {
          background.browser.tabs.remove.should.have.been.calledWith(newTab.id);
        });
      });
    });
  });
});
