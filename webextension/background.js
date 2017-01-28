browser.tabs.onCreated.addListener(tab => {
  if (tab.incognito) {
    disableAddon(tab.id);
  }
});

browser.tabs.query({}).then(tabs => {
  for (let tab of tabs) { // eslint-disable-line prefer-const
    if (tab.incognito) {
      disableAddon(tab.id);
    }
  }
}).catch(() => {});

function disableAddon(tabId) {
 browser.browserAction.disable(tabId);
 browser.browserAction.setTitle({ tabId, title: "Containers disabled in Private Browsing Mode" });
}
