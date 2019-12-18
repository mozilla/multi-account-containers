describe("#940", () => {
  describe("when other onBeforeRequestHandlers are faster and redirect with the same requestId", () => {
    it("should not open two confirm pages", async () => {
      await helper.browser.initializeWithTab({
        cookieStoreId: "firefox-container-1",
        url: "http://example.com"
      });
      await helper.popup.clickElementById("container-page-assigned");

      const responses = {};
      await helper.browser.openNewTab({
        url: "http://example.com"
      }, {
        options: {
          webRequestRedirects: ["https://example.com"],
          webRequestError: true,
          instantRedirects: true
        },
        responses
      });

      const result = await responses.webRequest.onBeforeRequest[1];
      expect(result).to.deep.equal({
        cancel: true
      });
      background.browser.tabs.create.should.have.been.calledOnce;
    });
  });

  describe("when redirects change requestId midflight", () => {
    let newTab;
    const newTabResponses = {};
    const redirectedRequest = async (options = {}) => {
      global.clock = sinon.useFakeTimers();
      newTab = await helper.browser.openNewTab({
        url: "http://youtube.com"
      }, {
        options: Object.assign({
          webRequestRedirects: [
            "https://youtube.com",
            "https://www.youtube.com",
            {
              url: "https://www.youtube.com",
              webRequest: {
                requestId: 2
              }
            }
          ],
          webRequestError: true,
          instantRedirects: true
        }, options),
        responses: newTabResponses
      });
    };

    beforeEach(async () => {
      await helper.browser.initializeWithTab({
        cookieStoreId: "firefox-container-1",
        url: "https://www.youtube.com"
      });
      await helper.popup.clickElementById("container-page-assigned");
    });

    it("should not open two confirm pages", async () => {
      await redirectedRequest();

      // http://youtube.com is not assigned, no cancel, no reopening
      expect(await newTabResponses.webRequest.onBeforeRequest[0]).to.deep.equal({});

      // https://youtube.com is not assigned, no cancel, no reopening
      expect(await newTabResponses.webRequest.onBeforeRequest[1]).to.deep.equal({});

      // https://www.youtube.com is assigned, this triggers reopening, cancel
      expect(await newTabResponses.webRequest.onBeforeRequest[2]).to.deep.equal({
        cancel: true
      });

      // https://www.youtube.com is assigned, this was a redirect, cancel early, no reopening
      expect(await newTabResponses.webRequest.onBeforeRequest[3]).to.deep.equal({
        cancel: true
      });

      background.browser.tabs.create.should.have.been.calledOnce;
    });

    it("should uncancel after webRequest.onCompleted", async () => {
      await redirectedRequest();
      // remove onCompleted listeners because in the real world this request would never complete
      // and thus might trigger unexpected behavior because the tab gets removed when reopening
      background.browser.webRequest.onCompleted.addListener = sinon.stub();
      background.browser.tabs.create.resetHistory();
      // we create a tab with the same id and use the same request id to see if uncanceled
      await helper.browser.openNewTab({
        id: newTab.id,
        url: "https://www.youtube.com"
      }, {
        options: {
          webRequest: {
            requestId: newTabResponses.webRequest.request.requestId
          }
        }
      });

      background.browser.tabs.create.should.have.been.calledOnce;
    });

    it("should uncancel after webRequest.onErrorOccurred", async () => {
      await redirectedRequest();
      background.browser.tabs.create.resetHistory();
      // we create a tab with the same id and use the same request id to see if uncanceled
      await helper.browser.openNewTab({
        id: newTab.id,
        url: "https://www.youtube.com"
      }, {
        options: {
          webRequest: {
            requestId: newTabResponses.webRequest.request.requestId
          },
          webRequestError: true
        }
      });

      background.browser.tabs.create.should.have.been.calledOnce;
    });

    it("should uncancel after 2 seconds", async () => {
      await redirectedRequest({
        webRequestDontYield: ["onCompleted", "onErrorOccurred"]
      });
      global.clock.tick(2000);

      background.browser.tabs.create.resetHistory();
      // we create a tab with the same id and use the same request id to see if uncanceled
      await helper.browser.openNewTab({
        id: newTab.id,
        url: "https://www.youtube.com"
      }, {
        options: {
          webRequest: {
            requestId: newTabResponses.webRequest.request.requestId
          },
          webRequestError: true
        }
      });

      background.browser.tabs.create.should.have.been.calledOnce;
    });

    it("should not influence the canceled url in other tabs", async () => {
      await redirectedRequest();
      background.browser.tabs.create.resetHistory();
      await helper.browser.openNewTab({
        cookieStoreId: "firefox-default",
        url: "https://www.youtube.com"
      }, {
        options: {
          webRequestError: true
        }
      });

      background.browser.tabs.create.should.have.been.calledOnce;
    });

    afterEach(() => {
      global.clock.restore();
    });
  });
});
