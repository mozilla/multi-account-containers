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
        requestId: 1
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

  describe("when redirects change requestId midflight", () => {
    let promiseResults;
    beforeEach(async () => {
      // init
      const activeTab = {
        id: 1,
        cookieStoreId: "firefox-container-1",
        url: "https://www.youtube.com",
        index: 0
      };
      await helper.browser.initializeWithTab(activeTab);
      // assign the activeTab.url
      await helper.popup.clickElementById("container-page-assigned");

      // http://youtube.com
      const newTab = {
        id: 2,
        cookieStoreId: "firefox-default",
        url: "http://youtube.com",
        index: 1,
        active: true
      };
      const promise1 = helper.browser.openNewTab(newTab, {
        requestId: 1
      });

      // https://youtube.com
      const [promise2] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: newTab.id,
        url: "https://youtube.com",
        requestId: 1
      });

      // https://www.youtube.com
      const [promise3] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: newTab.id,
        url: "https://www.youtube.com",
        requestId: 1
      });

      // https://www.youtube.com
      const [promise4] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: newTab.id,
        url: "https://www.youtube.com",
        requestId: 2
      });

      promiseResults = await Promise.all([promise1, promise2, promise3, promise4]);
    });

    it("should not open two confirm pages", async () => {
      // http://youtube.com is not assigned, no cancel, no reopening
      expect(promiseResults[0]).to.deep.equal({});

      // https://youtube.com is not assigned, no cancel, no reopening
      expect(promiseResults[1]).to.deep.equal({});

      // https://www.youtube.com is assigned, this triggers reopening, cancel
      expect(promiseResults[2]).to.deep.equal({
        cancel: true
      });

      // https://www.youtube.com is assigned, this was a redirect, cancel early, no reopening
      expect(promiseResults[3]).to.deep.equal({
        cancel: true
      });

      background.browser.tabs.create.should.have.been.calledOnce;
    });

    it("should uncancel after webRequest.onCompleted", async () => {
      const [promise1] = background.browser.webRequest.onCompleted.addListener.yield({
        tabId: 2
      });
      await promise1;

      const [promise2] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: 2,
        url: "https://www.youtube.com",
        requestId: 123
      });
      await promise2;

      background.browser.tabs.create.should.have.been.calledTwice;
    });

    it("should uncancel after webRequest.onErrorOccurred", async () => {
      const [promise1] = background.browser.webRequest.onErrorOccurred.addListener.yield({
        tabId: 2
      });
      await promise1;

      // request to assigned url in same tab
      const [promise2] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: 2,
        url: "https://www.youtube.com",
        requestId: 123
      });
      await promise2;

      background.browser.tabs.create.should.have.been.calledTwice;
    });

    it("should uncancel after 2 seconds", async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      // request to assigned url in same tab
      const [promise2] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: 2,
        url: "https://www.youtube.com",
        requestId: 123
      });
      await promise2;

      background.browser.tabs.create.should.have.been.calledTwice;
    }).timeout(2005);

    it("should not influence the canceled url in other tabs", async () => {
      const newTab = {
        id: 123,
        cookieStoreId: "firefox-default",
        url: "https://www.youtube.com",
        index: 10,
        active: true
      };
      await helper.browser.openNewTab(newTab, {
        requestId: 321
      });

      background.browser.tabs.create.should.have.been.calledTwice;
    });
  });
});
