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

    async openNewTab(tab, options = {}) {
      if (options.resetHistory) {
        background.browser.tabs.create.resetHistory();
        background.browser.tabs.remove.resetHistory();
      }
      background.browser.tabs.get.resolves(tab);
      background.browser.tabs.onCreated.addListener.yield(tab);
      const [promise] = background.browser.webRequest.onBeforeRequest.addListener.yield({
        frameId: 0,
        tabId: tab.id,
        url: tab.url,
        requestId: options.requestId
      });

      return promise;
    }
  },

  popup: {
    async clickElementById(id) {
      const clickEvent = popup.document.createEvent("HTMLEvents");
      clickEvent.initEvent("click");
      popup.document.getElementById(id).dispatchEvent(clickEvent);
      await nextTick();
    },
    
    // Wildcard subdomains: https://github.com/mozilla/multi-account-containers/issues/473
    async setWildcard(tab, wildcard) {
      const site = new URL(tab.url).hostname;
      const siteToWildcardKey = `siteToWildcardMap@@_${site}`;
      const wildcardToSiteKey = `wildcardToSiteMap@@_${wildcard}`;
      await background.browser.storage.local.set({[siteToWildcardKey]: wildcard});
      await background.browser.storage.local.set({[wildcardToSiteKey]: site});
    }
  },
};
