/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const CONTAINER_HIDE_SRC = "/img/password-hide.svg";
const CONTAINER_UNHIDE_SRC = "/img/password-hide.svg";

const DEFAULT_COLOR = "blue";
const DEFAULT_ICON = "circle";
const NEW_CONTAINER_ID = "new";

const ONBOARDING_STORAGE_KEY = "onboarding-stage";
const CONTAINER_ORDER_STORAGE_KEY = "container-order";
const CONTAINER_DRAG_DATA_TYPE = "firefox-container";

// List of panels
const P_ONBOARDING_1 = "onboarding1";
const P_ONBOARDING_2 = "onboarding2";
const P_ONBOARDING_3 = "onboarding3";
const P_ONBOARDING_4 = "onboarding4";
const P_ONBOARDING_5 = "onboarding5";
const P_ONBOARDING_6 = "onboarding6";
const P_ONBOARDING_7 = "onboarding7";
const P_ONBOARDING_8 = "onboarding8";

const P_CONTAINERS_LIST = "containersList";
const OPEN_NEW_CONTAINER_PICKER = "new-tab";
const MANAGE_CONTAINERS_PICKER = "manage";
const REOPEN_IN_CONTAINER_PICKER = "reopen-in";
const ALWAYS_OPEN_IN_PICKER = "always-open-in";
const P_CONTAINER_INFO = "containerInfo";
const P_CONTAINER_EDIT = "containerEdit";
const P_CONTAINER_DELETE = "containerDelete";
const P_CONTAINERS_ACHIEVEMENT = "containersAchievement";
const P_CONTAINER_ASSIGNMENTS = "containerAssignments";

const P_MOZILLA_VPN_SERVER_LIST = "moz-vpn-server-list";
const P_ADVANCED_PROXY_SETTINGS = "advanced-proxy-settings-panel";

function addRemoveSiteIsolation() {
  const identity = Logic.currentIdentity();
  browser.runtime.sendMessage({
    method: "addRemoveSiteIsolation",
    cookieStoreId: identity.cookieStoreId
  });
}

async function getExtensionInfo() {
  const manifestPath = browser.runtime.getURL("manifest.json");
  const response = await fetch(manifestPath);
  const extensionInfo = await response.json();
  return extensionInfo;
}

// This object controls all the panels, identities and many other things.
const Logic = {
  _identities: [],
  _currentIdentity: null,
  _currentPanel: null,
  _previousPanelPath: [],
  _panels: {},
  _onboardingVariation: null,

  async init() {
    browser.runtime.sendMessage({
      method: "MozillaVPN_attemptPort"
    }),

    // Remove browserAction "upgraded" badge when opening panel
    this.clearBrowserActionBadge();

    // Retrieve the list of identities.
    const identitiesPromise = this.refreshIdentities();

    try {
      await identitiesPromise;
    } catch (e) {
      throw new Error("Failed to retrieve the identities or variation. We cannot continue. ", e.message);
    }

    // Routing to the correct panel.
    // If localStorage is disabled, we don't show the onboarding.
    const onboardingData = await browser.storage.local.get([ONBOARDING_STORAGE_KEY]);
    let onboarded = onboardingData[ONBOARDING_STORAGE_KEY];
    if (!onboarded) {
      onboarded = 9;
      this.setOnboardingStage(onboarded);
    }

    switch (onboarded) {
    case 8:
      this.showAchievementOrContainersListPanel();
      break;
    case 7:
      this.showPanel(P_ONBOARDING_8);
      break;
    case 6:
      this.showPanel(P_ONBOARDING_8);
      break;
    case 5:
      this.showPanel(P_ONBOARDING_6);
      break;
    case 4:
      this.showPanel(P_ONBOARDING_5);
      break;
    case 3:
      this.showPanel(P_ONBOARDING_4);
      break;
    case 2:
      this.showPanel(P_ONBOARDING_3);
      break;
    case 1:
      this.showPanel(P_ONBOARDING_2);
      break;
    case 0:
    default:
      this.showPanel(P_ONBOARDING_1);
      break;
    }

  },

  async showAchievementOrContainersListPanel() {
    // Do we need to show an achievement panel?
    let showAchievements = false;
    const achievementsStorage = await browser.storage.local.get({ achievements: [] });
    for (const achievement of achievementsStorage.achievements) {
      if (!achievement.done) {
        showAchievements = true;
      }
    }
    if (showAchievements) {
      this.showPanel(P_CONTAINERS_ACHIEVEMENT);
    } else {
      this.showPanel(P_CONTAINERS_LIST);
    }
  },

  // In case the user wants to click multiple actions,
  // they have to click the "Done" button to stop the panel
  // from showing
  async setAchievementDone(achievementName) {
    const achievementsStorage = await browser.storage.local.get({ achievements: [] });
    const achievements = achievementsStorage.achievements;
    achievements.forEach((achievement, index, achievementsArray) => {
      if (achievement.name === achievementName) {
        achievement.done = true;
        achievementsArray[index] = achievement;
      }
    });
    browser.storage.local.set({ achievements });
  },

  setOnboardingStage(stage) {
    return browser.storage.local.set({
      [ONBOARDING_STORAGE_KEY]: stage
    });
  },

  async clearBrowserActionBadge() {
    const extensionInfo = await getExtensionInfo();
    const storage = await browser.storage.local.get({ browserActionBadgesClicked: [] });
    browser.browserAction.setBadgeBackgroundColor({ color: "#ffffff" });
    browser.browserAction.setBadgeText({ text: "" });
    storage.browserActionBadgesClicked.push(extensionInfo.version);
    // use set and spread to create a unique array
    const browserActionBadgesClicked = [...new Set(storage.browserActionBadgesClicked)];
    browser.storage.local.set({
      browserActionBadgesClicked
    });
  },

  async identity(cookieStoreId) {
    const defaultContainer = {
      name: "Default",
      cookieStoreId,
      icon: "default-tab",
      color: "default-tab",
      numberOfHiddenTabs: 0,
      numberOfOpenTabs: 0
    };
    // Handle old style rejection with null and also Promise.reject new style
    try {
      return await browser.contextualIdentities.get(cookieStoreId) || defaultContainer;
    } catch (e) {
      return defaultContainer;
    }
  },

  async numTabs() {
    const activeTabs = await browser.tabs.query({ windowId: browser.windows.WINDOW_ID_CURRENT });
    return activeTabs.length;
  },

  _disableMenuItem(message, elementToDisable = document.querySelector("#move-to-new-window")) {
    elementToDisable.setAttribute("title", message);
    elementToDisable.removeAttribute("tabindex");
    elementToDisable.classList.remove("hover-highlight");
    elementToDisable.classList.add("disabled-menu-item");
  },

  _enableMenuItems(elementToEnable = document.querySelector("#move-to-new-window")) {
    elementToEnable.removeAttribute("title");
    elementToEnable.setAttribute("tabindex", "0");
    elementToEnable.classList.add("hover-highlight");
    elementToEnable.classList.remove("disabled-menu-item");
  },

  async saveContainerOrder(rows) {
    const containerOrder = {};
    rows.forEach((node, index) => {
      return containerOrder[node.dataset.containerId] = index;
    });
    await browser.storage.local.set({
      [CONTAINER_ORDER_STORAGE_KEY]: containerOrder
    });
  },

  async refreshIdentities() {
    const [identities, state, containerOrderStorage] = await Promise.all([
      browser.contextualIdentities.query({}),
      browser.runtime.sendMessage({
        method: "queryIdentitiesState",
        message: {
          windowId: browser.windows.WINDOW_ID_CURRENT
        }
      }),
      browser.storage.local.get([CONTAINER_ORDER_STORAGE_KEY])
    ]);
    const containerOrder =
      containerOrderStorage && containerOrderStorage[CONTAINER_ORDER_STORAGE_KEY];
    this._identities = identities.map((identity) => {
      const stateObject = state[identity.cookieStoreId];
      if (stateObject) {
        identity.hasOpenTabs = stateObject.hasOpenTabs;
        identity.hasHiddenTabs = stateObject.hasHiddenTabs;
        identity.numberOfHiddenTabs = stateObject.numberOfHiddenTabs;
        identity.numberOfOpenTabs = stateObject.numberOfOpenTabs;
        identity.isIsolated = stateObject.isIsolated;
      }
      if (containerOrder) {
        identity.order = containerOrder[identity.cookieStoreId];
      }
      return identity;
    }).sort((i1, i2) => i1.order - i2.order);
  },

  getPanelSelector(panel) {
    if (this._onboardingVariation === "securityOnboarding" &&
    // eslint-disable-next-line no-prototype-builtins
      panel.hasOwnProperty("securityPanelSelector")) {
      return panel.securityPanelSelector;
    } else {
      return panel.panelSelector;
    }
  },

  async showPanel(panel, currentIdentity = null, backwards = false, addToPreviousPanelPath = true) {
    if ((!backwards && addToPreviousPanelPath) || !this._currentPanel) {
      this._previousPanelPath.push(this._currentPanel);
    }

    // If invalid panel, reset panels.
    if (!(panel in this._panels)) {
      panel = P_CONTAINERS_LIST;
      this._previousPanelPath = [];
    }

    this._currentPanel = panel;

    this._currentIdentity = currentIdentity;

    // Initialize the panel before showing it.
    await this._panels[panel].prepare();
    Object.keys(this._panels).forEach((panelKey) => {
      const panelItem = this._panels[panelKey];
      const panelElement = document.querySelector(this.getPanelSelector(panelItem));
      if (!panelElement.classList.contains("hide")) {
        panelElement.classList.add("hide");
        if ("unregister" in panelItem) {
          panelItem.unregister();
        }
      }
    });
    const panelEl = document.querySelector(this.getPanelSelector(this._panels[panel]));
    panelEl.classList.remove("hide");

    const focusEl = panelEl.querySelector(".firstTabindex");
    if(focusEl) {
      focusEl.focus();
    }
  },

  showPreviousPanel() {
    if (!this._previousPanelPath) {
      throw new Error("Current panel not set!");
    }
    this.showPanel(this._previousPanelPath.pop(), this._currentIdentity, true);
  },

  registerPanel(panelName, panelObject) {
    this._panels[panelName] = panelObject;
    panelObject.initialize();
  },

  identities() {
    return this._identities;
  },

  currentIdentity() {
    if (!this._currentIdentity) {
      throw new Error("CurrentIdentity must be set before calling Logic.currentIdentity.");
    }
    return this._currentIdentity;
  },

  currentUserContextId() {
    const identity = Logic.currentIdentity();
    return Utils.userContextId(identity.cookieStoreId);
  },

  cookieStoreId(userContextId) {
    return `firefox-container-${userContextId}`;
  },

  currentCookieStoreId() {
    const identity = Logic.currentIdentity();
    return identity.cookieStoreId;
  },

  removeIdentity(userContextId) {
    if (!userContextId) {
      return Promise.reject("removeIdentity must be called with userContextId argument.");
    }

    return browser.runtime.sendMessage({
      method: "deleteContainer",
      message: { userContextId }
    });
  },

  getAssignment(tab) {
    return browser.runtime.sendMessage({
      method: "getAssignment",
      tabId: tab.id
    });
  },

  getAssignmentObjectByContainer(userContextId) {
    if (!userContextId) {
      return {};
    }
    return browser.runtime.sendMessage({
      method: "getAssignmentObjectByContainer",
      message: { userContextId }
    });
  },

  generateIdentityName() {
    const defaultName = "Container #";
    const ids = [];

    // This loop populates the 'ids' array with all the already-used ids.
    this._identities.forEach(identity => {
      if (identity.name.startsWith(defaultName)) {
        const id = parseInt(identity.name.substr(defaultName.length), 10);
        if (id) {
          ids.push(id);
        }
      }
    });

    // Here we find the first valid id.
    for (let id = 1; ; ++id) {
      if (ids.indexOf(id) === -1) {
        return defaultName + (id < 10 ? "0" : "") + id;
      }
    }
  },

  getCurrentPanelElement() {
    const panelItem = this._panels[this._currentPanel];
    return document.querySelector(this.getPanelSelector(panelItem));
  },

  listenToPickerBackButton() {
    const closeContEl = document.querySelector("#close-container-picker-panel");
    if (!this._listenerSet) {
      Utils.addEnterHandler(closeContEl, () => {
        Logic.showPanel(P_CONTAINERS_LIST);
      });
      this._listenerSet = true;
    }
  },

  shortcutListener(e){
    function openNewContainerTab(identity) {
      try {
        browser.tabs.create({
          cookieStoreId: identity.cookieStoreId
        });
        window.close();
      } catch (e) {
        window.close();
      }
    }
    const identities = Logic.identities();
    if ((e.keyCode >= 49 && e.keyCode <= 57) &&
            Logic._currentPanel === "containersList") {
      const identity = identities[e.keyCode - 49];
      if (identity) {
        openNewContainerTab(identity);
      }
    }
  },

  keyboardNavListener(e){
    const panelSelector = Logic.getPanelSelector(Logic._panels[Logic._currentPanel]);
    const selectables = [...document.querySelectorAll(`${panelSelector} .keyboard-nav[tabindex='0']`)];
    const element = document.activeElement;
    const backButton = document.querySelector(`${panelSelector} .keyboard-nav-back`);
    const index = selectables.indexOf(element) || 0;
    function next() {
      const nextElement = selectables[index + 1];
      if (nextElement) {
        nextElement.focus();
      }
    }
    function previous() {
      const previousElement = selectables[index - 1];
      if (previousElement) {
        previousElement.focus();
      }
    }
    switch (e.keyCode) {
    case 40:
      next();
      break;
    case 38:
      previous();
      break;
    case 39:
    {
      if(element){
        element.click();
      }

      // If one Container is highlighted,
      if (element.classList.contains("keyboard-right-arrow-override")) {
        element.querySelector(".menu-right-float").click();
      }

      break;
    }
    case 37:
    {
      if(backButton){
        backButton.click();
      }
      break;
    }
    default:
      break;
    }
  }
};

// P_ONBOARDING_1: First page for Onboarding.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_1, {
  panelSelector: ".onboarding-panel-1",
  securityPanelSelector: ".security-onboarding-panel-1",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the next panel.
    [...document.querySelectorAll(".onboarding-start-button")].forEach(startElement => {
      Utils.addEnterHandler(startElement, async () => {
        await Logic.setOnboardingStage(1);
        Logic.showPanel(P_ONBOARDING_2);
      });
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

// P_ONBOARDING_2: Second page for Onboarding.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_2, {
  panelSelector: ".onboarding-panel-2",
  securityPanelSelector: ".security-onboarding-panel-2",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    [...document.querySelectorAll(".onboarding-next-button")].forEach(nextElement => {
      Utils.addEnterHandler(nextElement, async () => {
        await Logic.setOnboardingStage(2);
        Logic.showPanel(P_ONBOARDING_3);
      });
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

// P_ONBOARDING_3: Third page for Onboarding.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_3, {
  panelSelector: ".onboarding-panel-3",
  securityPanelSelector: ".security-onboarding-panel-3",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    [...document.querySelectorAll(".onboarding-almost-done-button")].forEach(almostElement => {
      Utils.addEnterHandler(almostElement, async () => {
        await Logic.setOnboardingStage(3);
        Logic.showPanel(P_ONBOARDING_4);
      });
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

// P_ONBOARDING_4: Fourth page for Onboarding.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_4, {
  panelSelector: ".onboarding-panel-4",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    Utils.addEnterHandler(document.querySelector("#onboarding-done-button"), async () => {
      await Logic.setOnboardingStage(4);
      Logic.showPanel(P_ONBOARDING_5);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

// P_ONBOARDING_5: Fifth page for Onboarding: new tab long-press behavior
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_5, {
  panelSelector: ".onboarding-panel-5",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    Utils.addEnterHandler(document.querySelector("#onboarding-longpress-button"), async () => {
      await Logic.setOnboardingStage(5);
      Logic.showPanel(P_ONBOARDING_6);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

// P_ONBOARDING_6: Sixth page for Onboarding: new tab long-press behavior
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_6, {
  panelSelector: ".onboarding-panel-6",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    Utils.addEnterHandler(document.querySelector("#start-sync-button"), async () => {
      await Logic.setOnboardingStage(6);
      await browser.storage.local.set({syncEnabled: true});
      await browser.runtime.sendMessage({
        method: "resetSync"
      });
      Logic.showPanel(P_ONBOARDING_7);
    });
    Utils.addEnterHandler(document.querySelector("#no-sync"), async () => {
      await Logic.setOnboardingStage(6);
      await browser.storage.local.set({syncEnabled: false});
      await browser.runtime.sendMessage({
        method: "resetSync"
      });
      Logic.showPanel(P_ONBOARDING_8);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});
// -----------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_7, {
  panelSelector: ".onboarding-panel-7",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    Utils.addEnterHandler(document.querySelector("#sign-in"), async () => {
      browser.tabs.create({
        url: "https://accounts.firefox.com/?service=sync&action=email&context=fx_desktop_v3&entrypoint=multi-account-containers&utm_source=addon&utm_medium=panel&utm_campaign=container-sync",
      });
      await Logic.setOnboardingStage(7);
      Logic.showPanel(P_ONBOARDING_8);
    });
    Utils.addEnterHandler(document.querySelector("#no-sign-in"), async () => {
      await Logic.setOnboardingStage(7);
      Logic.showPanel(P_ONBOARDING_8);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

Logic.registerPanel(P_ONBOARDING_8, {
  panelSelector: ".onboarding-panel-8",

  // This method is called when the object is registered.
  initialize() {
    document.querySelectorAll(".onboarding-done").forEach(el => {
      Utils.addEnterHandler(el, async () => {
        await Logic.setOnboardingStage(8);
        Logic.showPanel(P_CONTAINERS_LIST);
      });
    });

  },

  // This method is called when the panel is shown.
  async prepare() {
    const mozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();
    if (!mozillaVpnPermissionsEnabled) {
      const panel = document.querySelector(".onboarding-panel-8");
      panel.classList.add("optional-permissions-disabled");

      Utils.addEnterHandler(panel.querySelector("#onboarding-enable-permissions"), async () => {
        const granted = await browser.permissions.request({ permissions: ["proxy", "nativeMessaging"] });
        if (granted) {
          await Logic.setOnboardingStage(8);
        }
      });
    }
    return Promise.resolve(null);
  },
});
// P_CONTAINERS_LIST: The list of containers. The main page.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINERS_LIST, {
  panelSelector: "#container-panel",

  // This method is called when the object is registered.
  async initialize() {
    await browser.runtime.sendMessage({ method: "MozillaVPN_queryStatus" });
    Utils.addEnterHandler(document.querySelector("#manage-containers-link"), (e) => {
      if (!e.target.classList.contains("disable-edit-containers")) {
        Logic.showPanel(MANAGE_CONTAINERS_PICKER);
      }
    });
    Utils.addEnterHandler(document.querySelector("#open-new-tab-in"), () => {
      Logic.showPanel(OPEN_NEW_CONTAINER_PICKER);
    });
    Utils.addEnterHandler(document.querySelector("#reopen-site-in"), () => {
      Logic.showPanel(REOPEN_IN_CONTAINER_PICKER);
    });
    Utils.addEnterHandler(document.querySelector("#always-open-in"), () => {
      Logic.showPanel(ALWAYS_OPEN_IN_PICKER);
    });
    Utils.addEnterHandler(document.querySelector("#sort-containers-link"), async () => {
      try {
        await browser.runtime.sendMessage({
          method: "sortTabs"
        });
        window.close();
      } catch (e) {
        window.close();
      }
    });

    const mozillaVpnToutName = "moz-tout-main-panel";
    const mozillaVpnPermissionsWarningDotName = "moz-permissions-warning-dot";

    let { mozillaVpnHiddenToutsList } = await browser.storage.local.get("mozillaVpnHiddenToutsList");
    if (typeof(mozillaVpnHiddenToutsList) === "undefined") {
      await browser.storage.local.set({ "mozillaVpnHiddenToutsList": [] });
      mozillaVpnHiddenToutsList = [];
    }

    // Decide whether to show Mozilla VPN tout
    const mozVpnTout = document.getElementById("moz-vpn-tout");
    const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });
    const mozillaVpnToutShouldBeHidden = mozillaVpnHiddenToutsList.find(tout => tout.name === mozillaVpnToutName);
    if (mozillaVpnInstalled || mozillaVpnToutShouldBeHidden) {
      mozVpnTout.remove();
    }

    // Add handlers if tout is visible
    const mozVpnDismissTout = document.querySelector(".dismiss-moz-vpn-tout");
    if (mozVpnDismissTout) {
      Utils.addEnterHandler((mozVpnDismissTout), async() => {
        mozVpnTout.remove();
        mozillaVpnHiddenToutsList.push({
          name: mozillaVpnToutName
        });
        await browser.storage.local.set({ mozillaVpnHiddenToutsList });
      });

      Utils.addEnterHandler(document.querySelector("#moz-vpn-learn-more"), () => {
        MozillaVPN.handleMozillaCtaClick("mac-main-panel-btn");
        window.close();
      });
    }

    // Badge Options icon if both nativeMessaging and/or proxy permissions are disabled
    const bothMozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();
    const warningDotShouldBeHidden = mozillaVpnHiddenToutsList.find(tout => tout.name === mozillaVpnPermissionsWarningDotName);
    const optionsIcon = document.getElementById("info-icon");
    if (optionsIcon && !bothMozillaVpnPermissionsEnabled && !warningDotShouldBeHidden) {
      optionsIcon.classList.add("info-icon-alert");
    }

    Utils.addEnterHandler((document.querySelector("#info-icon")), async() => {
      browser.runtime.openOptionsPage();
      if (!mozillaVpnHiddenToutsList.find(tout => tout.name === mozillaVpnPermissionsWarningDotName)) {
        optionsIcon.classList.remove("info-icon-alert");
        mozillaVpnHiddenToutsList.push({
          name: mozillaVpnPermissionsWarningDotName
        });
      }
      await browser.storage.local.set({ mozillaVpnHiddenToutsList });
    });
  },

  unregister() {
  },

  // This method is called when the panel is shown.
  async prepare() {
    const fragment = document.createDocumentFragment();
    const identities = Logic.identities();

    for (const identity of identities) {
      const tr = document.createElement("tr");
      tr.classList.add("menu-item", "hover-highlight", "keyboard-nav", "keyboard-right-arrow-override");
      tr.setAttribute("tabindex", "0");
      tr.setAttribute("data-cookie-store-id", identity.cookieStoreId);
      const td = document.createElement("td");
      const openTabs = identity.numberOfOpenTabs || "" ;

      // TODO get UX and content decision on how to message and block clicks to containers with Mozilla VPN proxy configs
      // when Mozilla VPN app is disconnected.

      td.innerHTML = Utils.escaped`
        <div data-moz-proxy-warning="" class="menu-item-name">
          <div class="menu-icon">

            <div class="usercontext-icon"
              data-identity-icon="${identity.icon}"
              data-identity-color="${identity.color}">
            </div>
          </div>
          <span class="menu-text">${identity.name}</span>
          <span class="tooltip proxy-unavailable"></span>
        </div>
        <span class="menu-right-float">
          <img alt="" class="always-open-in-flag flag-img" src="/img/flags/.png"/>
          <span class="container-count">${openTabs}</span>
          <span class="menu-arrow">
            <img alt="Container Info" src="/img/arrow-icon-right.svg" />
          </span>

        </span>`;



      fragment.appendChild(tr);

      tr.appendChild(td);

      const openInThisContainer = tr.querySelector(".menu-item-name");
      Utils.addEnterHandler(openInThisContainer, (e) => {
        e.preventDefault();
        if (openInThisContainer.dataset.mozProxyWarning === "proxy-unavailable") {
          return;
        }
        try {
          browser.tabs.create({
            cookieStoreId: identity.cookieStoreId
          });
          window.close();
        } catch (e) {
          window.close();
        }
      });

      Utils.addEnterOnlyHandler(tr, () => {
        try {
          browser.tabs.create({
            cookieStoreId: identity.cookieStoreId
          });
          window.close();
        } catch (e) {
          window.close();
        }
      });

      // Select only the ">" from the container list
      const showPanelButton = tr.querySelector(".menu-right-float");

      Utils.addEnterHandler(showPanelButton, () => {
        Logic.showPanel(P_CONTAINER_INFO, identity);
      });
    }

    const list = document.querySelector("#identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    document.addEventListener("keydown", Logic.keyboardNavListener);
    document.addEventListener("keydown", Logic.shortcutListener);

    MozillaVPN.handleContainerList(identities);

    // reset path
    this._previousPanelPath = [];
    return Promise.resolve();
  },
});

// P_CONTAINER_INFO: More info about a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_INFO, {
  panelSelector: "#container-info-panel",

  // This method is called when the object is registered.
  async initialize() {
    const closeContEl = document.querySelector("#close-container-info-panel");
    Utils.addEnterHandler(closeContEl, () => {
      Logic.showPanel(P_CONTAINERS_LIST);
    });

    // Check if the user has incompatible add-ons installed
    // Note: this is not implemented in messageHandler.js
    let incompatible = false;
    try {
      incompatible = await browser.runtime.sendMessage({
        method: "checkIncompatibleAddons"
      });
    } catch (e) {
      throw new Error("Could not check for incompatible add-ons.");
    }

    const moveTabsEl = document.querySelector("#move-to-new-window");
    const numTabs = await Logic.numTabs();
    if (incompatible) {
      Logic._disableMenuItem("Moving container tabs is incompatible with Pulse, PageShot, and SnoozeTabs.");
      return;
    } else if (numTabs === 1) {
      Logic._disableMenuItem("Cannot move a tab from a single-tab window.");
      return;
    }

    Utils.addEnterHandler(moveTabsEl, async () => {
      await browser.runtime.sendMessage({
        method: "moveTabsToWindow",
        windowId: browser.windows.WINDOW_ID_CURRENT,
        cookieStoreId: Logic.currentIdentity().cookieStoreId,
      });
      window.close();
    });
  },

  // This method is called when the panel is shown.
  async prepare() {
    const identity = Logic.currentIdentity();

    const newTab = document.querySelector("#open-new-tab-in-info");
    Utils.addEnterHandler(newTab, () => {
      try {
        browser.tabs.create({
          cookieStoreId: identity.cookieStoreId
        });
        window.close();
      } catch (e) {
        window.close();
      }
    });
    // Populating the panel: name and icon
    document.getElementById("container-info-title").textContent = identity.name;

    const alwaysOpen = document.querySelector("#always-open-in-info-panel");
    Utils.addEnterHandler(alwaysOpen, async () => {
      Utils.alwaysOpenInContainer(identity);
      window.close();
    });
    // Show or not the has-tabs section.
    for (let trHasTabs of document.getElementsByClassName("container-info-has-tabs")) { // eslint-disable-line prefer-const
      trHasTabs.style.display = !identity.hasHiddenTabs && !identity.hasOpenTabs ? "none" : "";
    }

    if (identity.numberOfOpenTabs === 0) {
      Logic._disableMenuItem("No tabs available for this container");
    } else {
      Logic._enableMenuItems();
    }

    this.intializeShowHide(identity);

    // Let's retrieve the list of tabs.
    const tabs = await browser.runtime.sendMessage({
      method: "getTabs",
      windowId: browser.windows.WINDOW_ID_CURRENT,
      cookieStoreId: Logic.currentIdentity().cookieStoreId
    });
    const manageContainer = document.querySelector("#manage-container-link");
    Utils.addEnterHandler(manageContainer, async () => {
      Logic.showPanel(P_CONTAINER_EDIT, identity);
    });
    return this.buildOpenTabTable(tabs);
  },

  intializeShowHide(identity) {
    const hideContEl = document.querySelector("#hideorshow-container");
    if (identity.numberOfOpenTabs === 0 && !identity.hasHiddenTabs) {
      return Logic._disableMenuItem("No tabs available for this container",  hideContEl);
    } else {
      Logic._enableMenuItems(hideContEl);
    }

    Utils.addEnterHandler(hideContEl, async () => {
      try {
        browser.runtime.sendMessage({
          method: identity.hasHiddenTabs ? "showTabs" : "hideTabs",
          windowId: browser.windows.WINDOW_ID_CURRENT,
          cookieStoreId: Logic.currentCookieStoreId()
        });
        window.close();
      } catch (e) {
        window.close();
      }
    });

    const hideShowIcon = document.getElementById("container-info-hideorshow-icon");
    hideShowIcon.src = identity.hasHiddenTabs ? CONTAINER_UNHIDE_SRC : CONTAINER_HIDE_SRC;

    const hideShowLabel = document.getElementById("container-info-hideorshow-label");
    hideShowLabel.textContent = browser.i18n.getMessage(identity.hasHiddenTabs ? "showThisContainer" : "hideThisContainer");
    return;
  },

  buildOpenTabTable(tabs) {
    // Let's remove all the previous tabs.
    const table = document.getElementById("container-info-table");
    while (table.firstChild) {
      table.firstChild.remove();
    }

    // For each one, let's create a new line.
    const fragment = document.createDocumentFragment();
    for (let tab of tabs) { // eslint-disable-line prefer-const
      const tr = document.createElement("tr");
      fragment.appendChild(tr);
      tr.classList.add("menu-item", "hover-highlight", "keyboard-nav");
      tr.setAttribute("tabindex", "0");
      tr.innerHTML = Utils.escaped`
        <td>
          <div class="favicon"></div>
          <span title="${tab.url}" class="menu-text truncate-text">${tab.title}</span>
          <img id="${tab.id}" class="trash-button" src="/img/close.svg" />
        </td>`;
      tr.querySelector(".favicon").appendChild(Utils.createFavIconElement(tab.favIconUrl));
      tr.setAttribute("tabindex", "0");
      table.appendChild(fragment);

      // On click, we activate this tab. But only if this tab is active.
      if (!tab.hiddenState) {
        Utils.addEnterHandler(tr, async () => {
          await browser.tabs.update(tab.id, { active: true });
          window.close();
        });

        const closeTab = tr.querySelector(".trash-button");
        if (closeTab) {
          Utils.addEnterHandler(closeTab, async (e) => {
            await browser.tabs.remove(Number(e.target.id));
            window.close();
          });
        }
      }
    }
  },
});

// OPEN_NEW_CONTAINER_PICKER: Opens a new container tab.
// ----------------------------------------------------------------------------

Logic.registerPanel(OPEN_NEW_CONTAINER_PICKER, {
  panelSelector: "#container-picker-panel",

  // This method is called when the object is registered.
  initialize() {
  },

  // This method is called when the panel is shown.
  prepare() {
    Logic.listenToPickerBackButton();
    document.getElementById("picker-title").textContent = browser.i18n.getMessage("openANewTabIn");
    const fragment = document.createDocumentFragment();
    const pickedFunction = function (identity) {
      try {
        browser.tabs.create({
          cookieStoreId: identity.cookieStoreId
        });
        window.close();
      } catch (e) {
        window.close();
      }
    };

    document.getElementById("new-container-div").innerHTML = "";

    Logic.identities().forEach(identity => {
      const tr = document.createElement("tr");
      tr.classList.add("menu-item", "hover-highlight", "keyboard-nav");
      tr.setAttribute("tabindex", "0");
      const td = document.createElement("td");

      td.innerHTML = Utils.escaped`
        <div class="menu-icon">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <span class="menu-text">${identity.name}</span>`;

      fragment.appendChild(tr);

      tr.appendChild(td);

      Utils.addEnterHandler(tr, () => {
        pickedFunction(identity);
      });

    });

    const list = document.querySelector("#picker-identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    return Promise.resolve(null);
  }
});

// MANAGE_CONTAINERS_PICKER: Makes the list editable.
// ----------------------------------------------------------------------------

Logic.registerPanel(MANAGE_CONTAINERS_PICKER, {
  panelSelector: "#container-picker-panel",

  // This method is called when the object is registered.
  initialize() {
  },

  // This method is called when the panel is shown.
  async prepare() {
    Logic.listenToPickerBackButton();
    const closeContEl = document.querySelector("#close-container-picker-panel");
    if (!this._listenerSet) {
      Utils.addEnterHandler(closeContEl, () => {
        Logic.showPanel(P_CONTAINERS_LIST);
      });
      this._listenerSet = true;
    }
    document.getElementById("picker-title").textContent = browser.i18n.getMessage("manageContainers");
    const fragment = document.createDocumentFragment();
    const pickedFunction = function (identity) {
      Logic.showPanel(P_CONTAINER_EDIT, identity);
    };

    document.getElementById("new-container-div").innerHTML = Utils.escaped`
      <table class="menu">
        <tr class="menu-item hover-highlight keyboard-nav" id="new-container" tabindex="0">
          <td>
            <div class="menu-icon"><img src="/img/new-16.svg" />
            </div>
            <span class="menu-text">${ browser.i18n.getMessage("newContainer") }</span>
          </td>
        </tr>
      </table>
      <hr>
    `;

    Utils.addEnterHandler(document.querySelector("#new-container"), () => {
      Logic.showPanel(P_CONTAINER_EDIT, { name: Logic.generateIdentityName() });
    });

    const identities = Logic.identities();

    for (const identity of identities) {
      const tr = document.createElement("tr");
      tr.classList.add("menu-item", "hover-highlight", "keyboard-nav");
      tr.setAttribute("tabindex", "0");
      tr.setAttribute("data-cookie-store-id", identity.cookieStoreId);

      const td = document.createElement("td");

      td.innerHTML = Utils.escaped`
        <div class="menu-icon hover-highlight">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <span class="menu-text">${identity.name}</span>
        <img alt="" class="flag-img manage-containers-list-flag" src="/img/flags/.png"/>
        <span class="move-button">
          <img
            class="pop-button-image"
            src="/img/container-move.svg"
          />
        </span>`;

      fragment.appendChild(tr);

      tr.appendChild(td);

      tr.draggable = true;
      tr.dataset.containerId = identity.cookieStoreId;
      tr.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(CONTAINER_DRAG_DATA_TYPE, identity.cookieStoreId);
      });
      tr.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes(CONTAINER_DRAG_DATA_TYPE)) {
          tr.classList.add("drag-over");
          e.preventDefault();
        }
      });
      tr.addEventListener("dragenter", (e) => {
        if (e.dataTransfer.types.includes(CONTAINER_DRAG_DATA_TYPE)) {
          e.preventDefault();
          tr.classList.add("drag-over");
        }
      });
      tr.addEventListener("dragleave", (e) => {
        if (e.dataTransfer.types.includes(CONTAINER_DRAG_DATA_TYPE)) {
          e.preventDefault();
          tr.classList.remove("drag-over");
        }
      });
      tr.addEventListener("drop", async (e) => {
        e.preventDefault();
        const parent = tr.parentNode;
        const containerId = e.dataTransfer.getData(CONTAINER_DRAG_DATA_TYPE);
        let droppedElement;
        parent.childNodes.forEach((node) => {
          if (node.dataset.containerId === containerId) {
            droppedElement = node;
          }
        });
        if (droppedElement && droppedElement !== tr) {
          tr.classList.remove("drag-over");
          parent.insertBefore(droppedElement, tr);
          await Logic.saveContainerOrder(parent.childNodes);
          await Logic.refreshIdentities();
        }
      });

      Utils.addEnterHandler(tr, () => {
        pickedFunction(identity);
      });
    }

    const list = document.querySelector("#picker-identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    MozillaVPN.handleContainerList(identities);

    return Promise.resolve();
  }
});

// REOPEN_IN_CONTAINER_PICKER: Makes the list editable.
// ----------------------------------------------------------------------------

Logic.registerPanel(REOPEN_IN_CONTAINER_PICKER, {
  panelSelector: "#container-picker-panel",

  // This method is called when the object is registered.
  initialize() {
  },

  // This method is called when the panel is shown.
  async prepare() {
    Logic.listenToPickerBackButton();
    document.getElementById("picker-title").textContent = browser.i18n.getMessage("reopenThisSiteIn");
    const fragment = document.createDocumentFragment();
    const currentTab = await Utils.currentTab();
    const pickedFunction = function (identity) {
      const newUserContextId = Utils.userContextId(identity.cookieStoreId);
      Utils.reloadInContainer(
        currentTab.url,
        false,
        newUserContextId,
        currentTab.index + 1,
        currentTab.active
      );
      window.close();
    };

    document.getElementById("new-container-div").innerHTML = "";

    if (currentTab.cookieStoreId !== "firefox-default") {
      const tr = document.createElement("tr");
      tr.classList.add("menu-item", "hover-highlight", "keyboard-nav");
      const td = document.createElement("td");

      td.innerHTML = Utils.escaped`
        <div class="menu-icon hover-highlight">
          <div class="mac-icon">
          </div>
        </div>
        <span class="menu-text">Default Container</span>`;

      fragment.appendChild(tr);

      tr.appendChild(td);

      Utils.addEnterHandler(tr, () => {
        Utils.reloadInContainer(
          currentTab.url,
          false,
          0,
          currentTab.index + 1,
          currentTab.active
        );
        window.close();
      });
    }

    Logic.identities().forEach(identity => {
      if (currentTab.cookieStoreId !== identity.cookieStoreId) {
        const tr = document.createElement("tr");
        tr.classList.add("menu-item", "hover-highlight", "keyboard-nav");
        tr.setAttribute("tabindex", "0");
        const td = document.createElement("td");

        td.innerHTML = Utils.escaped`
        <div class="menu-icon hover-highlight">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <span class="menu-text">${identity.name}</span>`;

        fragment.appendChild(tr);

        tr.appendChild(td);

        Utils.addEnterHandler(tr, () => {
          pickedFunction(identity);
        });
      }
    });

    const list = document.querySelector("#picker-identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    return Promise.resolve(null);
  }
});

// ALWAYS_OPEN_IN_PICKER: Makes the list editable.
// ----------------------------------------------------------------------------

Logic.registerPanel(ALWAYS_OPEN_IN_PICKER, {
  panelSelector: "#container-picker-panel",

  // This method is called when the object is registered.
  initialize() {
  },

  // This method is called when the panel is shown.
  async prepare() {
    const identities = Logic.identities();
    Logic.listenToPickerBackButton();
    document.getElementById("picker-title").textContent = browser.i18n.getMessage("alwaysOpenIn");
    const fragment = document.createDocumentFragment();

    document.getElementById("new-container-div").innerHTML = "";

    for (const identity of identities) {
      const tr = document.createElement("tr");
      tr.classList.add("menu-item", "hover-highlight", "keyboard-nav");
      tr.setAttribute("tabindex", "0");
      const td = document.createElement("td");

      td.innerHTML = Utils.escaped`
        <div class="menu-icon hover-highlight">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <span class="menu-text">${identity.name}</span>
        `;

      fragment.appendChild(tr);

      tr.appendChild(td);

      Utils.addEnterHandler(tr, () => {
        Utils.alwaysOpenInContainer(identity);
        window.close();
      });
    }

    const list = document.querySelector("#picker-identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    return Promise.resolve(null);
  }
});

// P_CONTAINER_ASSIGNMENTS: Shows Site Assignments and allows editing.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_ASSIGNMENTS, {
  panelSelector: "#edit-container-assignments",

  // This method is called when the object is registered.
  initialize() {  },

  // This method is called when the panel is shown.
  async prepare() {
    const identity = Logic.currentIdentity();

    // Populating the panel: name and icon
    document.getElementById("edit-assignments-title").textContent = identity.name;

    const userContextId = Logic.currentUserContextId();
    const assignments = await Logic.getAssignmentObjectByContainer(userContextId);
    this.showAssignedContainers(assignments);

    return Promise.resolve(null);
  },

  showAssignedContainers(assignments) {
    const closeContEl = document.querySelector("#close-container-assignment-panel");
    Utils.addEnterHandler(closeContEl, () => {
      const identity = Logic.currentIdentity();
      Logic.showPanel(P_CONTAINER_EDIT, identity, false, false);
    });

    const assignmentPanel = document.getElementById("edit-sites-assigned");
    const assignmentKeys = Object.keys(assignments);
    assignmentPanel.hidden = !(assignmentKeys.length > 0);
    if (assignments) {
      const tableElement = document.querySelector("#edit-sites-assigned");
      /* Remove previous assignment list,
         after removing one we rerender the list */
      while (tableElement.firstChild) {
        tableElement.firstChild.remove();
      }
      assignmentKeys.forEach((siteKey) => {
        const site = assignments[siteKey];
        const trElement = document.createElement("tr");
        /* As we don't have the full or correct path the best we can assume is the path is HTTPS and then replace with a broken icon later if it doesn't load.
           This is pending a better solution for favicons from web extensions */
        const assumedUrl = `https://${site.hostname}/favicon.ico`;
        trElement.innerHTML = Utils.escaped`
        <td>
          <div class="favicon"></div>
          <span title="${site.hostname}" class="menu-text">${site.hostname}</span>
          <img class="trash-button delete-assignment" src="/img/container-delete.svg" />
        </td>`;
        trElement.getElementsByClassName("favicon")[0].appendChild(Utils.createFavIconElement(assumedUrl));
        const deleteButton = trElement.querySelector(".trash-button");
        Utils.addEnterHandler(deleteButton, async () => {
          const userContextId = Logic.currentUserContextId();
          // Lets show the message to the current tab
          // const currentTab = await Utils.currentTab();
          Utils.setOrRemoveAssignment(false, assumedUrl, userContextId, true);
          delete assignments[siteKey];
          this.showAssignedContainers(assignments);
        });
        trElement.classList.add("menu-item", "hover-highlight", "keyboard-nav");
        tableElement.appendChild(trElement);
      });
    }
  },
});

// P_CONTAINER_EDIT: Editor for a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_EDIT, {
  panelSelector: "#edit-container-panel",

  // This method is called when the object is registered.
  async initialize() {
    this.initializeRadioButtons();

    await browser.runtime.sendMessage({ method: "MozillaVPN_queryServers" });
    await browser.runtime.sendMessage({ method: "MozillaVPN_queryStatus" });

    class MozVpnContainerUi extends HTMLElement {
      constructor() {
        super();

        this.subtitle = this.querySelector(".moz-vpn-subtitle");
        this.collapsibleContent = this.querySelector(".collapsible-content");

        this.visibilityTogglers = this.querySelectorAll(".hide-show-label");
        this.hideShowButton = this.querySelector(".expand-collapse");
        this.primaryCta = this.querySelector("#get-mozilla-vpn");
        this.advancedProxySettingsButton = document.querySelector(".advanced-proxy-settings-btn");
        this.toutName = "moz-tout-edit-container-panel";

        // Switch
        this.switch = this.querySelector("#moz-vpn-switch");
        this.switchLabel = this.querySelector(".switch");

        // Current server button
        this.currentServerButton = this.querySelector("#moz-vpn-current-server");
        this.currentCityName = this.querySelector(".current-city-name");
        this.currentCountryFlag = this.querySelector(".current-country-flag");
        this.currentCountryCode;

        // Proxy inputs + viewer
        this.advancedProxyAddress = document.getElementById("advanced-proxy-address");
        this.proxyAddressInput = document.querySelector("#edit-container-panel-proxy");
        this.cityNameInput = document.getElementById("city-name-input");
        this.countryCodeInput = document.getElementById("country-code-input");
        this.mozProxyEnabledInput = document.getElementById("moz-proxy-enabled");
      }

      async connectedCallback() {
        const { mozillaVpnHiddenToutsList } = await browser.storage.local.get("mozillaVpnHiddenToutsList");
        const mozillaVpnCollapseEditContainerTout = mozillaVpnHiddenToutsList && mozillaVpnHiddenToutsList.find(tout => tout.name === this.toutName);
        const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });

        this.hideShowButton.addEventListener("click", this);

        if (mozillaVpnCollapseEditContainerTout && !mozillaVpnInstalled) {
          this.collapseUi();
        }

        // Add listeners
        if (!this.classList.contains("has-attached-listeners")) {

          const bothMozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();
          this.primaryCta.addEventListener("click", async() => {
            if (!bothMozillaVpnPermissionsEnabled && mozillaVpnInstalled) {
              return await browser.permissions.request({ permissions: ["proxy", "nativeMessaging"] });
            }
            MozillaVPN.handleMozillaCtaClick("mac-edit-container-panel-btn");
          });

          this.switch.addEventListener("click", async() => {
            const { mozillaVpnServers } = await browser.storage.local.get("mozillaVpnServers");
            const id = Logic.currentIdentity();
            this.enableDisableProxyButtons();

            if (!this.switch.checked) {
              const deactivatedMozProxy = MozillaVPN.getProxy(
                this.countryCodeInput.value,
                this.cityNameInput.value,
                undefined,
                mozillaVpnServers
              );

              if (!deactivatedMozProxy) {
                return;
              }

              await proxifiedContainers.set(id.cookieStoreId, deactivatedMozProxy);
              this.switch.checked = false;
              return;
            }
            let proxy;

            if (this.countryCodeInput.value.length === 2) {
              // User is re-enabling a Mozilla proxy for this container.
              // Use the stored location information to select a server
              // in the same location.
              proxy = MozillaVPN.getProxy(
                this.countryCodeInput.value,
                this.cityNameInput.value,
                true,
                mozillaVpnServers
              );

            } else {
              // No saved Mozilla VPN proxy information. Get something new.
              const { randomServerCountryCode, randomServerCityName } = await MozillaVPN.pickRandomLocation();

              proxy = MozillaVPN.getProxy(
                randomServerCountryCode,
                randomServerCityName,
                true,
                mozillaVpnServers
              );
            }

            if (proxy) {
              await proxifiedContainers.set(id.cookieStoreId, proxy);
              this.switch.checked = true;
              this.updateProxyDependentUi(proxy);
            } else {
              this.switch.checked = false;
              return;
            }
          });
        }

        this.classList.add("has-attached-listeners");
        this.currentServerButton.classList.add("hidden");
      }

      async updateMozVpnStatusDependentUi() {
        const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });
        const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });

        this.subtitle.textContent = browser.i18n.getMessage("integrateContainers");

        const bothMozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();

        if (mozillaVpnInstalled && !bothMozillaVpnPermissionsEnabled) {
          this.subtitle.style.flex = "1 1 100%";
          this.subtitle.textContent = browser.i18n.getMessage("additionalPermissionNeeded");
          this.hideEls(this.hideShowButton, this.switch, this.switchLabel);
          this.primaryCta.textContent = "Enable";
          return;
        }

        if (mozillaVpnInstalled) {
          // Hide cta and hide/show button
          this.hideEls(this.primaryCta, this.hideShowButton);

          // Update subtitle
          this.subtitle.textContent = mozillaVpnConnected ? browser.i18n.getMessage("useCustomLocation") : browser.i18n.getMessage("mozillaVpnMustBeOn");
        }

        if (mozillaVpnConnected) {
          [this.switchLabel, this.switch].forEach(el => {
            el.style.display = "inline-block";
          });
        } else {
          this.hideEls(this.switch, this.switchLabel, this.currentServerButton);
          this.switch.checked = false;
        }

        if ((mozillaVpnInstalled && !mozillaVpnConnected) || mozillaVpnConnected) {
          this.expandUi();
        }
      }


      async enableDisableProxyButtons() {
        const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });

        if (!this.switch.checked || this.switch.disabled || !mozillaVpnConnected) {
          this.currentServerButton.disabled = true;
          this.advancedProxySettingsButton.disabled = false;
          document.getElementById("moz-proxy-enabled").value = undefined;
          return;
        }

        this.currentServerButton.disabled = false;
        this.advancedProxySettingsButton.disabled = true;
        this.advancedProxyAddress.textContent = "";
      }

      updateProxyInputs(proxyInfo) {
        const resetProxyStorageEls = () => {
          [this.proxyAddressInput, this.cityNameInput, this.countryCodeInput, this.mozProxyEnabledInput].forEach(el => {
            el.value = "";

          });
          this.advancedProxyAddress.textContent = "";
        };

        resetProxyStorageEls();

        if (typeof(proxyInfo) === "undefined" || typeof(proxyInfo.type) === "undefined") {
          // no custom proxy is set
          return;
        }

        this.cityNameInput.value = proxyInfo.cityName;
        this.countryCodeInput.value = proxyInfo.countryCode;
        this.mozProxyEnabledInput.value = proxyInfo.mozProxyEnabled;
        this.proxyAddressInput.value = `${proxyInfo.type}://${proxyInfo.host}:${proxyInfo.port}`;

        if (typeof(proxyInfo.countryCode) === "undefined" && proxyInfo.type) {
          // Set custom proxy URL below 'Advanced proxy settings' button label
          this.advancedProxyAddress.textContent = `${proxyInfo.type}://${proxyInfo.host}:${proxyInfo.port}`;
        }
      }

      async updateProxyDependentUi(proxyInfo) {
        const mozillaVpnProxyLocationAvailable = (proxy) => {
          return typeof(proxy) !== "undefined" && typeof(proxy.countryCode) !== "undefined" && typeof(proxy.cityName) !== "undefined";
        };

        const mozillaVpnProxyIsEnabled = (proxy) => {
          return typeof(proxy) !== "undefined" && typeof(proxy.mozProxyEnabled) !== "undefined" && proxy.mozProxyEnabled === true;
        };

        this.switch.checked = mozillaVpnProxyIsEnabled(proxyInfo);
        this.updateProxyInputs(proxyInfo);
        this.enableDisableProxyButtons();

        const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
        if (
          !proxyInfo ||
          !mozillaVpnProxyLocationAvailable(proxyInfo) ||
          !mozillaVpnConnected
        ) {
          // Hide server location button
          this.currentServerButton.classList.add("hidden");
          this.classList.remove("show-server-button");
        } else {
          // Unhide server location button
          this.currentServerButton.style.display = "flex";
          this.currentServerButton.classList.remove("hidden");
          this.classList.add("show-server-button");
        }

        // Populate inputs and server button with current or previously stored mozilla vpn proxy
        if(proxyInfo && mozillaVpnProxyLocationAvailable(proxyInfo)) {
          this.currentCountryFlag.style.backgroundImage = `url("./img/flags/${proxyInfo.countryCode.toUpperCase()}.png")`;
          this.currentCountryFlag.style.backgroundImage = proxyInfo.countryCode + ".png";
          this.currentCityName.textContent = proxyInfo.cityName;
          this.countryCode = proxyInfo.countryCode;
        }
        return;
      }

      expandUi() {
        this.classList.add("expanded");
      }

      collapseUi() {
        this.classList.remove("expanded");
      }

      hideEls(...els) {
        els.forEach(el => {
          el.style.display = "none";
        });
      }

      async handleEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "keyup" && e.key !== " ") {
          return;
        }
        this.classList.toggle("expanded");

        const { mozillaVpnHiddenToutsList } = await browser.storage.local.get("mozillaVpnHiddenToutsList");
        if (typeof(mozillaVpnHiddenToutsList) === "undefined") {
          await browser.storage.local.set({ "mozillaVpnHiddenToutsList":[] });
        }

        const toutIndex = mozillaVpnHiddenToutsList.findIndex(tout => tout.name === mozillaVpnUi.toutName);
        if (toutIndex === -1) {
          mozillaVpnHiddenToutsList.push({ name: mozillaVpnUi.toutName });
        } else {
          this.expandUi();
          mozillaVpnHiddenToutsList.splice(toutIndex, 1);
        }
        return await browser.storage.local.set({ mozillaVpnHiddenToutsList });
      }

    }

    customElements.define("moz-vpn-container-ui", MozVpnContainerUi);
    const mozillaVpnUi = document.querySelector("moz-vpn-container-ui");
    mozillaVpnUi.updateMozVpnStatusDependentUi();
    const advancedProxySettingsButton = document.querySelector(".advanced-proxy-settings-btn");
    Utils.addEnterHandler(advancedProxySettingsButton, () => {
      Logic.showPanel(P_ADVANCED_PROXY_SETTINGS, this.getEditInProgressIdentity(), false, false);
    });

    const serverListButton = document.getElementById("moz-vpn-current-server");
    Utils.addEnterHandler(serverListButton, () => {
      const mozVpnEnabled = document.querySelector("#moz-vpn-switch").checked;
      if (!mozVpnEnabled) {
        return;
      }
      Logic.showPanel(P_MOZILLA_VPN_SERVER_LIST, this.getEditInProgressIdentity(), false);
    });

    Utils.addEnterHandler(document.querySelector("#close-container-edit-panel"), () => {
      // Resets listener from siteIsolation checkbox to keep the update queue to 0.
      const siteIsolation = document.querySelector("#site-isolation");
      siteIsolation.removeEventListener("change", addRemoveSiteIsolation, false);
      const formValues = new FormData(this._editForm);
      if (formValues.get("container-id") !== NEW_CONTAINER_ID) {
        this._submitForm();
      } else {
        Logic.showPreviousPanel();
      }
    });

    this._editForm = document.getElementById("edit-container-panel-form");
    this._editForm.addEventListener("submit", () => {
      this._submitForm();
    });
    Utils.addEnterHandler(document.querySelector("#create-container-cancel-link"), () => {
      Logic.showPanel(MANAGE_CONTAINERS_PICKER);
    });

    Utils.addEnterHandler(document.querySelector("#create-container-ok-link"), () => {
      this._submitForm();
    });
  },

  async _submitForm() {
    const formValues = new FormData(this._editForm);

    try {
      await browser.runtime.sendMessage({
        method: "createOrUpdateContainer",
        message: {
          userContextId: formValues.get("container-id") || NEW_CONTAINER_ID,
          params: {
            name: document.getElementById("edit-container-panel-name-input").value || Logic.generateIdentityName(),
            icon: formValues.get("container-icon") || DEFAULT_ICON,
            color: formValues.get("container-color") || DEFAULT_COLOR
          },
        }
      });
      await Logic.refreshIdentities();
      Logic.showPreviousPanel();
    } catch (e) {
      Logic.showPreviousPanel();
    }
  },

  openServerList() {
    const updatedIdentity = this.getEditInProgressIdentity();
    Logic.showPanel(P_MOZILLA_VPN_SERVER_LIST, updatedIdentity, false);
  },

  // This prevents identity edits (change of icon, color, etc)
  // from getting lost when navigating to and from one
  // of the edit sub-pages (advanced proxy settings, for instance).
  getEditInProgressIdentity() {
    const formValues = new FormData(this._editForm);
    const editedIdentity = Logic.currentIdentity();

    editedIdentity.color = formValues.get("container-color") || DEFAULT_COLOR;
    editedIdentity.icon = formValues.get("container-icon") || DEFAULT_ICON;
    editedIdentity.name = document.getElementById("edit-container-panel-name-input").value || Logic.generateIdentityName();
    return editedIdentity;
  },

  initializeRadioButtons() {
    const colorRadioTemplate = (containerColor) => {
      return Utils.escaped`<input type="radio" value="${containerColor}" name="container-color" id="edit-container-panel-choose-color-${containerColor}" />
     <label for="edit-container-panel-choose-color-${containerColor}" class="usercontext-icon choose-color-icon" data-identity-icon="circle" data-identity-color="${containerColor}">`;
    };
    const colors = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];
    const colorRadioFieldset = document.getElementById("edit-container-panel-choose-color");
    colors.forEach((containerColor) => {
      const templateInstance = document.createElement("div");
      templateInstance.classList.add("radio-container");
      // eslint-disable-next-line no-unsanitized/property
      templateInstance.innerHTML = colorRadioTemplate(containerColor);
      colorRadioFieldset.appendChild(templateInstance);
    });

    const iconRadioTemplate = (containerIcon) => {
      return Utils.escaped`<input type="radio" value="${containerIcon}" name="container-icon" id="edit-container-panel-choose-icon-${containerIcon}" />
     <label for="edit-container-panel-choose-icon-${containerIcon}" class="usercontext-icon choose-color-icon" data-identity-color="grey" data-identity-icon="${containerIcon}">`;
    };
    const icons = ["fingerprint", "briefcase", "dollar", "cart", "vacation", "gift", "food", "fruit", "pet", "tree", "chill", "circle", "fence"];
    const iconRadioFieldset = document.getElementById("edit-container-panel-choose-icon");
    icons.forEach((containerIcon) => {
      const templateInstance = document.createElement("div");
      templateInstance.classList.add("radio-container");
      // eslint-disable-next-line no-unsanitized/property
      templateInstance.innerHTML = iconRadioTemplate(containerIcon);
      iconRadioFieldset.appendChild(templateInstance);
    });
  },

  // This method is called when the panel is shown.
  async prepare() {
    browser.runtime.sendMessage({ method: "MozillaVPN_queryServers" });
    browser.runtime.sendMessage({ method: "MozillaVPN_queryStatus" });

    const identity = Logic.currentIdentity();

    // Populating the panel: name and icon
    document.getElementById("container-edit-title").textContent = identity.name;

    const userContextId = Logic.currentUserContextId();
    document.querySelector("#edit-container-panel .panel-footer").hidden = !!userContextId;
    document.querySelector("#edit-container-panel .delete-container").hidden = !userContextId;
    document.querySelector("#edit-container-options").hidden = !userContextId;
    document.querySelector("moz-vpn-container-ui").hidden = !userContextId;
    document.querySelector("#advanced-proxy-settings-btn").hidden = !userContextId;

    Utils.addEnterHandler(document.querySelector("#manage-assigned-sites-list"), () => {
      Logic.showPanel(P_CONTAINER_ASSIGNMENTS, this.getEditInProgressIdentity(), false, false);
    });

    document.querySelector("#edit-container-panel-name-input").value = identity.name || "";
    document.querySelector("#edit-container-panel-usercontext-input").value = userContextId || NEW_CONTAINER_ID;
    const containerName = document.querySelector("#edit-container-panel-name-input");
    window.requestAnimationFrame(() => {
      containerName.select();
      containerName.focus();
    });

    const siteIsolation = document.querySelector("#site-isolation");
    siteIsolation.checked = !!identity.isIsolated;
    siteIsolation.addEventListener( "change", addRemoveSiteIsolation, false);
    [...document.querySelectorAll("[name='container-color']")].forEach(colorInput => {
      colorInput.checked = colorInput.value === identity.color;
    });
    [...document.querySelectorAll("[name='container-icon']")].forEach(iconInput => {
      iconInput.checked = iconInput.value === identity.icon;
    });

    const deleteButton = document.getElementById("delete-container-button");
    Utils.addEnterHandler(deleteButton, () => {
      Logic.showPanel(P_CONTAINER_DELETE, this.getEditInProgressIdentity(), false, false);
    });
    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });


    const mozillaVpnUi = document.querySelector(".moz-vpn-controller-content");
    mozillaVpnUi.updateMozVpnStatusDependentUi();

    if (!userContextId) {
      return;
    }

    const proxyPermissionEnabled = await browser.permissions.contains({ permissions: ["proxy"] });
    if (proxyPermissionEnabled) {
      const proxyData = await proxifiedContainers.retrieve(identity.cookieStoreId);
      if (proxyData && proxyData.proxy.mozProxyEnabled && !mozillaVpnConnected) {
        return;
      }
      const proxy = proxyData ? proxyData.proxy : {};
      mozillaVpnUi.updateProxyDependentUi(proxy);
    }
  },
});

Logic.registerPanel(P_ADVANCED_PROXY_SETTINGS, {
  panelSelector: "#advanced-proxy-settings-panel",

  async initialize() {
    this._proxyForm = document.querySelector(".advanced-proxy-panel-content");
    this._advancedProxyInput = this._proxyForm.querySelector("#edit-advanced-proxy-input");
    const clearAdvancedProxyInput = this._proxyForm.querySelector("#clear-advanced-proxy-input");
    this._submitadvancedProxy = this._proxyForm.querySelector("#submit-advanced-proxy");

    this._advancedProxyInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") {
        this.hideInvalidEntryWarning();
      }
    });

    this._submitadvancedProxy.addEventListener("click", (e) => {
      e.preventDefault();
      this.submitProxyForm();
    });

    clearAdvancedProxyInput.addEventListener("click", (e) => {
      e.preventDefault();

      const activeEl = document.activeElement;
      if (activeEl === this._advancedProxyInput) {
        return this.submitProxyForm();
      }
      if (activeEl !== clearAdvancedProxyInput) {
        return;
      }
      this.hideInvalidEntryWarning();
      this._advancedProxyInput.value = "";
      this._advancedProxyInput.focus();
    });

    this._advancedProxyInput.addEventListener("blur", () => {
      if (this._advancedProxyInput.value.length === 0) {
        return;
      }
      if(!proxifiedContainers.parseProxy(this._advancedProxyInput.value)) {
        this.showInvalidEntryWarning();
      }
    });

    this._advancedProxyInput.addEventListener("focus", () => {
      this.hideInvalidEntryWarning();
    });

    const returnButton = document.getElementById("advanced-proxy-settings-return");
    Utils.addEnterHandler(returnButton, () => {
      return Logic.showPanel(P_CONTAINER_EDIT, Logic.currentIdentity(), false, false);
    });

    const learnMoreButton = document.getElementById("advanced-proxy-settings-learn-more");
    Utils.addEnterHandler(learnMoreButton, () => {
      browser.tabs.create({ url: "https://support.mozilla.org/kb/containers" });
    });
  },

  showInvalidEntryWarning() {
    this._proxyForm.classList.add("invalid");
  },

  hideInvalidEntryWarning() {
    this._proxyForm.classList.remove("invalid");
  },

  async submitProxyForm() {
    const parsedProxy = proxifiedContainers.parseProxy(this._advancedProxyInput.value);
    if (this._advancedProxyInput.value.length > 0 && !parsedProxy) {
      this.showInvalidEntryWarning();
      return;
    }
    const identity = Logic.currentIdentity();
    proxifiedContainers.set(identity.cookieStoreId, parsedProxy);

    Logic.showPanel(P_CONTAINER_EDIT, Logic.currentIdentity(), false, false);
  },

  async prepare() {
    const identity = Logic.currentIdentity();
    const advancedProxyInput = document.getElementById("edit-advanced-proxy-input");

    const proxyPermissionEnabled = await browser.permissions.contains({ permissions: ["proxy"] });
    if (!proxyPermissionEnabled) {

      // Restrict tabbing inside advanced proxy panel to proxy permissions ui
      const panel = document.getElementById("advanced-proxy-settings-panel");
      const clickableEls = panel.querySelectorAll("button, a, input");
      clickableEls.forEach(el => {
        if (!el.dataset.tabGroup && el.id !== "advanced-proxy-settings-return") {
          el.setAttribute("tabindex", "-1");
          el.disabled = true;
        }
      });

      // Show proxy permission overlay
      const permissionsOverlay = document.getElementById("permissions-overlay");
      permissionsOverlay.style.display = "flex";

      // Add "enable" button handling
      const enableProxyPermissionsButton = document.getElementById("enable-proxy-permissions");

      enableProxyPermissionsButton.addEventListener("click", async() => {
        const granted = await browser.permissions.request({ permissions: ["proxy"] });
        if (granted) {
          permissionsOverlay.style.display = "none";
          // restore normal panel tabbing
          clickableEls.forEach(el => {
            el.tabindex = "0";
            el.disabled = false;
          });
        }
      });
    }


    // reset input
    const resetProxyInput = () => {
      if (!advancedProxyInput) {
        return;
      }
      advancedProxyInput.value = "";
    };

    resetProxyInput();

    this.hideInvalidEntryWarning();

    const setProxyInputPlaceholder = (proxy) => {
      this._advancedProxyInput.value =  `${proxy.type}://${proxy.host}:${proxy.port}`;
    };

    const edit_proxy_dom = function(proxy) {
      if (!proxy.type || MozillaVPN.proxyIsDisabled(proxy)) {
        resetProxyInput();
        return;
      }
      return setProxyInputPlaceholder(proxy);
    };

    const proxyData = await proxifiedContainers.retrieve(identity.cookieStoreId);
    if (proxyData) {
      edit_proxy_dom(proxyData.proxy);
    } else {
      resetProxyInput();
    }
    const containerColor = document.querySelector(".proxy-title-container-color");
    containerColor.dataset.identityColor = identity.color;
    return Promise.resolve(null);
  }
});

Logic.registerPanel(P_MOZILLA_VPN_SERVER_LIST, {
  panelSelector: "#moz-vpn-server-list-panel",
  async initialize() {
    await browser.runtime.sendMessage({ method: "MozillaVPN_queryStatus" });
    await browser.runtime.sendMessage({ method: "MozillaVPN_queryServers" });

    Utils.addEnterHandler(document.getElementById("moz-vpn-return"), async () => {
      const identity = Logic.currentIdentity();
      Logic.showPanel(P_CONTAINER_EDIT, identity, false, false);
      Logic.showPreviousPanel();
    });
  },
  async makeServerList(mozillaVpnServers = []) {
    const listWrapper = document.getElementById("moz-vpn-server-list");

    mozillaVpnServers.forEach((serverCountry) => {
      const listItemTemplate = document.getElementById("server-list-item");
      const templateClone = listItemTemplate.content.cloneNode(true);
      const serverListItem = templateClone.querySelector(".server-list-item");
      serverListItem.dataset.countryCode = serverCountry.code;

      // Country name
      const serverCountryName = templateClone.querySelector(".server-country-name");
      serverCountryName.textContent = serverCountry.name;

      // Flag
      const serverCountryFlagImage = templateClone.querySelector(".server-country-flag");
      serverCountryFlagImage.src = `../img/flags/${serverCountry.code.toUpperCase()}.png`;

      const cityListVisibilityButton = templateClone.querySelector("button");

      cityListVisibilityButton.addEventListener("click", (e) => {
        const listItem = e.target.parentElement;
        this.toggleCityListVisibility(listItem);
      });

      // Make server city list
      const cityList = templateClone.querySelector("ul");
      const cityListTemplate = document.getElementById("server-city-list-items");

      serverCountry.cities.forEach(city => {
        const cityTemplateClone = cityListTemplate.content.cloneNode(true);

        const cityName = cityTemplateClone.querySelector(".server-city-name");

        // Server city radio inputs
        const radioBtn = cityTemplateClone.querySelector("input");
        radioBtn.dataset.countryCode = serverCountry.code;
        radioBtn.dataset.cityName = city.name;
        radioBtn.name = "server-city";

        const cityListItem = cityTemplateClone.querySelector(".server-city-list-item");
        Utils.addEnterHandler((cityListItem), async(e) => {
          if (e.key === "Enter") {
            radioBtn.checked = true;
          }
          const identity = Logic.currentIdentity();
          const proxy = MozillaVPN.getProxy(
            radioBtn.dataset.countryCode,
            radioBtn.dataset.cityName,
            true,
            mozillaVpnServers
          );
          await proxifiedContainers.set(identity.cookieStoreId, proxy);
        });

        // Set city name
        cityName.textContent = city.name;
        cityList.appendChild(cityTemplateClone);
      });
      listWrapper.appendChild(templateClone);
    });
  },


  toggleCityListVisibility(listItem) {
    const citiesList = listItem.querySelector("ul");
    listItem.classList.toggle("expanded");
    if (listItem.classList.contains("expanded")) {
      // Expand city list
      citiesList.style.height = citiesList.childElementCount * 48 + "px";
    } else {
      // Collapse city list
      citiesList.style.height = 0;
    }
    return;
  },

  async checkActiveServer(activeProxy) {
    document.querySelectorAll(".server-list-item").forEach(listItem => {
      if (listItem.dataset.countryCode === activeProxy.countryCode) {
        const currentCityRadioBtn = listItem.querySelector(`[data-city-name='${activeProxy.cityName}']`);
        currentCityRadioBtn.checked = true;
        if (!listItem.classList.contains("expanded")) {
          this.toggleCityListVisibility(listItem);
        }
        setTimeout(() => {
          currentCityRadioBtn.parentElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 100);
        return;

      } else {
        // Collapse previously expanded list items
        listItem.classList.remove("expanded");
        listItem.querySelector("ul").style.height = "0";
      }
    });
    return;
  },
  async prepare() {
    const { mozillaVpnServers } = await browser.storage.local.get("mozillaVpnServers");
    const identity = Logic.currentIdentity();

    const listWrapper = document.getElementById("moz-vpn-server-list");
    const chooseLocationTitle = document.getElementById("vpn-server-list-title");
    const titleClassList = chooseLocationTitle.classList;

    listWrapper.onscroll = () => {
      const titleHasShadow = titleClassList.contains("drop-shadow");
      if (listWrapper.scrollTop < 48 && titleHasShadow) {
        titleClassList.remove("drop-shadow");
      }
      if (!titleHasShadow && listWrapper.scrollTop > 48 ) {
        titleClassList.add("drop-shadow");
      }
    };

    if (document.querySelectorAll(".server-list-item").length < 2) {
      this.makeServerList(mozillaVpnServers);
    }

    const proxyData = await proxifiedContainers.retrieve(identity.cookieStoreId);
    if (proxyData) {
      this.checkActiveServer(proxyData.proxy);
    }
  }
});

// P_CONTAINER_DELETE: Delete a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_DELETE, {
  panelSelector: "#delete-container-panel",

  // This method is called when the object is registered.
  initialize() {
    Utils.addEnterHandler(document.querySelector("#delete-container-cancel-link"), () => {
      const identity = Logic.currentIdentity();
      Logic.showPanel(P_CONTAINER_EDIT, identity, false, false);
    });
    Utils.addEnterHandler(document.querySelector("#close-container-delete-panel"), () => {
      const identity = Logic.currentIdentity();
      Logic.showPanel(P_CONTAINER_EDIT, identity, false, false);
    });
    Utils.addEnterHandler(document.querySelector("#delete-container-ok-link"), async () => {

      /* Strip "containerEdit" and "containerInfo" panels out of previousPanelPath so that
       a user is not returned to either an edit, or info panel for a container
       that has been deleted and no longer exists.
      */
      while (
        Logic._previousPanelPath[Logic._previousPanelPath.length - 1] === "containerEdit" ||
        Logic._previousPanelPath[Logic._previousPanelPath.length - 1] === "containerInfo") {
        Logic._previousPanelPath.pop();
      }

      /* This promise wont resolve if the last tab was removed from the window.
          as the message async callback stops listening, this isn't an issue for us however it might be in future
          if you want to do anything post delete do it in the background script.
          Browser console currently warns about not listening also.
      */
      try {
        await Logic.removeIdentity(Utils.userContextId(Logic.currentIdentity().cookieStoreId));
        await Logic.refreshIdentities();
        Logic.showPreviousPanel();
      } catch (e) {
        Logic.showPreviousPanel();
      }
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const identity = Logic.currentIdentity();

    // Populating the panel: name, icon, and warning message
    document.getElementById("container-delete-title").textContent = identity.name;

    const totalNumberOfTabs = identity.numberOfHiddenTabs + identity.numberOfOpenTabs;
    let warningMessage = "";
    if (totalNumberOfTabs > 0) {
      const grammaticalNumTabs = totalNumberOfTabs > 1 ? "tabs" : "tab";
      warningMessage = `If you remove this container now, ${totalNumberOfTabs} container ${grammaticalNumTabs} will be closed.`;
    }
    document.getElementById("delete-container-tab-warning").textContent = warningMessage;

    return Promise.resolve(null);
  },
});

// P_CONTAINERS_ACHIEVEMENT: Page for achievement.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINERS_ACHIEVEMENT, {
  panelSelector: ".achievement-panel",

  // This method is called when the object is registered.
  initialize() {
    // Set done and move to the containers list panel.
    Utils.addEnterHandler(document.querySelector("#achievement-done-button"), async () => {
      await Logic.setAchievementDone("manyContainersOpened");
      Logic.showPanel(P_CONTAINERS_LIST);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

Logic.init();

window.addEventListener("resize", function () {
  //for overflow menu
  const difference = window.innerWidth - document.body.offsetWidth;
  if (difference > 2) {
    //if popup is in the overflow menu, window will be larger than 300px

    const root = document.documentElement;
    root.classList.add("overflow");
  }
});
