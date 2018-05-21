const reopenIn = {
  // Map from menuItemId to cookieStoreId.
  cookieStoreIds: new Map(),

  init() {
    browser.menus.onShown.addListener(async (info, tab) => {
      if (info.contexts.length !== 1) {
        return;
      }
      if (info.contexts[0] !== "tab") {
        return;
      }

      await this.rebuildMenu(tab);
    });

    browser.menus.onClicked.addListener((info, tab) => {
      browser.tabs.create({
        url: tab.url,
        index: tab.index + 1,
        cookieStoreId: this.cookieStoreIds.get(info.menuItemId)
      });
    });
  },

  async rebuildMenu(tab) {
    browser.menus.removeAll();

    const containers = await browser.contextualIdentities.query({});

    const folderId = browser.menus.create({
      title: "Reopen in Container",
      contexts: ["tab"],
    });

    if (tab.cookieStoreId !== "firefox-default") {
      const menuItemId = "openin-firefox-default";
      this.cookieStoreIds.set(menuItemId, "firefox-default");
      browser.menus.create({
        id: menuItemId,
        title: "No Container",
        parentId: folderId,
      });
      browser.menus.create({
        type: "separator",
        parentId: folderId,
      });
    }

    for (const [i, container] of containers.entries()) {
      if (container.cookieStoreId === tab.cookieStoreId)
        continue;

      const menuItemId = "openin-" + i;
      this.cookieStoreIds.set(menuItemId, container.cookieStoreId);
      browser.menus.create({
        id: menuItemId,
        title: container.name,
        icons: {
          "16": container.iconUrl,
        },
        parentId: folderId,
      });
    }

    browser.menus.refresh();
  },
};
reopenIn.init();
