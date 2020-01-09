browser.tests = {
  async runAll() {
    await this.testIdentityStateCleanup();
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

    await identityState.storageArea.cleanup();

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
    console.log("Finished!");
  },

  async testAssignManagerCleanup() {
    await browser.tests.stopSyncListeners();
    console.log("Testing the cleanup of local storage");

    await this.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);

    await browser.storage.local.set({
      "siteContainerMap@@_www.goop.com": { 
        "userContextId": "5",
        "neverAsk": true,
        "hostname": "www.goop.com"
      }
    });
    console.log("local storage set: ", await browser.storage.local.get());

    await assignManager.storageArea.cleanup();

    await browser.storage.local.set({
      "identitiesState@@_firefox-container-5": { 
        "hiddenTabs": [] 
      }
    });

    const macConfigs = await browser.storage.local.get();
    const assignments = [];
    for(const configKey of Object.keys(macConfigs)) {
      if (configKey.includes("siteContainerMap@@_")) {
        assignments.push(configKey);
      }
    }

    console.assert(assignments.length === 0, "There should be 0 identity entries");

    console.log("Finished!");
  },

  async testReconcileSiteAssignments() {
    await browser.tests.stopSyncListeners();
    console.log("Testing reconciling Site Assignments");

    const newSyncData = DUPE_TEST_SYNC;
    // add some bad data.
    newSyncData.assignedSites["siteContainerMap@@_www.linkedin.com"] = {
      "userContextId": "1",
      "neverAsk": true,
      "hostname": "www.linkedin.com"
    };

    newSyncData.deletedSiteList = ["siteContainerMap@@_www.google.com"];

    await this.setState(
      newSyncData, 
      LOCAL_DATA, 
      TEST_CONTAINERS, 
      SITE_ASSIGNMENT_TEST
    );

    await sync.runSync();

    const assignedSites = await assignManager.storageArea.getAssignedSites();
    console.assert(Object.keys(assignedSites).length === 5, "There should be 5 assigned sites");
    console.log("Finished!");
  },

  async testInitialSync() {
    await browser.tests.stopSyncListeners();
    console.log("Testing new install with no sync");

    await this.setState({}, LOCAL_DATA, TEST_CONTAINERS, []);

    await sync.runSync();

    const getSync = await browser.storage.sync.get();
    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();
    const identities = await browser.contextualIdentities.query({});
    const localCookieStoreIDmap = 
      await identityState.getCookieStoreIDuuidMap();

    console.assert(
      Object.keys(getSync.cookieStoreIDmap).length === 5, 
      "cookieStoreIDmap should have 5 entries"
    );

    console.assert(
      Object.keys(localCookieStoreIDmap).length === 6, 
      "localCookieStoreIDmap should have 6 entries"
    );

    console.assert(
      identities.length === 5,
      "There should be 5 identities"
    );

    console.assert(
      Object.keys(getAssignedSites).length === 0,
      "There should be no site assignments"
    );
    console.log("Finished!");
  },

  async test2() {
    await browser.tests.stopSyncListeners();
    console.log("Testing sync differing from local");

    await this.setState(SYNC_DATA, LOCAL_DATA, TEST_CONTAINERS, TEST_ASSIGNMENTS);

    await sync.runSync();

    const getSync = await browser.storage.sync.get();
    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();

    const identities = await browser.contextualIdentities.query({});

    const localCookieStoreIDmap = 
      await identityState.getCookieStoreIDuuidMap();

    console.assert(
      Object.keys(getSync.cookieStoreIDmap).length === 6, 
      "cookieStoreIDmap should have 6 entries"
    );

    console.assert(
      Object.keys(localCookieStoreIDmap).length === 7, 
      "localCookieStoreIDmap should have 7 entries"
    );

    console.assert(
      identities.length === 6,
      "There should be 6 identities"
    );

    console.assert(
      Object.keys(getAssignedSites).length === 5,
      "There should be 5 site assignments"
    );
    console.log("Finished!");
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

    const getSync = await browser.storage.sync.get();
    const getAssignedSites = 
      await assignManager.storageArea.getAssignedSites();

    const identities = await browser.contextualIdentities.query({});

    const localCookieStoreIDmap = 
      await identityState.getCookieStoreIDuuidMap();

    console.assert(
      Object.keys(getSync.cookieStoreIDmap).length === 7, 
      "cookieStoreIDmap should have 7 entries"
    );

    console.assert(
      Object.keys(localCookieStoreIDmap).length === 8, 
      "localCookieStoreIDmap should have 8 entries"
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
    console.log("Finished!");
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

  stopSyncListeners() {
    browser.storage.onChanged.removeListener(sync.storageArea.onChangedListener);
    removeContextualIdentityListeners();
  },

  startListeners() {
    browser.storage.onChanged.addListener(sync.storageArea.onChangedListener);
    addContextualIdentityListeners();
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
  "identities": [
    {
      "name": "Personal",
      "icon": "fingerprint",
      "iconUrl": "resource://usercontext-content/fingerprint.svg",
      "color": "red",
      "colorCode": "#37adff",
      "cookieStoreId": "firefox-container-146"
    },
    {
      "name": "Oscar",
      "icon": "dollar",
      "iconUrl": "resource://usercontext-content/dollar.svg",
      "color": "green",
      "colorCode": "#51cd00",
      "cookieStoreId": "firefox-container-147"
    },
    {
      "name": "Mozilla",
      "icon": "pet",
      "iconUrl": "resource://usercontext-content/briefcase.svg",
      "color": "red",
      "colorCode": "#ff613d",
      "cookieStoreId": "firefox-container-148"
    },
    {
      "name": "Groceries, obviously",
      "icon": "cart",
      "iconUrl": "resource://usercontext-content/cart.svg",
      "color": "pink",
      "colorCode": "#ffcb00",
      "cookieStoreId": "firefox-container-149"
    },
    {
      "name": "Facebook",
      "icon": "fence",
      "iconUrl": "resource://usercontext-content/fence.svg",
      "color": "toolbar",
      "colorCode": "#7c7c7d",
      "cookieStoreId": "firefox-container-150"
    }
  ],
  "cookieStoreIDmap": {
    "firefox-container-146": "22ded543-5173-44a5-a47a-8813535945ca",
    "firefox-container-147": "63e5212f-0858-418e-b5a3-09c2dea61fcd",
    "firefox-container-148": "71335417-158e-4d74-a55b-e9e9081601ec",
    "firefox-container-149": "59c4e5f7-fe3b-435a-ae60-1340db31a91b",
    "firefox-container-150": "3dc916fb-8c0a-4538-9758-73ef819a45f7"
  },
  "assignedSites": {}
};

const DUPE_TEST_SYNC = {
  "identities": [
    {
      "name": "Personal",
      "icon": "fingerprint",
      "iconUrl": "resource://usercontext-content/fingerprint.svg",
      "color": "red",
      "colorCode": "#ff613d",
      "cookieStoreId": "firefox-container-588"
    },
    {
      "name": "Banking",
      "icon": "dollar",
      "iconUrl": "resource://usercontext-content/dollar.svg",
      "color": "green",
      "colorCode": "#51cd00",
      "cookieStoreId": "firefox-container-589"
    },
    {
      "name": "Mozilla",
      "icon": "pet",
      "iconUrl": "resource://usercontext-content/pet.svg",
      "color": "red",
      "colorCode": "#ff613d",
      "cookieStoreId": "firefox-container-590"
    },
    {
      "name": "Groceries, obviously",
      "icon": "cart",
      "iconUrl": "resource://usercontext-content/cart.svg",
      "color": "pink",
      "colorCode": "#ff4bda",
      "cookieStoreId": "firefox-container-591"
    },
    {
      "name": "Facebook",
      "icon": "fence",
      "iconUrl": "resource://usercontext-content/fence.svg",
      "color": "toolbar",
      "colorCode": "#7c7c7d",
      "cookieStoreId": "firefox-container-592"
    },
    {
      "name": "Oscar",
      "icon": "dollar",
      "iconUrl": "resource://usercontext-content/dollar.svg",
      "color": "green",
      "colorCode": "#51cd00",
      "cookieStoreId": "firefox-container-593"
    }
  ],
  "cookieStoreIDmap": {
    "firefox-container-588": "d20d7af2-9866-468e-bb43-541efe8c2c2e",
    "firefox-container-589": "cdd73c20-c26a-4c06-9b17-735c1f5e9187",
    "firefox-container-590": "32cc4a9b-05ed-4e54-8e11-732468de62f4",
    "firefox-container-591": "9ff381e3-4c11-420d-8e12-e352a3318be1",
    "firefox-container-592": "3dc916fb-8c0a-4538-9758-73ef819a45f7",
    "firefox-container-593": "63e5212f-0858-418e-b5a3-09c2dea61fcd"
  },
  "assignedSites": {
    "siteContainerMap@@_developer.mozilla.org": {
      "userContextId": "588",
      "neverAsk": true,
      "hostname": "developer.mozilla.org"
    },
    "siteContainerMap@@_reddit.com": {
      "userContextId": "592",
      "neverAsk": true,
      "hostname": "reddit.com"
    },
    "siteContainerMap@@_twitter.com": {
      "userContextId": "589",
      "neverAsk": true,
      "hostname": "twitter.com"
    },
    "siteContainerMap@@_www.facebook.com": {
      "userContextId": "590",
      "neverAsk": true,
      "hostname": "www.facebook.com"
    },
    "siteContainerMap@@_www.linkedin.com": {
      "userContextId": "591",
      "neverAsk": true,
      "hostname": "www.linkedin.com"
    }
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
