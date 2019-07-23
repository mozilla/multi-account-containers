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
    },

    // https://github.com/mozilla/multi-account-containers/issues/847
    async updateTab(tab, options = {}) {
      const updatedTab = {};
      for (const key in tab) {
        updatedTab[key] = tab[key];
      }
      for (const key in options) {
        updatedTab[key] = options[key];
      }
      return this.openNewTab(updatedTab);
    },
  },

  popup: {
    async clickElementById(id) {
      await popup.helper.clickElementById(id);
    },

    async clickLastMatchingElementByQuerySelector(querySelector) {
      await popup.helper.clickElementByQuerySelectorAll(querySelector, "last");
    },
    
    // https://github.com/mozilla/multi-account-containers/issues/847
    async setContainerIsLocked(cookieStoreId, isLocked) {
      const identityStateKey = this.getIdentityStateContainerStoreKey(cookieStoreId);
      const identityState = await background.browser.storage.local.get([identityStateKey]) || {};
      if (isLocked) {
        identityState.isLocked = "locked";
      } else {
        delete identityState.isLocked;
      }
      // Must have valid 'hiddenTabs', otherwise backgroundLogic.showTabs() throws error
      if (!identityState.hiddenTabs) { identityState.hiddenTabs = []; }
      await background.browser.storage.local.set({[identityStateKey]: identityState});
    },
    
    getIdentityStateContainerStoreKey(cookieStoreId) {
      const storagePrefix = "identitiesState@@_";
      return `${storagePrefix}${cookieStoreId}`;      
    }
  }
};
