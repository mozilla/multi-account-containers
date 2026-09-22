const {buildBackgroundDom, expect} = require("../common");

describe("Proxied requests", function () {
  const cookieStoreId = "firefox-container-1";
  const proxy = {type: "http", host: "proxy.example", port: "8080"};

  beforeEach(async function () {
    this.webExt = await buildBackgroundDom();
    await this.webExt.background.window.proxifiedContainers.set(cookieStoreId, proxy);
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  it("should proxy a request without a tab based on the request's cookieStoreId", async function () {
    const {assignManager} = this.webExt.background.window;

    const result = await assignManager.handleProxifiedRequest({
      url: "https://example.com/",
      tabId: -1,
      cookieStoreId,
    });

    expect(result).to.deep.equal(proxy);
    this.webExt.browser.tabs.get.should.not.have.been.called;
  });
});
