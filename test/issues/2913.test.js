const path = require("path");
const crypto = require("crypto");
const webExtensionsJSDOM = require("webextensions-jsdom");
const { expect, sinon } = require("../common");

const manifestPath = path.resolve(__dirname, "../../src/manifest.json");

// Browsers that expose getSupportedIcons give each container icon a redesigned
// iconUrl. The bookmark context menu (initBookmarksMenu) should use that URL.
// Issue #2913: it kept the old bundled svg for the built-in icon names.
const waitFor = async (find, tries = 200) => {
  for (let i = 0; i < tries; i++) {
    const found = find();
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return find();
};

describe("#2913", function () {
  it("uses the browser icon for a container in the bookmark menu", async function () {
    const webExtension = await webExtensionsJSDOM.fromManifest(manifestPath, {
      apiFake: true,
      wiring: true,
      sinon: global.sinon,
      background: {
        jsdom: {
          beforeParse(window) {
            window.browser.permissions.contains.resolves(true);
            window.browser.contextMenus.remove.resolves();
            window.browser.contextualIdentities.query.resolves([
              {cookieStoreId: "firefox-container-1", name: "Personal", icon: "fingerprint", color: "blue"},
            ]);
            window.browser.contextualIdentities.getSupportedIcons = sinon.stub().resolves([
              {icon: "fingerprint", iconUrl: "moz-extension://nova/fingerprint.svg"},
            ]);
            window.crypto = {
              getRandomValues: arr => crypto.randomBytes(arr.length),
            };
          }
        }
      },
      popup: false,
      pageActionPopup: false,
    });
    try {
      const background = webExtension.background;
      const item = await waitFor(() =>
        background.browser.contextMenus.create.getCalls()
          .map(call => call.args[0])
          .find(options => options.id === "firefox-container-1"));
      expect(item, "bookmark menu item for the container").to.exist;
      expect(item.icons["16"]).to.equal("moz-extension://nova/fingerprint.svg");
    } finally {
      webExtension.destroy();
    }
  });
});
