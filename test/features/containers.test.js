const {initializeWithTab} = require("../common");

describe("Containers Management", function () {
  beforeEach(async function () {
    this.webExt = await initializeWithTab();
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("creating a new container", function () {
    beforeEach(async function () {
      await this.webExt.popup.helper.clickElementById("container-add-link");
      await this.webExt.popup.helper.clickElementById("edit-container-ok-link");
    });

    it("should create it in the browser as well", function () {
      this.webExt.background.browser.contextualIdentities.create.should.have.been.calledOnce;
    });

    describe("removing it afterwards", function () {
      beforeEach(async function () {
        await this.webExt.popup.helper.clickElementById("edit-containers-link");
        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".delete-container-icon", "last");
        await this.webExt.popup.helper.clickElementById("delete-container-ok-link");
      });

      it("should remove it in the browser as well", function () {
        this.webExt.background.browser.contextualIdentities.remove.should.have.been.calledOnce;
      });
    });
  });
});