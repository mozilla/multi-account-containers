describe("#1168", () => {
  describe("when navigation happens too slow after opening new tab to a page which then redirects", () => {
    let clock, tab;

    beforeEach(async () => {
      await helper.browser.initializeWithTab({
        cookieStoreId: "firefox-container-1",
        url: "https://bugzilla.mozilla.org"
      });
      await helper.popup.clickElementById("container-page-assigned");

      clock = sinon.useFakeTimers();
      tab = await helper.browser.openNewTab({});

      clock.tick(2000);

      await background.browser.tabs._navigate(tab.id, "https://duckduckgo.com/?q=%21bugzilla+thing&t=ffab");
      await background.browser.tabs._redirect(tab.id, [
        "https://bugzilla.mozilla.org"
      ]);
    });

    // Not solved yet
    // See: https://github.com/mozilla/multi-account-containers/issues/1168#issuecomment-378394091
    it.skip("should remove the old tab", async () => {
      expect(background.browser.tabs.create).to.have.been.calledOnce;
      expect(background.browser.tabs.remove).to.have.been.calledWith(tab.id);
    });

    afterEach(() => {
      clock.restore();
    });
  });
});