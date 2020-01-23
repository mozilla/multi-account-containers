browser.tests = {
  async runAll() {
    await this.testIdentityStateCleanup();
    await this.testAssignManagerCleanup();
    await this.testReconcileSiteAssignments();
    await this.testInitialSync();
    await this.test2();
    await this.dupeTest();
  },
  // more unit tests
  // if site assignment has no valid cookieStoreId, delete on local

  async resetForManualTests() {
    await browser.tests.stopSyncListeners();
    console.log("reset");
    await this.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);
  },

  async testIdentityStateCleanup() {
    await browser.tests.stopSyncListeners();
    console.log("Testing the cleanup of local storage");

    await this.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);

    await browser.storage.local.set({
      "identitiesState@@_firefox-container-5": { 
        "hiddenTabs": [] 
      }
    });
    console.log("local storage set: ", await browser.storage.local.get());

    await identityState.storageArea.upgradeData();

    const macConfigs = await browser.storage.local.get();
    const identities = [];
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey.includes("identitiesState@@_") && !configKey.includes("default")) {
        identities.push(macConfigs[configKey]);
      }
    }

    console.assert(identities.length === 5, "There should be 5 identity entries");
    for (const identity of identities) {
      console.assert(!!identity.macAddonUUID, `${identity.name} should have a uuid`);
    }
    console.log("!!!Finished!!!");
  },

  async testAssignManagerCleanup() {
    await browser.tests.stopSyncListeners();
    console.log("Testing the cleanup of local storage");

    await this.setState({}, LOCAL_DATA, TEST_CONTAINERS, TEST_ASSIGNMENTS);

    await browser.storage.local.set({
      "siteContainerMap@@_www.goop.com": { 
        "userContextId": "6",
        "neverAsk": true,
        "hostname": "www.goop.com"
      }
    });
    console.log("local storage set: ", await browser.storage.local.get());

    await identityState.storageArea.upgradeData();
    await assignManager.storageArea.upgradeData();

    const macConfigs = await browser.storage.local.get();
    const assignments = [];
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey.includes("siteContainerMap@@_")) {
        macConfigs[configKey].configKey = configKey;
        assignments.push(macConfigs[configKey]);
      }
    }

    console.assert(assignments.length === 5, "There should be 5 identity entries");
    for (const assignment of assignments) {
      console.log(assignment);
      console.assert(!!assignment.identityMacAddonUUID, `${assignment.configKey} should have a uuid`);
    }
    console.log("!!!Finished!!!");
  },

  async testReconcileSiteAssignments() {
    await browser.tests.stopSyncListeners();
    console.log("Testing reconciling Site Assignments");

    await this.setState(
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
      await browser.storage.sync.set({[site]:testSites[site]});
    }

    await browser.storage.sync.set({
      deletedSiteList: ["siteContainerMap@@_www.google.com"]
    });
    console.log(await browser.storage.sync.get());
    await sync.runSync();

    const assignedSites = await assignManager.storageArea.getAssignedSites();
    console.assert(Object.keys(assignedSites).length === 6, "There should be 6 assigned sites");
    console.log("!!!Finished!!!");
  },

  async testInitialSync() {
    await browser.tests.stopSyncListeners();
    console.log("Testing new install with no sync");

    await this.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);

    await sync.runSync();

    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();
    const identities = await browser.contextualIdentities.query({});

    console.assert(
      identities.length === 5,
      "There should be 5 identities"
    );

    console.assert(
      Object.keys(getAssignedSites).length === 0,
      "There should be no site assignments"
    );
    console.log("!!!Finished!!!");
  },

  async test2() {
    await browser.tests.stopSyncListeners();
    console.log("Testing sync differing from local");

    await this.setState(SYNC_DATA, LOCAL_DATA, TEST_CONTAINERS, TEST_ASSIGNMENTS);

    await sync.runSync();

    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();

    const identities = await browser.contextualIdentities.query({});

    console.assert(
      identities.length === 6,
      "There should be 6 identities"
    );

    console.assert(
      Object.keys(getAssignedSites).length === 5,
      "There should be 5 site assignments"
    );
    console.log("!!!Finished!!!");
  },

  async dupeTest() {
    await browser.tests.stopSyncListeners();
    console.log("Test state from sync that duped everything initially");

    await this.setState(
      DUPE_TEST_SYNC, 
      DUPE_TEST_LOCAL, 
      DUPE_TEST_IDENTS, 
      DUPE_TEST_ASSIGNMENTS
    );

    await sync.runSync();

    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();

    const identities = await browser.contextualIdentities.query({});

    console.assert(
      identities.length === 7,
      "There should be 7 identities"
    );

    console.assert(
      Object.keys(getAssignedSites).length === 5,
      "There should be 5 site assignments"
    );

    const personalContainer = 
      this.lookupIdentityBy(identities, {name: "Personal"});
    console.log(personalContainer);
    console.assert(
      personalContainer.color === "red",
      "Personal Container should be red"
    );
    const mozillaContainer =
      this.lookupIdentityBy(identities, {name: "Mozilla"});
    console.assert(
      mozillaContainer.icon === "pet",
      "Mozilla Container should be pet"
    );
    console.log("!!!Finished!!!");
  },

  async CIerrorTest() {
    await browser.tests.stopSyncListeners();
    console.log("Test state from sync that duped everything initially");

    await this.setState(
      CI_ERROR_TEST_SYNC, 
      CI_ERROR_TEST_LOCAL, 
      CI_ERROR_TEST_IDENTS, 
      CI_ERROR_TEST_SITES
    );

    await sync.runSync();

    const getSync = await browser.storage.sync.get();
    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();

    const identities = await browser.contextualIdentities.query({});

    console.assert(
      Object.keys(getSync.cookieStoreIDmap).length === 7, 
      "cookieStoreIDmap should have 7 entries"
    );

    console.assert(
      identities.length === 7,
      "There should be 7 identities"
    );

    console.assert(
      Object.keys(getAssignedSites).length === 5,
      "There should be 5 site assignments"
    );

    const personalContainer = 
      this.lookupIdentityBy(identities, {name: "Personal"});
    console.log(personalContainer);
    console.assert(
      personalContainer.color === "red",
      "Personal Container should be red"
    );
    const mozillaContainer =
      this.lookupIdentityBy(identities, {name: "Mozilla"});
    console.assert(
      mozillaContainer.icon === "pet",
      "Mozilla Container should be pet"
    );
    console.log("!!!Finished!!!");
  },

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
  },

  /*
   * Sets the state of sync storage, local storage, and the identities.
   * SyncDat and localData (without identities or site assignments) get
   * set to sync and local storage respectively. IdentityData creates
   * new identities (after all have been removed), and assignmentData
   * is used along with the new identities' cookieStoreIds to create
   * site assignments in local storage.
   */
  async setState(syncData, localData, identityData, assignmentData){
    await this.removeAllContainers();
    await browser.storage.sync.clear();
    await browser.storage.sync.set(syncData);
    await browser.storage.local.clear();
    await browser.storage.local.set(localData);
    for (let i=0; i < identityData.length; i++) {
      //build identities
      const newIdentity = 
        await browser.contextualIdentities.create(identityData[i]);
      // fill identies with site assignments
      if (assignmentData && assignmentData[i]) {
        const data =  { 
          "userContextId": 
            String(
              newIdentity.cookieStoreId.replace(/^firefox-container-/, "")
            ),
          "neverAsk": true
        };

        await browser.storage.local.set({[assignmentData[i]]: data});
      }
    }
    console.log("local storage set: ", await browser.storage.local.get());
    return;
  },

  async removeAllContainers() {
    const identities = await browser.contextualIdentities.query({});
    for (const identity of identities) {
      await browser.contextualIdentities.remove(identity.cookieStoreId);
    }
  },

  async stopSyncListeners() {
    await browser.storage.onChanged.removeListener(sync.storageArea.onChangedListener);
    await sync.removeContextualIdentityListeners();
  },

  async startListeners() {
    await browser.storage.onChanged.addListener(sync.storageArea.onChangedListener);
    await sync.addContextualIdentityListeners();
  },

};

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
  "browserActionBadgesClicked": [ "6.1.1" ],
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
    "6.1.1"
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

const CI_ERROR_TEST_SYNC = {
  "identities": [
    {
      "name": "Personal",
      "icon": "fingerprint",
      "iconUrl": "resource://usercontext-content/fingerprint.svg",
      "color": "blue",
      "colorCode": "#37adff",
      "cookieStoreId": "firefox-container-6"
    },
    {
      "name": "Mozilla",
      "icon": "fruit",
      "iconUrl": "resource://usercontext-content/fruit.svg",
      "color": "purple",
      "colorCode": "#af51f5",
      "cookieStoreId": "firefox-container-8"
    },
    {
      "name": "Groceries, obviously",
      "icon": "cart",
      "iconUrl": "resource://usercontext-content/cart.svg",
      "color": "yellow",
      "colorCode": "#ffcb00",
      "cookieStoreId": "firefox-container-9"
    },
    {
      "name": "Facebook",
      "icon": "circle",
      "iconUrl": "resource://usercontext-content/circle.svg",
      "color": "blue",
      "colorCode": "#37adff",
      "cookieStoreId": "firefox-container-10"
    },
    {
      "name": "Work",
      "icon": "briefcase",
      "iconUrl": "resource://usercontext-content/briefcase.svg",
      "color": "orange",
      "colorCode": "#ff9f00",
      "cookieStoreId": "firefox-container-11"
    },
    {
      "name": "Greg's container",
      "icon": "vacation",
      "iconUrl": "resource://usercontext-content/vacation.svg",
      "color": "yellow",
      "colorCode": "#ffcb00",
      "cookieStoreId": "firefox-container-14"
    }
  ],
  "deletedIdentityList": [
    "8098140e-d406-4321-b4f5-24763b4f9513",
    "73aebc7a-286f-408a-9a94-a06d29b288e0",
    "8f153224-bbe8-4664-ba02-0293ddec3e78"
  ],
  "cookieStoreIDmap": {
    "firefox-container-10": "58956e95-43fb-44af-95c0-1ec8d83e1e13",
    "firefox-container-11": "0269558d-6be7-487b-beb1-b720b346d09b",
    "firefox-container-14": "e48d04cf-6277-4236-8f3d-611287d0caf2",
    "firefox-container-6": "869a7563-030d-4a63-8a84-209270561d3c",
    "firefox-container-8": "73aebc7a-286f-408a-9a94-a06d29b288e0",
    "firefox-container-9": "4831fef4-6f43-47fb-a578-ccdc3ee7f883"
  },
  "assignedSites": {
    "siteContainerMap@@_bugzilla.mozilla.org": {
      "userContextId": "11",
      "neverAsk": true,
      "identityMacAddonUUID": "0269558d-6be7-487b-beb1-b720b346d09b",
      "hostname": "bugzilla.mozilla.org"
    },
    "siteContainerMap@@_www.amazon.com": {
      "userContextId": "14",
      "neverAsk": false,
      "identityMacAddonUUID": "e48d04cf-6277-4236-8f3d-611287d0caf2",
      "hostname": "www.amazon.com"
    }
  },
  "deletedSiteList": [
    "siteContainerMap@@_www.facebook.com"
  ]
};

const CI_ERROR_TEST_LOCAL = {
  "browserActionBadgesClicked": [
    "6.1.1"
  ],
  "containerTabsOpened": 6,
  "onboarding-stage": 5,
};

const CI_ERROR_TEST_SITES = [
  "siteContainerMap@@_bugzilla.mozilla.org",
  "siteContainerMap@@_www.bankofoklahoma.com",
  "siteContainerMap@@_www.mozilla.org",
  "siteContainerMap@@_www.reddit.com"
];

const CI_ERROR_TEST_IDENTS = [
  {
    "name": "Personal",
    "icon": "fingerprint",
    "color": "blue",
  },
  {
    "name": "Work",
    "icon": "briefcase",
    "color": "orange",
  },
  {
    "name": "Banking",
    "icon": "dollar",
    "color": "green",
  },
  {
    "name": "Mozilla",
    "icon": "fruit",
    "color": "purple",
  },
  {
    "name": "Groceries, obviously",
    "icon": "cart",
    "color": "yellow",
  },
  {
    "name": "Facebook",
    "icon": "circle",
    "color": "blue",
  }
];
