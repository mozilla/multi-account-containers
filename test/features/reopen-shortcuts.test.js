const {initializeWithTab} = require("../common");

describe("Reopen Shortcuts Feature", function () {
  beforeEach(async function () {
    // Initialize with a tab in the default container
    this.webExt = await initializeWithTab({
      cookieStoreId: "firefox-default",
      url: "https://example.com"
    });
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("when using keyboard shortcut to reopen in container", function () {
    beforeEach(async function () {
      // Simulate the keyboard shortcut command
      await this.webExt.background.browser.commands.onCommand.addListener.firstCall.args[0]("reopen_in_container_0");
    });

    it("should open the page in the assigned container and close the original tab", async function () {
      this.webExt.background.browser.tabs.create.should.have.been.calledWithMatch({
        url: "https://example.com",
        cookieStoreId: "firefox-container-1",
        index: 1,
        active: true
      });

      this.webExt.background.browser.tabs.remove.should.have.been.called;
    });
  });

  describe("when container is set to 'none'", function () {
    beforeEach(async function () {
      await this.webExt.background.browser.commands.onCommand.addListener.firstCall.args[0]("reopen_in_container_9");
    });

    it("should not reopen the tab", function () {
      this.webExt.background.browser.tabs.create.should.not.have.been.called;
      this.webExt.background.browser.tabs.remove.should.not.have.been.called;
    });
  });
}); 