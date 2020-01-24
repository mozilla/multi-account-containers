const {expect, sinon, initializeWithTab} = require("../common");

describe("#1168", function () {
  describe("when navigation happens too slow after opening new tab to a page which then redirects", function () {
    let clock, tab, background;

    beforeEach(async function () {
      this.webExt = await initializeWithTab({
        cookieStoreId: "firefox-container-1",
        url: "https://bugzilla.mozilla.org"
      });

      await this.webExt.popup.helper.clickElementById("container-page-assigned");

      clock = sinon.useFakeTimers();
      tab = await this.webExt.browser.tabs._create({});

      clock.tick(2000);

      await background.browser.tabs._navigate(tab.id, "https://duckduckgo.com/?q=%21bugzilla+thing&t=ffab");
      await background.browser.tabs._redirect(tab.id, [
        "https://bugzilla.mozilla.org"
      ]);
    });

    afterEach(function () {
      this.webExt.destroy();
      clock.restore();
    });

    // Not solved yet
    // See: https://github.com/mozilla/multi-account-containers/issues/1168#issuecomment-378394091
    it.skip("should remove the old tab", async function () {
      expect(background.browser.tabs.create).to.have.been.calledOnce;
      expect(background.browser.tabs.remove).to.have.been.calledWith(tab.id);
    });
  });
});