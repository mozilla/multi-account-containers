const {initializeWithTab} = require("../common");

console.log("TRACE START");
describe("#1670", function () {
  console.log("TRACE 0");
  beforeEach(async function () {
    console.log("TRACE 1.0");
    this.webExt = await initializeWithTab();
    console.log("TRACE 1.1");
  });
  console.log("TRACE 2");

  afterEach(function () {
    console.log("TRACE 3.0");
    this.webExt.destroy();
    console.log("TRACE 3.1");
  });
  console.log("TRACE 4");

  describe("creating a new container", function () {
    console.log("TRACE 5.0");
    beforeEach(async function () {
      console.log("TRACE 5.1.0");
      await this.webExt.popup.helper.clickElementById("manage-containers-link");
      console.log("TRACE 5.1.1");
      await this.webExt.popup.helper.clickElementById("new-container");
      console.log("TRACE 5.1.2");
      await this.webExt.popup.helper.clickElementById("create-container-ok-link");
      console.log("TRACE 5.1.3");
    });
    console.log("TRACE 5.2");

    it("should create it in the browser as well", function () {
      console.log("TRACE 5.3.0");
      this.webExt.background.browser.contextualIdentities.create.should.have.been.calledOnce;
    });
    console.log("TRACE 5.4");

    describe("manually assign a valid URL to a container", function () {
      console.log("TRACE 5.5.0");
      const exampleUrl = "https://github.com/mozilla/multi-account-containers";
      beforeEach(async function () {
        console.log("TRACE 5.5.1.0");
        await this.webExt.popup.helper.clickElementById("manage-containers-link");
        console.log("TRACE 5.5.1.1");
        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".edit-container-icon", "last");
        console.log("TRACE 5.5.1.2");
        this.webExt.popup.window.document.getElementById("edit-container-panel-site-input").value = exampleUrl;
        console.log("TRACE 5.5.1.3");
        await this.webExt.popup.helper.clickElementById("edit-container-site-link");
        console.log("TRACE 5.5.1.4");
      });
      console.log("TRACE 5.5.2");

      it("should assign the URL to a container", function () {
        console.log("TRACE 5.5.3.0");
        this.webExt.background.browser.contextualIdentities.create.should.have.been.calledOnce;
      });
      console.log("TRACE 5.5.4");
    });
    console.log("TRACE 5.6");

    describe("manually assign valid URL without protocol to a container", function () {
      console.log("TRACE 5.7.0");
      const exampleUrl = "github.com/mozilla/multi-account-containers";
      beforeEach(async function () {
        console.log("TRACE 5.7.1.0");
        await this.webExt.popup.helper.clickElementById("manage-containers-link");
        console.log("TRACE 5.7.1.1");
        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".edit-container-icon", "last");
        console.log("TRACE 5.7.1.2");
        this.webExt.popup.window.document.getElementById("edit-container-panel-site-input").value = exampleUrl;
        console.log("TRACE 5.7.1.3");
        await this.webExt.popup.helper.clickElementById("edit-container-site-link");
        console.log("TRACE 5.7.1.4");
      });
      console.log("TRACE 5.7.2");

      it("should assign the URL without protocol to a container", function () {
        console.log("TRACE 5.7.3.0");
        this.webExt.background.browser.contextualIdentities.create.should.have.been.calledOnce;
      });
      console.log("TRACE 5.7.4");
    });
    console.log("TRACE 5.8");

    describe("manually assign an invalid URL to a container", function () {
      console.log("TRACE 5.9.0");
      const exampleUrl = "github";
      beforeEach(async function () {
        console.log("TRACE 5.9.1.0");
        await this.webExt.popup.helper.clickElementById("manage-containers-link");
        console.log("TRACE 5.9.1.1");
        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".edit-container-icon", "last");
        console.log("TRACE 5.9.1.2");
        this.webExt.popup.window.document.getElementById("edit-container-panel-site-input").value = exampleUrl;
        console.log("TRACE 5.9.1.3");
        await this.webExt.popup.helper.clickElementById("edit-container-site-link");
        console.log("TRACE 5.9.1.4");
      });
      console.log("TRACE 5.9.2");

      it("should not assign the URL to a container", function () {
        console.log("TRACE 5.9.3.0");
        this.webExt.background.browser.contextualIdentities.update.should.not.have.been.called;
      });
      console.log("TRACE 5.9.4");
    });
    console.log("TRACE 5.10");

    describe("manually assign empty URL to a container", function () {
      console.log("TRACE 5.11.0");
      const exampleUrl = "";
      beforeEach(async function () {
        console.log("TRACE 5.11.1.0");
        await this.webExt.popup.helper.clickElementById("manage-containers-link");
        console.log("TRACE 5.11.1.1");
        await this.webExt.popup.helper.clickElementByQuerySelectorAll(".edit-container-icon", "last");
        console.log("TRACE 5.11.1.2");
        this.webExt.popup.window.document.getElementById("edit-container-panel-site-input").value = exampleUrl;
        console.log("TRACE 5.11.1.3");
        await this.webExt.popup.helper.clickElementById("edit-container-site-link");
        console.log("TRACE 5.11.1.4");
      });
      console.log("TRACE 5.11.2");

      it("should not assign the URL to a container", function () {
        console.log("TRACE 5.11.3.0");
        this.webExt.background.browser.contextualIdentities.update.should.not.have.been.called;
      });
      console.log("TRACE 5.11.4");
    });
    console.log("TRACE 5.12");
  });
  console.log("TRACE 6");
});
console.log("TRACE END");
