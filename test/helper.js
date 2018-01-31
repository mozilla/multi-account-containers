module.exports = {
  browser: {
    async initializeWithTab(tab) {
      await buildBackgroundDom({
        beforeParse(window) {
          window.browser.tabs.get.resolves(tab);
          window.browser.tabs.query.resolves([tab]);
          window.browser.contextualIdentities.get.resolves({
            cookieStoreId: tab.cookieStoreId
          });
        }
      });
      await buildPopupDom({
        beforeParse(window) {
          window.browser.tabs.get.resolves(tab);
          window.browser.tabs.query.resolves([tab]);
        }
      });
    },

    async openNewTab(tab) {
      background.browser.tabs.get.resolves(tab);
      background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: tab.id,
        url: tab.url
      });
      background.browser.tabs.onCreated.addListener.yield(tab);
      await nextTick();
    }
  },

  popup: {
    async clickElementById(id) {
      const clickEvent = popup.document.createEvent("HTMLEvents");
      clickEvent.initEvent("click");
      popup.document.getElementById(id).dispatchEvent(clickEvent);
      await nextTick();
    }
  },
};
