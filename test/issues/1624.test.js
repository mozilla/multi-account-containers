const {initializeWithTab} = require("../common");

describe("Delete multiple Containers", function () {
  beforeEach(async function () {
    this.webExt = await initializeWithTab();
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("creating a new container", function () {
    beforeEach(async function () {
      for (let i = 0; i < 3; i++) {
        await this.webExt.popup.helper.clickElementById("container-add-link");
        await this.webExt.popup.helper.clickElementById("edit-container-ok-link");
      }
    });

    it("should create it in the browser as well", function () {
      this.webExt.background.browser.contextualIdentities.create.should.have.been.calledThrice;
    });

    describe("manually select one container and delete by delete button", function () {
      beforeEach(async function () {
        await this.webExt.popup.helper.clickElementById("edit-containers-link");
        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".select-container", "last");
        await this.webExt.popup.helper.clickElementById("delete-link");
        await this.webExt.popup.helper.clickElementById("delete-container-ok-link");

        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".select-container", "last");

      });

      it("should remove it in the browser as well", function () {
        this.webExt.background.browser.contextualIdentities.remove.should.have.been.calledWith("firefox-container-7");
      });
    });

    describe("manually click select multiple contaienr and delete by delete button", function () {
      beforeEach(async function () {
        await this.webExt.popup.helper.clickElementById("edit-containers-link");

        const nodeArray = Array.from(this.webExt.popup.window.document.querySelectorAll(".select-container"));
        nodeArray[5].click();
        nodeArray[6].click();

        await this.webExt.popup.helper.clickElementById("delete-link");
        await this.webExt.popup.helper.clickElementById("delete-container-ok-link");

      });

      it("should remove it in the browser as well", function () {
        this.webExt.background.browser.contextualIdentities.remove.should.have.been.calledTwice;
      });
    });
  });
});