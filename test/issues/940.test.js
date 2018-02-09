describe("#940", () => {
  describe("when other onBeforeRequestHandlers are faster and redirect with the same requestId", () => {
    it("should not open two confirm pages", async () => {
      // init
      const activeTab = {
        id: 1,
        cookieStoreId: "firefox-container-1",
        url: "http://example.com",
        index: 0
      };
      await helper.browser.initializeWithTab(activeTab);
      // assign the activeTab.url
      await helper.popup.clickElementById("container-page-assigned");

      // start request and don't await the requests at all
      // so the second request below is actually comparable to an actual redirect that also fires immediately
      const newTab = {
        id: 2,
        cookieStoreId: "firefox-default",
        url: activeTab.url,
        index: 1,
        active: true
      };
      helper.browser.openNewTab(newTab, {
        requestId: 1,
        isAsync: false
      });

      // other addon sees the same request
      // and redirects to the https version of activeTab.url
      // since it's a redirect the request has the same requestId
      background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: newTab.id,
        url: "https://example.com",
        requestId: 1
      });
      await nextTick();

      background.browser.tabs.create.should.have.been.calledOnce;
    });
  });
});
