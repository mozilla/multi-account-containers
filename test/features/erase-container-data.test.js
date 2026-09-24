const { initializeWithTab } = require("../common");

describe("Erase Container Data (Issue #2897)", function () {
  beforeEach(async function () {
    this.webExt = await initializeWithTab();
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("deleteContainerDataOnly message handler", function () {
    it("should call browsingData.remove with the container cookieStoreId and all data types", async function () {
      // Create a real container to get a valid userContextId
      const identity = await this.webExt.background.browser.contextualIdentities.create({
        name: "Test",
        color: "blue",
        icon: "fingerprint"
      });
      const userContextId = identity.cookieStoreId.replace("firefox-container-", "");

      // Stub browsingData.remove on the shared browser mock
      const browsingDataRemoveStub = this.webExt.background.browser.browsingData.remove;

      // Send the message via the standard message bus
      const result = await this.webExt.background.browser.runtime.sendMessage({
        method: "deleteContainerDataOnly",
        message: { userContextId }
      });

      browsingDataRemoveStub.should.have.been.calledOnce;

      const [removalOptions, dataTypes] = browsingDataRemoveStub.firstCall.args;
      removalOptions.should.deep.equal({ cookieStoreId: identity.cookieStoreId });
      dataTypes.should.deep.equal({
        cache: true,
        cookies: true,
        indexedDB: true,
        localStorage: true,
        pluginData: true,
        serviceWorkers: true
      });

      result.should.deep.equal({ done: true, userContextId });
    });
  });
});
