const {buildBackgroundDom} = require("../common");

describe("#2933", function () {
  beforeEach(async function () {
    this.background = await buildBackgroundDom();
  });

  afterEach(function () {
    this.background.destroy();
  });

  it("keeps the separator visible before a non-default port", async function () {
    const storageArea = this.background.background.window.assignManager.storageArea;
    await storageArea.set(
      "http://127.0.0.1:8080",
      {userContextId: "1"},
      false,
      false
    );
    const assignedSites = await storageArea.getAssignedSites();
    const [assignedSite] = Object.values(assignedSites);

    assignedSite.hostname.should.equal("127.0.0.1:8080");
  });

  it("repairs the display value when an existing assignment is read", async function () {
    const storageArea = this.background.background.window.assignManager.storageArea;
    const url = "http://127.0.0.1:8080";
    const storageKey = storageArea.getSiteStoreKey(url);
    await this.background.browser.storage.local.set({
      [storageKey]: {
        userContextId: "1",
        hostname: "127.0.0.18080"
      }
    });

    await storageArea.get(url);
    const assignedSites = await storageArea.getAssignedSites();

    assignedSites[storageKey].hostname.should.equal("127.0.0.1:8080");
  });
});
