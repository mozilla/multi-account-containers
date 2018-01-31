describe("Assignment Feature", () => {
  const activeTab = {
    id: 1,
    cookieStoreId: "firefox-container-1",
    url: "http://example.com",
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

    describe("open new Tab with the assigned URL in the default container", () => {
      const newTab = {
        id: 2,
        cookieStoreId: "firefox-default",
        url: activeTab.url,
        index: 1,
        active: true
      };
      beforeEach(async () => {
        // new Tab opening activeTab.url in default container
        await helper.browser.openNewTab(newTab);
      });

      it("should open the confirm page", async () => {
        // should have created a new tab with the confirm page
        background.browser.tabs.create.should.have.been.calledWith({
          url: "moz-extension://multi-account-containers/confirm-page.html?" +
               `url=${encodeURIComponent(activeTab.url)}` +
               `&cookieStoreId=${activeTab.cookieStoreId}`,
          cookieStoreId: undefined,
          index: 2,
          active: true
        });
      });

      it("should remove the new Tab that got opened in the default container", () => {
        background.browser.tabs.remove.should.have.been.calledWith(newTab.id);
      });
    });

    describe("click the 'Always open in' checkbox in the popup again", () => {
      beforeEach(async () => {
        // popup click to remove assignment for activeTab.url
        await helper.popup.clickElementById("container-page-assigned");
      });

      describe("open new Tab with the no longer assigned URL in the default container", () => {
        const newTab = {
          id: 3,
          cookieStoreId: "firefox-default",
          url: activeTab.url,
          index: 3,
          active: true
        };
        beforeEach(async () => {
          // new Tab opening activeTab.url in default container
          await helper.browser.openNewTab(newTab);
        });

        it("should not open the confirm page", async () => {
          // should not have created a new tab
          background.browser.tabs.create.should.not.have.been.called;
        });
      });
    });
  });
});
