describe("External Webextensions", () => {
  const activeTab = {
    id: 1,
    cookieStoreId: "firefox-container-1",
    url: "http://example.com",
    index: 0
  };
  beforeEach(async () => {
    await helper.browser.initializeWithTab(activeTab);
    await helper.popup.clickElementById("container-page-assigned");
  });

  describe("with contextualIdentities permissions", () => {
    it("should be able to get assignments", async () => {
      background.browser.management.get.resolves({
        permissions: ["contextualIdentities"]
      });

      const message = {
        method: "getAssignment",
        url: "http://example.com"
      };
      const sender = {
        id: "external-webextension"
      };

      // currently not possible to get the return value of yielding with sinon
      // so we expect that if no error is thrown and the storage was called, everything is ok
      // maybe i get around to provide a PR https://github.com/sinonjs/sinon/issues/903
      //
      // the alternative would be to expose the actual messageHandler and call it directly
      // but personally i think that goes against the black-box-ish nature of these feature tests
      const rejectionStub = sinon.stub();
      process.on("unhandledRejection", rejectionStub);
      background.browser.runtime.onMessageExternal.addListener.yield(message, sender);
      await nextTick();
      process.removeListener("unhandledRejection", rejectionStub);
      rejectionStub.should.not.have.been.called;
      background.browser.storage.local.get.should.have.been.called;
    });
  });

  describe("without contextualIdentities permissions", () => {
    it("should throw an error", async () => {
      background.browser.management.get.resolves({
        permissions: []
      });

      const message = {
        method: "getAssignment",
        url: "http://example.com"
      };
      const sender = {
        id: "external-webextension"
      };

      const rejectionStub = sinon.spy();
      process.on("unhandledRejection", rejectionStub);
      background.browser.runtime.onMessageExternal.addListener.yield(message, sender);
      await nextTick();
      process.removeListener("unhandledRejection", rejectionStub);
      rejectionStub.should.have.been.calledWith(sinon.match({
        message: "Missing contextualIdentities permission"
      }));
    });
  });
});
