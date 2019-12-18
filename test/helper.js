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
                "onboarding-stage": 5,
                "achievements": []
              });
              window.browser.storage.local.set.resetHistory();
            }
          }
        }
      });

      return tab;
    },

    async openNewTab(tab, options = {}) {
      return background.browser.tabs._create(tab, options);
    }
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
