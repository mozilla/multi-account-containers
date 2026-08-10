const {initializeWithTab, expect} = require("../common");

describe("Assignment Reopen Feature", function () {
  const url = "http://example.com";

  beforeEach(async function () {
    this.webExt = await initializeWithTab({
      cookieStoreId: "firefox-default",
      url
    });
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("set to 'Always open in' firefox-container-4", function () {
    beforeEach(async function () {
      // popup click to set assignment for activeTab.url
      await this.webExt.popup.helper.clickElementById("always-open-in");
      await this.webExt.popup.helper.clickElementByQuerySelectorAll("#picker-identities-list > .menu-item");
    });

    it("should open the page in the assigned container", async function () {
      // should have created a new tab with the confirm page
      this.webExt.background.browser.tabs.create.should.have.been.calledWithMatch({
        active: true,
        cookieStoreId: "firefox-container-4",
        index: 1,
        openerTabId: null,
        url: "http://example.com"
      });
    });

  });

});

describe("Assignment Site Isolation", function () {
  const cookieStoreId = "firefox-container-4";

  beforeEach(async function () {
    this.webExt = await initializeWithTab({
      cookieStoreId,
      url: "http://example.com"
    });

    const {assignManager, identityState} = this.webExt.background.window;
    await assignManager.storageArea.set("http://example.com", {
      userContextId: "4",
      neverAsk: false
    });
    const state = await identityState.storageArea.get(cookieStoreId);
    state.isIsolated = "locked";
    await identityState.storageArea.set(cookieStoreId, state);
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  function isolationState(webExt) {
    return webExt.background.window
      .identityState.storageArea.get(cookieStoreId);
  }

  it("should be locked while the container has an assignment", async function () {
    const state = await isolationState(this.webExt);
    expect(state.isIsolated).to.equal("locked");
  });

  it("should go away with the last assignment of the container", async function () {
    const {assignManager} = this.webExt.background.window;
    await assignManager.storageArea.remove("http://example.com");

    const state = await isolationState(this.webExt);
    expect(state).to.not.have.property("isIsolated");
  });

  it("should stay while the container has another assignment", async function () {
    const {assignManager} = this.webExt.background.window;
    await assignManager.storageArea.set("http://other.example", {
      userContextId: "4",
      neverAsk: false
    });
    await assignManager.storageArea.remove("http://example.com");

    const state = await isolationState(this.webExt);
    expect(state.isIsolated).to.equal("locked");
  });
});

describe("Assignment Comfirm Page Feature", function () {
  const url = "http://example.com";

  beforeEach(async function () {
    this.webExt = await initializeWithTab({
      cookieStoreId: "firefox-container-4",
      url
    });
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("open new Tab with the assigned URL in the default container", function () {
    let newTab;
    beforeEach(async function () {
      await this.webExt.popup.helper.clickElementById("always-open-in");
      await this.webExt.popup.helper.clickElementByQuerySelectorAll("#picker-identities-list > .menu-item");

      // new Tab opening activeTab.url in default container
      newTab = await this.webExt.background.browser.tabs._create({
        cookieStoreId: "firefox-default",
        url
      }, {
        options: {
          webRequestError: true // because request is canceled due to reopening
        }
      });
    });

    it("should open the confirm page", async function () {
      // should have created a new tab with the confirm page
      this.webExt.background.browser.tabs.create.should.have.been.calledWithMatch({
        url: "moz-extension://fake/confirm-page.html?" +
               `url=${encodeURIComponent(url)}` +
               `&cookieStoreId=${this.webExt.tab.cookieStoreId}`,
        cookieStoreId: undefined,
        openerTabId: null,
        index: 2,
        active: true
      });
    });

    it("should remove the new Tab that got opened in the default container", function () {
      this.webExt.background.browser.tabs.remove.should.have.been.calledWith(newTab.id);
    });
  });
});
