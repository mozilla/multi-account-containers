if (!process.listenerCount("unhandledRejection")) {
  // eslint-disable-next-line no-console
  process.on("unhandledRejection", r => console.log(r));
}
const path = require("path");
const chai = require("chai");
const sinonChai = require("sinon-chai");
global.sinon = require("sinon");
global.expect = chai.expect;
chai.should();
chai.use(sinonChai);
global.nextTick = () => {
  return new Promise(resolve => {
    setTimeout(() => {
      process.nextTick(resolve);
    });
  });
};

global.helper = require("./helper");

const webExtensionsJSDOM = require("webextensions-jsdom");
const manifestPath = path.resolve(path.join(__dirname, "../src/manifest.json"));
global.buildDom = async ({background = {}, popup = {}}) => {
  const webExtension = await webExtensionsJSDOM.fromManifest(manifestPath, {
    apiFake: true,
    wiring: true,
    sinon: global.sinon,
    background,
    popup
  });

  global.background = webExtension.background;
  global.popup = webExtension.popup;
};

global.buildBackgroundDom = async background => {
  await global.buildDom({
    background,
    popup: false
  });
};

global.buildPopupDom = async popup => {
  await global.buildDom({
    popup,
    background: false
  });
};


global.afterEach(() => {
  if (global.background) {
    global.background.destroy();
  }

  if (global.popup) {
    global.popup.destroy();
  }
});
