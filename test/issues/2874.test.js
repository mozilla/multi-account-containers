const {initializeWithTab, nextTick, expect} = require("../common");

describe("#2874 container shortcuts use the typed character", function () {
  beforeEach(async function () {
    this.webExt = await initializeWithTab();
    this.popup = this.webExt.popup.window;
    // The popup closes itself after opening a container; keep it open so that
    // the assertions can still read the document.
    this.popup.close = () => {};
    // The container list is the only panel that listens for the shortcuts.
    this.popup.document.querySelector("a.onboarding-done").click();
    await nextTick();
    this.create = this.popup.browser.tabs.create;
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  async function press(window, {code, key}) {
    window.document.dispatchEvent(
      new window.KeyboardEvent("keydown", {code, key, bubbles: true})
    );
    await nextTick();
  }

  function focusedId(window) {
    const element = window.document.activeElement;
    return element && element.id;
  }

  function openedContainerIds(webExt) {
    return webExt.popup.browser.tabs.create.args.map(
      ([{cookieStoreId}]) => cookieStoreId
    );
  }

  it("opens the container of the typed digit", async function () {
    await press(this.popup, {code: "Digit2", key: "2"});
    expect(openedContainerIds(this.webExt)).to.deep.equal(["firefox-container-2"]);
  });

  it("focuses the search field when a slash is typed", async function () {
    await press(this.popup, {code: "Slash", key: "/"});
    expect(focusedId(this.popup)).to.equal("search-terms");
    expect(this.create.callCount).to.equal(0);
  });

  it("ignores a key that types a character other than a digit", async function () {
    // shift+2 types "@" on a US layout.
    await press(this.popup, {code: "Digit2", key: "@"});
    expect(this.create.callCount).to.equal(0);
  });

  it("opens the container of a digit typed on another layout", async function () {
    // "2" is typed with shift+* on a French AZERTY layout, i.e. on the physical
    // Digit3 key.
    await press(this.popup, {code: "Digit3", key: "2"});
    expect(openedContainerIds(this.webExt)).to.deep.equal(["firefox-container-2"]);
  });

  it("focuses the search field for a slash typed on another layout", async function () {
    // "/" is typed with shift+7 on a Norwegian layout.
    await press(this.popup, {code: "Digit7", key: "/"});
    expect(focusedId(this.popup)).to.equal("search-terms");
    expect(this.create.callCount).to.equal(0);
  });

  it("ignores a key that types a character other than a slash", async function () {
    // The physical "/" key types "\" on a Norwegian layout.
    await press(this.popup, {code: "Slash", key: "\\"});
    expect(focusedId(this.popup)).to.not.equal("search-terms");
    expect(this.create.callCount).to.equal(0);
  });
});
