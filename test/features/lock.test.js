// https://github.com/mozilla/multi-account-containers/issues/847
describe("Lock Feature", () => {
  const activeTab = {
    id: 1,
    cookieStoreId: "firefox-container-1",
    url: "http://example.com",
    index: 0,
    active: true
  };
  beforeEach(async () => {
    await helper.browser.initializeWithTab(activeTab);
  });

  describe("click the 'Always open in' checkbox in the popup", () => {
    beforeEach(async () => {
      // popup click to set assignment for activeTab.url
      await helper.popup.clickElementById("container-page-assigned");
    });
    
    describe("open different URL in same tab", () => {
      const differentURL = "http://example2.com";
      beforeEach(async () => {
        await helper.browser.browseToURL(activeTab.id, differentURL);
      });

      it("should not open a new tab", () => {
        background.browser.tabs.create.should.not.have.been.called;
      });
    
      describe("lock the container", () => {
        beforeEach(async () => {
          await helper.popup.setContainerIsLocked(activeTab.cookieStoreId, true);
        });
    
        describe("open different URL in same tab", () => {
          beforeEach(async () => {
            await helper.browser.browseToURL(activeTab.id, differentURL);
          });

          it("should open a new tab in the default container", () => {
            background.browser.tabs.create.should.have.been.calledWith(sinon.match({
              url: differentURL,
              cookieStoreId: "firefox-default",
              openerTabId: activeTab.id,
              index: activeTab.index + 1,
              active: activeTab.active
            }));
          });
        });
      });
    });
  });
});
