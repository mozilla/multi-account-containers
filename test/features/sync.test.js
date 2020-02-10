const {initializeWithTab} = require("../common");

describe("Sync", function() {
  beforeEach(async function() {
    this.webExt = await initializeWithTab();
    this.syncHelper = new SyncTestHelper(this.webExt);
  });

  afterEach(function() {
    this.webExt.destroy();
    delete this.syncHelper;
  });

  it("testIdentityStateCleanup", async function() {
    await this.syncHelper.stopSyncListeners();

    await this.syncHelper.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);

    await this.webExt.browser.storage.local.set({
      "identitiesState@@_firefox-container-5": { 
        "hiddenTabs": [] 
      }
    });

    await this.webExt.background.window.identityState.storageArea.upgradeData();

    const macConfigs = await this.webExt.browser.storage.local.get();
    const identities = [];
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey.includes("identitiesState@@_") && !configKey.includes("default")) {
        identities.push(macConfigs[configKey]);
      }
    }

    identities.should.have.lengthOf(5, "There should be 5 identity entries");
    for (const identity of identities) {
      (!!identity.macAddonUUID).should.be.true;

    }
  });

  it("testAssignManagerCleanup", async function() {
    await this.syncHelper.stopSyncListeners();

    await this.syncHelper.setState({}, LOCAL_DATA, TEST_CONTAINERS, TEST_ASSIGNMENTS);

    await this.webExt.browser.storage.local.set({
      "siteContainerMap@@_www.goop.com": { 
        "userContextId": "999",
        "neverAsk": true
      }
    });

    await this.webExt.background.window.identityState.storageArea.upgradeData();
    await this.webExt.background.window.assignManager.storageArea.upgradeData();
    const macConfigs = await this.webExt.browser.storage.local.get();
    const assignments = [];
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey.includes("siteContainerMap@@_")) {
        macConfigs[configKey].configKey = configKey;
        assignments.push(macConfigs[configKey]);
      }
    }
    assignments.should.have.lengthOf(5, "There should be 5 site assignments");
    for (const assignment of assignments) {
      (!!assignment.identityMacAddonUUID).should.be.true;
    }
  });

  it("testReconcileSiteAssignments", async function() {
    await this.syncHelper.stopSyncListeners();

    await this.syncHelper.setState(
      DUPE_TEST_SYNC, 
      LOCAL_DATA, 
      TEST_CONTAINERS, 
      SITE_ASSIGNMENT_TEST
    );

    // add 200ok (bad data).
    const testSites = {
      "siteContainerMap@@_developer.mozilla.org": {
        "userContextId": "588",
        "neverAsk": true,
        "identityMacAddonUUID": "d20d7af2-9866-468e-bb43-541efe8c2c2e",
        "hostname": "developer.mozilla.org"
      },
      "siteContainerMap@@_reddit.com": {
        "userContextId": "592",
        "neverAsk": true,
        "identityMacAddonUUID": "3dc916fb-8c0a-4538-9758-73ef819a45f7",
        "hostname": "reddit.com"
      },
      "siteContainerMap@@_twitter.com": {
        "userContextId": "589",
        "neverAsk": true,
        "identityMacAddonUUID": "cdd73c20-c26a-4c06-9b17-735c1f5e9187",
        "hostname": "twitter.com"
      },
      "siteContainerMap@@_www.facebook.com": {
        "userContextId": "590",
        "neverAsk": true,
        "identityMacAddonUUID": "32cc4a9b-05ed-4e54-8e11-732468de62f4",
        "hostname": "www.facebook.com"
      },
      "siteContainerMap@@_www.linkedin.com": {
        "userContextId": "591",
        "neverAsk": true,
        "identityMacAddonUUID": "9ff381e3-4c11-420d-8e12-e352a3318be1",
        "hostname": "www.linkedin.com"
      },
      "siteContainerMap@@_200ok.us": {
        "userContextId": "1",
        "neverAsk": true,
        "identityMacAddonUUID": "b5f5f794-b37e-4cec-9f4e-6490df620336",
        "hostname": "www.linkedin.com"
      }
    };

    for (const site of Object.keys(testSites)) {
      await this.webExt.browser.storage.sync.set({[site]:testSites[site]});
    }

    await this.webExt.browser.storage.sync.set({
      deletedSiteList: ["siteContainerMap@@_www.google.com"]
    });
    await this.webExt.background.window.sync.runSync();

    const assignedSites = await this.webExt.background.window.assignManager.storageArea.getAssignedSites();
    Object.keys(assignedSites).should.have.lengthOf(6);
  });

  it("testInitialSync", async function() {
    await this.syncHelper.stopSyncListeners();
    await this.syncHelper.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);
    await this.webExt.background.window.sync.runSync();

    const getAssignedSites = 
      await this.webExt.background.window.assignManager.storageArea.getAssignedSites();
    const identities = await this.webExt.browser.contextualIdentities.query({});

    identities.should.have.lengthOf(5, "There should be 5 identity entries");
    Object.keys(getAssignedSites).should.have.lengthOf(0, "There should be no site assignments");
  });

  it("test2", async function() {
    await this.syncHelper.stopSyncListeners();

    await this.syncHelper.setState(SYNC_DATA, LOCAL_DATA, TEST_CONTAINERS, TEST_ASSIGNMENTS);

    await this.webExt.background.window.sync.runSync();

    const getAssignedSites = 
      await this.webExt.background.window.assignManager.storageArea.getAssignedSites();

    const identities = await this.webExt.browser.contextualIdentities.query({});

    identities.should.have.lengthOf(6, "There should be 6 identity entries");
    Object.keys(getAssignedSites).should.have.lengthOf(5, "There should be 5 site assignments");
  });

  it("dupeTest", async function() {
    await this.syncHelper.stopSyncListeners();
    await this.syncHelper.setState(
      DUPE_TEST_SYNC, 
      DUPE_TEST_LOCAL, 
      DUPE_TEST_IDENTS, 
      DUPE_TEST_ASSIGNMENTS
    );

    await this.webExt.background.window.sync.runSync();

    const getAssignedSites = 
      await this.webExt.background.window.assignManager.storageArea.getAssignedSites();

    const identities = await this.webExt.browser.contextualIdentities.query({});

    identities.should.have.lengthOf(7, "There should be 7 identity entries");

    Object.keys(getAssignedSites).should.have.lengthOf(5, "There should be 5 identity entries");

    const personalContainer = 
      this.syncHelper.lookupIdentityBy(identities, {name: "Personal"});
    (personalContainer.color === "red").should.be.true;

    const mozillaContainer =
      this.syncHelper.lookupIdentityBy(identities, {name: "Mozilla"});
    (mozillaContainer.icon === "pet").should.be.true;
  });
});

class SyncTestHelper {
  constructor(webExt) {
    this.webExt = webExt;
  }

  async stopSyncListeners() {
    await this.webExt.browser.storage.onChanged.removeListener(this.webExt.background.window.sync.storageArea.onChangedListener);
    await this.webExt.background.window.sync.removeContextualIdentityListeners();
  }
  
  async setState(syncData, localData, identityData, assignmentData){
    await this.removeAllContainers();
    await this.webExt.browser.storage.sync.clear();
    await this.webExt.browser.storage.sync.set(syncData);
    await this.webExt.browser.storage.local.clear();
    await this.webExt.browser.storage.local.set(localData);
    for (let i=0; i < identityData.length; i++) {
      //build identities
      const newIdentity = 
        await this.webExt.browser.contextualIdentities.create(identityData[i]);
      // fill identies with site assignments
      if (assignmentData && assignmentData[i]) {
        const data =  { 
          "userContextId": 
            String(
              newIdentity.cookieStoreId.replace(/^firefox-container-/, "")
            ),
          "neverAsk": true
        };
  
        await this.webExt.browser.storage.local.set({[assignmentData[i]]: data});
      }
    }
    return;
  }
  
  async removeAllContainers() {
    const identities = await this.webExt.browser.contextualIdentities.query({});
    for (const identity of identities) {
      await this.webExt.browser.contextualIdentities.remove(identity.cookieStoreId);
    }
  }

  lookupIdentityBy(identities, options) {
    for (const identity of identities) {
      if (options && options.name) {
        if (identity.name === options.name) return identity;
      }
      if (options && options.color) {
        if (identity.color === options.color) return identity;
      }
      if (options && options.color) {
        if (identity.color === options.color) return identity;
      }
    }
    return false;
  }
}

const TEST_CONTAINERS = [
  {
    name: "Personal",
    color: "blue",
    icon: "fingerprint"
  },
  {
    name: "Banking",
    color: "green",
    icon: "dollar"
  },
  {
    name: "Mozilla",
    color: "red",
    icon: "briefcase"
  },
  {
    name: "Groceries, obviously",
    color: "yellow",
    icon: "cart"
  },
  {
    name: "Facebook",
    color: "toolbar",
    icon: "fence"
  },
];
  
const TEST_ASSIGNMENTS = [
  "siteContainerMap@@_developer.mozilla.org",
  "siteContainerMap@@_twitter.com",
  "siteContainerMap@@_www.facebook.com",
  "siteContainerMap@@_www.linkedin.com",
  "siteContainerMap@@_reddit.com"
];
  
const LOCAL_DATA = {
  "browserActionBadgesClicked": [ "6.2.0" ],
  "containerTabsOpened": 7,
  "identitiesState@@_firefox-default": { "hiddenTabs": [] },
  "onboarding-stage": 5
};
  
const SYNC_DATA = {
  "identity@@_22ded543-5173-44a5-a47a-8813535945ca": {
    "name": "Personal",
    "icon": "fingerprint",
    "color": "red",
    "cookieStoreId": "firefox-container-146",
    "macAddonUUID": "22ded543-5173-44a5-a47a-8813535945ca"
  },
  "identity@@_63e5212f-0858-418e-b5a3-09c2dea61fcd": {
    "name": "Oscar",
    "icon": "dollar",
    "color": "green",
    "cookieStoreId": "firefox-container-147",
    "macAddonUUID": "3e5212f-0858-418e-b5a3-09c2dea61fcd"
  },
  "identity@@_71335417-158e-4d74-a55b-e9e9081601ec": {
    "name": "Mozilla",
    "icon": "pet",
    "color": "red",
    "cookieStoreId": "firefox-container-148",
    "macAddonUUID": "71335417-158e-4d74-a55b-e9e9081601ec"
  },
  "identity@@_59c4e5f7-fe3b-435a-ae60-1340db31a91b": {
    "name": "Groceries, obviously",
    "icon": "cart",
    "color": "pink",
    "cookieStoreId": "firefox-container-149",
    "macAddonUUID": "59c4e5f7-fe3b-435a-ae60-1340db31a91b"
  },
  "identity@@_3dc916fb-8c0a-4538-9758-73ef819a45f7": {
    "name": "Facebook",
    "icon": "fence",
    "color": "toolbar",
    "cookieStoreId": "firefox-container-150",
    "macAddonUUID": "3dc916fb-8c0a-4538-9758-73ef819a45f7"
  }
};
  
const DUPE_TEST_SYNC = {
  "identity@@_d20d7af2-9866-468e-bb43-541efe8c2c2e": {
    "name": "Personal",
    "icon": "fingerprint",
    "color": "red",
    "cookieStoreId": "firefox-container-588",
    "macAddonUUID": "d20d7af2-9866-468e-bb43-541efe8c2c2e"
  },
  "identity@@_cdd73c20-c26a-4c06-9b17-735c1f5e9187": {
    "name": "Big Bird",
    "icon": "pet",
    "color": "yellow",
    "cookieStoreId": "firefox-container-589",
    "macAddonUUID": "cdd73c20-c26a-4c06-9b17-735c1f5e9187"
  },
  "identity@@_32cc4a9b-05ed-4e54-8e11-732468de62f4": {
    "name": "Mozilla",
    "icon": "pet",
    "color": "red",
    "cookieStoreId": "firefox-container-590",
    "macAddonUUID": "32cc4a9b-05ed-4e54-8e11-732468de62f4"
  },
  "identity@@_9ff381e3-4c11-420d-8e12-e352a3318be1": {
    "name": "Groceries, obviously",
    "icon": "cart",
    "color": "pink",
    "cookieStoreId": "firefox-container-591",
    "macAddonUUID": "9ff381e3-4c11-420d-8e12-e352a3318be1"
  },
  "identity@@_3dc916fb-8c0a-4538-9758-73ef819a45f7": {
    "name": "Facebook",
    "icon": "fence",
    "color": "toolbar",
    "cookieStoreId": "firefox-container-592",
    "macAddonUUID": "3dc916fb-8c0a-4538-9758-73ef819a45f7"
  },
  "identity@@_63e5212f-0858-418e-b5a3-09c2dea61fcd": {
    "name": "Oscar",
    "icon": "dollar",
    "color": "green",
    "cookieStoreId": "firefox-container-593",
    "macAddonUUID": "63e5212f-0858-418e-b5a3-09c2dea61fcd"
  },
  "siteContainerMap@@_developer.mozilla.org": {
    "userContextId": "588",
    "neverAsk": true,
    "identityMacAddonUUID": "d20d7af2-9866-468e-bb43-541efe8c2c2e",
    "hostname": "developer.mozilla.org"
  },
  "siteContainerMap@@_reddit.com": {
    "userContextId": "592",
    "neverAsk": true,
    "identityMacAddonUUID": "3dc916fb-8c0a-4538-9758-73ef819a45f7",
    "hostname": "reddit.com"
  },
  "siteContainerMap@@_twitter.com": {
    "userContextId": "589",
    "neverAsk": true,
    "identityMacAddonUUID": "cdd73c20-c26a-4c06-9b17-735c1f5e9187",
    "hostname": "twitter.com"
  },
  "siteContainerMap@@_www.facebook.com": {
    "userContextId": "590",
    "neverAsk": true,
    "identityMacAddonUUID": "32cc4a9b-05ed-4e54-8e11-732468de62f4",
    "hostname": "www.facebook.com"
  },
  "siteContainerMap@@_www.linkedin.com": {
    "userContextId": "591",
    "neverAsk": true,
    "identityMacAddonUUID": "9ff381e3-4c11-420d-8e12-e352a3318be1",
    "hostname": "www.linkedin.com"
  }
};
  
const DUPE_TEST_LOCAL = {
  "beenSynced": true,
  "browserActionBadgesClicked": [
    "6.2.0"
  ],
  "containerTabsOpened": 7,
  "identitiesState@@_firefox-default": {
    "hiddenTabs": []
  },
  "onboarding-stage": 5,
};
  
const DUPE_TEST_ASSIGNMENTS = [
  "siteContainerMap@@_developer.mozilla.org",
  "siteContainerMap@@_reddit.com",
  "siteContainerMap@@_twitter.com",
  "siteContainerMap@@_www.facebook.com",
  "siteContainerMap@@_www.linkedin.com"
];
  
const SITE_ASSIGNMENT_TEST = [
  "siteContainerMap@@_developer.mozilla.org",
  "siteContainerMap@@_www.facebook.com",
  "siteContainerMap@@_www.google.com",
  "siteContainerMap@@_bugzilla.mozilla.org"
];
  
const DUPE_TEST_IDENTS = [
  {
    "name": "Personal",
    "icon": "fingerprint",
    "color": "blue",
  },
  {
    "name": "Banking",
    "icon": "pet",
    "color": "green",
  },
  {
    "name": "Mozilla",
    "icon": "briefcase",
    "color": "red",
  },
  {
    "name": "Groceries, obviously",
    "icon": "cart",
    "color": "orange",
  },
  {
    "name": "Facebook",
    "icon": "fence",
    "color": "toolbar",
  },
  {
    "name": "Big Bird",
    "icon": "dollar",
    "color": "yellow",
  }
];