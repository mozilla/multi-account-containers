const { sinon, nextTick, buildBackgroundDom } = require("../common");

describe("#1140", () => {
  beforeEach(async () => {
    this.background = await buildBackgroundDom();
  });

  describe("removing containers", () => {
    beforeEach(async () => {
      this.background.browser.contextualIdentities.onRemoved.addListener = sinon.stub();
      const [promise] = this.background.browser.runtime.onMessage.addListener.yield({
        method: "deleteContainer",
        message: {
          userContextId: "1"
        }
      });
      await promise;
      await nextTick();
    });

    it("should remove the identitystate from storage as well", async () => {
      this.background.browser.storage.local.remove.should.have.been.calledWith([
        "identitiesState@@_firefox-container-1"
      ]);
    });
  });
});