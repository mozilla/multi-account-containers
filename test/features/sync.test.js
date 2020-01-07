describe("Sync", () => {

  it.only("should init sync on startup", async () => {
    console.log("!!!a")
    const tab = await helper.browser.initializeWithTab();
    console.log(await background.browser.storage.local.get());
    const mozContainer = await background.browser.contextualIdentities.create({
      name: "Mozilla",
      color: "red",
      icon: "briefcase",
    });
    
    await background.browser.contextualIdentities.update("firefox-container-2", {color:"purple"});
    await background.browser.contextualIdentities.update("firefox-container-4", {icon:"pet"});

    await Promise.all([
      {
        userContextId: "1",
        url: "https://twitter.com",
      },
      {
        userContextId: "2",
        url: "https://www.facebook.com",
      },
      {
        userContextId: "4",
        url: "https://www.linkedin.com",
        neverAsk: true,
      },
      {
        userContextId: mozContainer.cookieStoreId.replace("firefox-container-", ""),
        url: "https://developer.mozilla.org",
        neverAsk: true,
      }
    ].map(async (assign) => {
      await background.browser.tabs.update(tab.id, {
        cookieStoreId: `firefox-container-${assign.userContextId}`
      });
  
      await background.browser.runtime.onMessage.addListener.yield({
        method: "setOrRemoveAssignment",
        tabId: tab.id,
        url: assign.url,
        userContextId: assign.userContextId,
        value: !true
      });

      if (assign.neverAsk) {
        await nextTick();
        await background.browser.runtime.onMessage.addListener.yield({
          method: "neverAsk",
          neverAsk: true,
          pageUrl: assign.url,
        });
      }
    }));
    console.log("!!!c");
    await background.browser.runtime.onStartup.addListener.yield();
    await nextTick();

    const sync = await background.browser.storage.sync.get();
    console.log(await background.browser.storage.local.get());

    expect(sync.identities.length).to.equal(5);
    console.log("!!!b");
  });

  it("should sync for the first time", async () => {
    const mozContainer = await background.browser.contextualIdentities.create({
      name:"Test", 
      color:"green", 
      icon:"pet"
    });
    console.log(await background.browser.contextualIdentities.query({}));
    await helper.browser.initSyncTest({localStorage:SYNC_TEST_1_LOCAL});
    console.log(await background.browser.storage.local.get());
    for (const containerName of SYNC_TEST_CONTAINERS) {
      const storageKeyString = "identitiesState@@_" + containerName;
      const answer = await background.browser.storage.local.get(storageKeyString);
      expect(answer[storageKeyString].hasOwnProperty("macAddonUUID")).to.be.true;
    }
    const storageKeyString = "identitiesState@@_" + mozContainer.cookieStoreId;
    const answer = await background.browser.storage.local.get(storageKeyString);
    expect(answer[storageKeyString].hasOwnProperty("macAddonUUID")).to.be.true;
  });
});

const SYNC_TEST_1_LOCAL = {
  "browserActionBadgesClicked":["6.1.1"],
  "containerTabsOpened":6,
  "identitiesState@@_firefox-container-1":{"hiddenTabs":[]},
  "identitiesState@@_firefox-container-2":{"hiddenTabs":[]},
  "identitiesState@@_firefox-container-3":{"hiddenTabs":[]},
  "identitiesState@@_firefox-container-4":{"hiddenTabs":[]},
  "identitiesState@@_firefox-container-6":{"hiddenTabs":[]},
  "identitiesState@@_firefox-default":{"hiddenTabs":[]},
  "onboarding-stage":5,
  "siteContainerMap@@_twitter.com":{"userContextId":"1","neverAsk":true},
  "siteContainerMap@@_www.facebook.com":{"userContextId":"2","neverAsk":true},
  "siteContainerMap@@_www.linkedin.com":{"userContextId":"4","neverAsk":false}
};

const SYNC_TEST_CONTAINERS = [
  "firefox-container-1", 
  "firefox-container-2", 
  "firefox-container-3", 
  "firefox-container-4"
];