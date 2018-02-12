if (!process.listenerCount("unhandledRejection")) {
  // eslint-disable-next-line no-console
  process.on("unhandledRejection", r => console.log(r));
}
const jsdom = require("jsdom");
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
const browserMock = require("./browser.mock");
const srcBasePath = path.resolve(path.join(__dirname, "..", "src"));
const srcJsBackgroundPath = path.join(srcBasePath, "js", "background");
global.buildBackgroundDom = async (options = {}) => {
  const dom = await jsdom.JSDOM.fromFile(path.join(srcJsBackgroundPath, "index.html"), {
    runScripts: "dangerously",
    resources: "usable",
    virtualConsole: (new jsdom.VirtualConsole).sendTo(console),
    beforeParse(window) {
      window.browser = browserMock();
      window.fetch = sinon.stub().resolves({
        json: sinon.stub().resolves({})
      });

      if (options.beforeParse) {
        options.beforeParse(window);
      }
    }
  });
  await new Promise(resolve => {
    dom.window.document.addEventListener("DOMContentLoaded", resolve);
  });
  await nextTick();

  global.background = {
    dom,
    browser: dom.window.browser
  };
};

global.buildPopupDom = async (options = {}) => {
  const dom = await jsdom.JSDOM.fromFile(path.join(srcBasePath, "popup.html"), {
    runScripts: "dangerously",
    resources: "usable",
    virtualConsole: (new jsdom.VirtualConsole).sendTo(console),
    beforeParse(window) {
      window.browser = browserMock();
      window.browser.storage.local.set("browserActionBadgesClicked", []);
      window.browser.storage.local.set("onboarding-stage", 5);
      window.browser.storage.local.set("achievements", []);
      window.browser.storage.local.set.resetHistory();
      window.fetch = sinon.stub().resolves({
        json: sinon.stub().resolves({})
      });

      if (options.beforeParse) {
        options.beforeParse(window);
      }
    }
  });
  await new Promise(resolve => {
    dom.window.document.addEventListener("DOMContentLoaded", resolve);
  });
  await nextTick();
  dom.window.browser.runtime.sendMessage.resetHistory();

  if (global.background) {
    dom.window.browser.runtime.sendMessage = sinon.spy(function() {
      global.background.browser.runtime.onMessage.addListener.yield(...arguments);
    });
  }

  global.popup = {
    dom,
    document: dom.window.document,
    browser: dom.window.browser
  };
};

global.afterEach(() => {
  if (global.background) {
    global.background.dom.window.close();
    delete global.background;
  }

  if (global.popup) {
    global.popup.dom.window.close();
    delete global.popup;
  }
});
