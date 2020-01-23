module.exports = {
  browser: {
    async initializeWithTab(details = {
      cookieStoreId: "firefox-default"
    }) {
      let tab;
      await buildDom({
        background: {
          async afterBuild(background) {
            tab = await background.browser.tabs._create(details);
          }
        },
        popup: {
          jsdom: {
            beforeParse(window) {
              window.browser.storage.local.set({
                "browserActionBadgesClicked": [],
                "onboarding-stage": 6,
                "achievements": [], 
                "syncEnabled": true
              });
              window.browser.storage.local.set.resetHistory();
              window.browser.storage.sync.clear();
            }
          }
        }
      });

      return tab;
    },

    async openNewTab(tab, options = {}) {
      return background.browser.tabs._create(tab, options);
    },

    async initSyncTest(details = {}) {
      if (!details.cookieStoreId) details.cookieStoreId =  "firefox-default";
      if (!details.localStorage) { 
        details.localStorage = {
          "browserActionBadgesClicked": [],
          "onboarding-stage": 6,
          "achievements": [],
          "syncEnabled": true
        };
      }
      if (!details.syncStorage) details.syncStorage = {};
      let tab;
      await buildDom({
        background: {
          async afterBuild(background) {
            tab = await background.browser.tabs._create({ cookieStoreId: details.cookieStoreId });
          }
        },
        popup: {
          jsdom: {
            beforeParse(window) {
              window.browser.storage.clear();
              window.browser.storage.local.set(details.localStorage);
              window.browser.storage.local.set.resetHistory();
              window.browser.storage.sync.clear();
              window.browser.storage.sync.set(details.syncStorage);
              window.browser.storage.sync.set.resetHistory();
            }
          },
        }
      });

      return tab;
    }, 
  },

  popup: {
    async clickElementById(id) {
      await popup.helper.clickElementById(id);
    },

    async clickLastMatchingElementByQuerySelector(querySelector) {
      await popup.helper.clickElementByQuerySelectorAll(querySelector, "last");
    }
  }
};
