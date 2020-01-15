// https://github.com/mozilla/multi-account-containers/issues/847
describe("Lock Feature", () => {
  const url1 = "http://example.com";
  const url2 = "http://example2.com";

  let activeTab;
  beforeEach(async () => {
    activeTab = await helper.browser.initializeWithTab({
      cookieStoreId: "firefox-container-1",
      url: url1
    });
  });

  describe("click the 'Always open in' checkbox in the popup", () => {
    beforeEach(async () => {
      // popup click to set assignment for activeTab.url
      await helper.popup.clickElementById("container-page-assigned");
    });
    
    describe("open different URL in same tab", () => {
      beforeEach(async () => {
        await helper.browser.browseToURL(activeTab.id, url2);
      });

      it("should not open a new tab", () => {
        background.browser.tabs.create.should.not.have.been.called;
      });
    
      describe("lock the container", () => {
        beforeEach(async () => {
          await helper.popup.setContainerIsLocked(activeTab.cookieStoreId, true);
        });
    
        describe("wait 2 seconds, then open different URL in same tab", () => {
          beforeEach(async () => {
            // Note: must wait 2 seconds, because of code in messageHandler that assumes
            // a newly-created tab is not 'genuine' until 2 seconds have elapsed since
            // its creation.
            // Unfortunately, this test runner recreates the tab at every single 'beforeEach',
            // so messageHandler thinks the tab is not genuine and tries to remove it,
            // meaning the below tests will (incorrectly) fail.
            await global.sleep(2500);
            await helper.browser.browseToURL(activeTab.id, url2);
          });

          it("should open a new tab in the default container", () => {
            background.browser.tabs.create.should.have.been.calledWith(sinon.match({
              url: url2,
              cookieStoreId: "firefox-default",
              openerTabId: activeTab.id,
              index: activeTab.index + 1,
              active: activeTab.active
            }));
          });
          
          it("should not remove the original tab", () => {
            background.browser.tabs.remove.should.not.have.been.called;
          });
        });
      });
    });
  });
});
