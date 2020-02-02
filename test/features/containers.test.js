describe("Containers Management", () => {
  beforeEach(async () => {
    await helper.browser.initializeWithTab();
  });

  describe("creating a new container", () => {
    beforeEach(async () => {
      await helper.popup.clickElementById("container-add-link");
      await helper.popup.clickElementById("edit-container-ok-link");
    });

    it("should create it in the browser as well", () => {
      background.browser.contextualIdentities.create.should.have.been.calledOnce;
    });

    describe("removing it afterwards", () => {
      beforeEach(async () => {
        await helper.popup.clickElementById("edit-containers-link");
        await helper.popup.clickLastMatchingElementByQuerySelector(".delete-container-icon");
        await helper.popup.clickElementById("delete-container-ok-link");
      });

      it("should remove it in the browser as well", () => {
        background.browser.contextualIdentities.remove.should.have.been.calledOnce;
      });
    });
  });
});