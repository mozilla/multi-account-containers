describe("Sync", () => {

  it("should init sync on startup", async () => {
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

    // await background.browser.storage.onChanged.addListener.yield();
    await nextTick();

    const sync = await background.browser.storage.sync.get();
    console.log("sync", sync);
    // expect(sync.length).to.equal(4);
  });

});