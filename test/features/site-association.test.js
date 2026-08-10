const {initializeWithTab, sinon, expect, nextTick} = require("../common");

/*
 * Firefox's per-site container associations (bug 2052136) are not part of the
 * fake WebExtension API, so we install the pieces we use by hand and re-run
 * the loading against them.
 */
function fakeSiteAssociationAPI(webExt, associations = []) {
  const {contextualIdentities} = webExt.background.browser;
  contextualIdentities.querySiteAssociations =
    sinon.stub().resolves(associations);
  contextualIdentities.setSiteAssociation = sinon.stub().resolves();
  contextualIdentities.removeSiteAssociation = sinon.stub().resolves();
  contextualIdentities.onSiteAssociationChanged = {addListener: sinon.stub()};
  return contextualIdentities;
}

// Hands a change to the listener siteAssociation.load() registered. The
// listener can't be awaited, so give the storage writes a tick to land.
async function fireChange(contextualIdentities, changeInfo) {
  const [listener] =
    contextualIdentities.onSiteAssociationChanged.addListener.firstCall.args;
  listener(changeInfo);
  await nextTick();
  await nextTick();
}

function assignedSites(webExt) {
  return webExt.background.window.assignManager.storageArea.getAssignedSites();
}

describe("Site Associations", function () {
  const url = "http://example.com";
  const exampleKey = "siteContainerMap@@_example.com";

  beforeEach(async function () {
    this.webExt = await initializeWithTab({
      cookieStoreId: "firefox-default",
      url
    });

    // popup click to assign example.com to a container
    await this.webExt.popup.helper.clickElementById("always-open-in");
    await this.webExt.popup.helper.clickElementByQuerySelectorAll("#picker-identities-list > .menu-item");
  });

  afterEach(function () {
    this.webExt.destroy();
  });

  describe("on a Firefox without the API", function () {
    it("should not throw when an assignment changes", async function () {
      const {siteAssociation} = this.webExt.background.window;
      expect(siteAssociation.supported).to.be.false;
      await siteAssociation.load();
      await siteAssociation.set(url, "4");
      await siteAssociation.remove(url);
    });
  });

  describe("handing our assignments over", function () {
    it("should hand over the assignments Firefox doesn't have", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      await this.webExt.background.window.siteAssociation.load();

      contextualIdentities.setSiteAssociation.should.have.been.calledOnceWith({
        site: "example.com",
        cookieStoreId: "firefox-container-4"
      });
      contextualIdentities.removeSiteAssociation.should.not.have.been.called;
    });

    it("should not hand over an association Firefox already has", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt, [
        {site: "example.com", cookieStoreId: "firefox-container-4"}
      ]);
      await this.webExt.background.window.siteAssociation.load();

      contextualIdentities.setSiteAssociation.should.not.have.been.called;
      contextualIdentities.removeSiteAssociation.should.not.have.been.called;
    });

    it("should let Firefox win when the two disagree", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt, [
        {site: "example.com", cookieStoreId: "firefox-container-2"}
      ]);
      await this.webExt.background.window.siteAssociation.load();

      contextualIdentities.setSiteAssociation.should.not.have.been.called;
      contextualIdentities.removeSiteAssociation.should.not.have.been.called;

      const sites = await assignedSites(this.webExt);
      sites[exampleKey].userContextId.should.equal("2");
    });

    it("should hand nothing over once Firefox holds it", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      const {siteAssociation} = this.webExt.background.window;
      await siteAssociation.load();

      // Second startup: this time Firefox reports the association back.
      contextualIdentities.setSiteAssociation.resetHistory();
      contextualIdentities.querySiteAssociations = sinon.stub().resolves([
        {site: "example.com", cookieStoreId: "firefox-container-4"}
      ]);
      await siteAssociation.load();

      contextualIdentities.setSiteAssociation.should.not.have.been.called;
    });

    it("should try again when the associations can't be read", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      contextualIdentities.querySiteAssociations =
        sinon.stub().rejects(new Error("containers are disabled"));
      const {siteAssociation} = this.webExt.background.window;
      await siteAssociation.load();
      contextualIdentities.setSiteAssociation.should.not.have.been.called;

      contextualIdentities.querySiteAssociations = sinon.stub().resolves([]);
      await siteAssociation.load();
      contextualIdentities.setSiteAssociation.should.have.been.calledOnceWith({
        site: "example.com",
        cookieStoreId: "firefox-container-4"
      });
    });
  });

  describe("importing what Firefox holds", function () {
    it("should adopt the associations it doesn't know about", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt, [
        {site: "example.com", cookieStoreId: "firefox-container-4"},
        {site: "unassigned.example", cookieStoreId: "firefox-container-2"}
      ]);
      await this.webExt.background.window.siteAssociation.load();

      contextualIdentities.removeSiteAssociation.should.not.have.been.called;
      contextualIdentities.setSiteAssociation.should.not.have.been.called;

      const sites = await assignedSites(this.webExt);
      Object.keys(sites).should.have.members([
        exampleKey,
        "siteContainerMap@@_unassigned.example"
      ]);
      sites["siteContainerMap@@_unassigned.example"].userContextId
        .should.equal("2");
    });

    it("should adopt an association added in Firefox", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      await this.webExt.background.window.siteAssociation.load();
      contextualIdentities.setSiteAssociation.resetHistory();

      await fireChange(contextualIdentities, {
        site: "added.example",
        cookieStoreId: "firefox-container-2"
      });

      const sites = await assignedSites(this.webExt);
      sites["siteContainerMap@@_added.example"].userContextId
        .should.equal("2");
      // What came from Firefox doesn't need to be pushed back to it.
      contextualIdentities.setSiteAssociation.should.not.have.been.called;
    });

    it("should follow an association changed in Firefox", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt, [
        {site: "example.com", cookieStoreId: "firefox-container-4"}
      ]);
      await this.webExt.background.window.siteAssociation.load();

      await fireChange(contextualIdentities, {
        site: "example.com",
        cookieStoreId: "firefox-container-2"
      });

      const sites = await assignedSites(this.webExt);
      sites[exampleKey].userContextId.should.equal("2");
      contextualIdentities.setSiteAssociation.should.not.have.been.called;
    });

    it("should drop an association removed in Firefox", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt, [
        {site: "example.com", cookieStoreId: "firefox-container-4"}
      ]);
      await this.webExt.background.window.siteAssociation.load();

      await fireChange(contextualIdentities, {site: "example.com"});

      const sites = await assignedSites(this.webExt);
      expect(sites).to.not.have.property(exampleKey);
      contextualIdentities.removeSiteAssociation.should.not.have.been.called;
    });

    it("should unlock a container emptied from Firefox", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt, [
        {site: "example.com", cookieStoreId: "firefox-container-4"}
      ]);
      const {siteAssociation, identityState} = this.webExt.background.window;
      await siteAssociation.load();
      const isolated =
        await identityState.storageArea.get("firefox-container-4");
      isolated.isIsolated = "locked";
      await identityState.storageArea.set("firefox-container-4", isolated);

      await fireChange(contextualIdentities, {site: "example.com"});

      const state =
        await identityState.storageArea.get("firefox-container-4");
      expect(state).to.not.have.property("isIsolated");
    });

    it("should ignore an association outside of a container", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      await this.webExt.background.window.siteAssociation.load();

      await fireChange(contextualIdentities, {
        site: "default.example",
        cookieStoreId: "firefox-default"
      });

      const sites = await assignedSites(this.webExt);
      expect(sites).to.not.have.property("siteContainerMap@@_default.example");
    });
  });

  describe("forwarding our own changes", function () {
    it("should tell Firefox when an assignment is removed", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      await this.webExt.background.window.assignManager.storageArea.remove(url);
      await nextTick();

      contextualIdentities.removeSiteAssociation.should.have.been.calledOnceWith({
        site: "example.com"
      });
    });

    it("should tell Firefox when an assignment is added", async function () {
      const contextualIdentities = fakeSiteAssociationAPI(this.webExt);
      await this.webExt.background.window.assignManager.storageArea.set(
        "http://other.example/some/path",
        {userContextId: "2", neverAsk: false}
      );
      await nextTick();

      contextualIdentities.setSiteAssociation.should.have.been.calledOnceWith({
        site: "other.example",
        cookieStoreId: "firefox-container-2"
      });
    });
  });
});
