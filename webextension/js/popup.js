/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const CONTAINER_HIDE_SRC = "/img/container-hide.svg";
const CONTAINER_UNHIDE_SRC = "/img/container-unhide.svg";

const DEFAULT_COLOR = "blue";
const DEFAULT_ICON = "circle";

// List of panels
const P_ONBOARDING_1     = "onboarding1";
const P_ONBOARDING_2     = "onboarding2";
const P_ONBOARDING_3     = "onboarding3";
const P_ONBOARDING_4     = "onboarding4";
const P_CONTAINERS_LIST  = "containersList";
const P_CONTAINERS_EDIT  = "containersEdit";
const P_CONTAINER_INFO   = "containerInfo";
const P_CONTAINER_EDIT   = "containerEdit";
const P_CONTAINER_DELETE = "containerDelete";

/**
 * Escapes any occurances of &, ", <, > or / with XML entities.
 *
 * @param {string} str
 *        The string to escape.
 * @return {string} The escaped string.
 */
function escapeXML(str) {
  const replacements = {"&": "&amp;", "\"": "&quot;", "'": "&apos;", "<": "&lt;", ">": "&gt;", "/": "&#x2F;"};
  return String(str).replace(/[&"'<>/]/g, m => replacements[m]);
}

/**
 * A tagged template function which escapes any XML metacharacters in
 * interpolated values.
 *
 * @param {Array<string>} strings
 *        An array of literal strings extracted from the templates.
 * @param {Array} values
 *        An array of interpolated values extracted from the template.
 * @returns {string}
 *        The result of the escaped values interpolated with the literal
 *        strings.
 */
function escaped(strings, ...values) {
  const result = [];

  for (const [i, string] of strings.entries()) {
    result.push(string);
    if (i < values.length)
      result.push(escapeXML(values[i]));
  }

  return result.join("");
}

async function getExtensionInfo() {
  const manifestPath = browser.extension.getURL("manifest.json");
  const response = await fetch(manifestPath);
  const extensionInfo = await response.json();
  return extensionInfo;
}

// This object controls all the panels, identities and many other things.
const Logic = {
  _identities: [],
  _currentIdentity: null,
  _currentPanel: null,
  _previousPanel: null,
  _panels: {},

  init() {
    // Remove browserAction "upgraded" badge when opening panel
    this.clearBrowserActionBadge();

    // Retrieve the list of identities.
    this.refreshIdentities()

    // Routing to the correct panel.
    .then(() => {
      // If localStorage is disabled, we don't show the onboarding.
      if (!localStorage || localStorage.getItem("onboarded4")) {
        this.showPanel(P_CONTAINERS_LIST);
      } else if (localStorage.getItem("onboarded3")) {
        this.showPanel(P_ONBOARDING_4);
      } else if (localStorage.getItem("onboarded2")) {
        this.showPanel(P_ONBOARDING_3);
      } else if (localStorage.getItem("onboarded1")) {
        this.showPanel(P_ONBOARDING_2);
      } else {
        this.showPanel(P_ONBOARDING_1);
      }
    })

    .catch(() => {
      throw new Error("Failed to retrieve the identities. We cannot continue.");
    });
  },

  async clearBrowserActionBadge() {
    const extensionInfo = await getExtensionInfo();
    const storage = await browser.storage.local.get({browserActionBadgesClicked: []});
    browser.browserAction.setBadgeBackgroundColor({color: ""});
    browser.browserAction.setBadgeText({text: ""});
    storage.browserActionBadgesClicked.push(extensionInfo.version);
    browser.storage.local.set({browserActionBadgesClicked: storage.browserActionBadgesClicked});
  },

  async identity(cookieStoreId) {
    const identity = await browser.contextualIdentities.get(cookieStoreId);
    return identity || {
      name: "Default",
      cookieStoreId,
      icon: "default-tab",
      color: "default-tab"
    };
  },

  addEnterHandler(element, handler) {
    element.addEventListener("click", (e) => {
      handler(e);
    });
    element.addEventListener("keydown", (e) => {
      if (e.keyCode === 13) {
        handler(e);
      }
    });
  },

  userContextId(cookieStoreId = "") {
    const userContextId = cookieStoreId.replace("firefox-container-", "");
    return (userContextId !== cookieStoreId) ? Number(userContextId) : false;
  },

  async currentTab() {
    const activeTabs = await browser.tabs.query({active: true, windowId: browser.windows.WINDOW_ID_CURRENT});
    if (activeTabs.length > 0) {
      return activeTabs[0];
    }
    return false;
  },

  refreshIdentities() {
    return Promise.all([
      browser.contextualIdentities.query({}),
      browser.runtime.sendMessage({
        method: "queryIdentitiesState"
      })
    ]).then(([identities, state]) => {
      this._identities = identities.map((identity) => {
        const stateObject = state[Logic.userContextId(identity.cookieStoreId)];
        if (stateObject) {
          identity.hasOpenTabs = stateObject.hasOpenTabs;
          identity.hasHiddenTabs = stateObject.hasHiddenTabs;
        }
        return identity;
      });
    }).catch((e) => {throw e;});
  },

  async showPanel(panel, currentIdentity = null) {
    // Invalid panel... ?!?
    if (!(panel in this._panels)) {
      throw new Error("Something really bad happened. Unknown panel: " + panel);
    }

    this._previousPanel = this._currentPanel;
    this._currentPanel = panel;

    this._currentIdentity = currentIdentity;

    // Initialize the panel before showing it.
    await this._panels[panel].prepare();
    Object.keys(this._panels).forEach((panelKey) => {
      const panelItem = this._panels[panelKey];
      const panelElement = document.querySelector(panelItem.panelSelector);
      if (!panelElement.classList.contains("hide")) {
        panelElement.classList.add("hide");
        if ("unregister" in panelItem) {
          panelItem.unregister();
        }
      }
    });
    document.querySelector(this._panels[panel].panelSelector).classList.remove("hide");
  },

  showPreviousPanel() {
    if (!this._previousPanel) {
      throw new Error("Current panel not set!");
    }

    this.showPanel(this._previousPanel, this._currentIdentity);
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
    return Logic.userContextId(identity.cookieStoreId);
  },

  sendTelemetryPayload(message = {}) {
    if (!message.event) {
      throw new Error("Missing event name for telemetry");
    }
    message.method = "sendTelemetryPayload";
    browser.runtime.sendMessage(message);
  },

  removeIdentity(userContextId) {
    if (!userContextId) {
      return Promise.reject("removeIdentity must be called with userContextId argument.");
    }

    return browser.runtime.sendMessage({
      method: "deleteContainer",
      message: {userContextId}
    });
  },

  getAssignment(tab) {
    return browser.runtime.sendMessage({
      method: "getAssignment",
      tabId: tab.id
    });
  },

  getAssignmentObjectByContainer(userContextId) {
    return browser.runtime.sendMessage({
      method: "getAssignmentObjectByContainer",
      message: {userContextId}
    });
  },

  setOrRemoveAssignment(tabId, url, userContextId, value) {
    return browser.runtime.sendMessage({
      method: "setOrRemoveAssignment",
      tabId,
      url,
      userContextId,
      value
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
    for (let id = 1;; ++id) {
      if (ids.indexOf(id) === -1) {
        return defaultName + (id < 10 ? "0" : "") + id;
      }
    }
  },
};

// P_ONBOARDING_1: First page for Onboarding.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_ONBOARDING_1, {
  panelSelector: ".onboarding-panel-1",

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the next panel.
    Logic.addEnterHandler(document.querySelector("#onboarding-start-button"), () => {
      localStorage.setItem("onboarded1", true);
      Logic.showPanel(P_ONBOARDING_2);
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

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    Logic.addEnterHandler(document.querySelector("#onboarding-next-button"), () => {
      localStorage.setItem("onboarded2", true);
      Logic.showPanel(P_ONBOARDING_3);
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

  // This method is called when the object is registered.
  initialize() {
    // Let's move to the containers list panel.
    Logic.addEnterHandler(document.querySelector("#onboarding-almost-done-button"), () => {
      localStorage.setItem("onboarded3", true);
      Logic.showPanel(P_ONBOARDING_4);
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
    document.querySelector("#onboarding-done-button").addEventListener("click", () => {
      localStorage.setItem("onboarded4", true);
      Logic.showPanel(P_CONTAINERS_LIST);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    return Promise.resolve(null);
  },
});

// P_CONTAINERS_LIST: The list of containers. The main page.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINERS_LIST, {
  panelSelector: "#container-panel",

  // This method is called when the object is registered.
  initialize() {
    Logic.addEnterHandler(document.querySelector("#container-add-link"), () => {
      Logic.showPanel(P_CONTAINER_EDIT, { name: Logic.generateIdentityName() });
    });

    Logic.addEnterHandler(document.querySelector("#edit-containers-link"), () => {
      Logic.sendTelemetryPayload({
        event: "edit-containers"
      });
      Logic.showPanel(P_CONTAINERS_EDIT);
    });

    Logic.addEnterHandler(document.querySelector("#sort-containers-link"), () => {
      browser.runtime.sendMessage({
        method: "sortTabs"
      }).then(() => {
        window.close();
      }).catch(() => {
        window.close();
      });
    });

    document.addEventListener("keydown", (e) => {
      const element = document.activeElement;
      function next() {
        const nextElement = element.nextElementSibling;
        if (nextElement) {
          nextElement.querySelector("td[tabindex=0]").focus();
        }
      }
      function previous() {
        const previousElement = element.previousElementSibling;
        if (previousElement) {
          previousElement.querySelector("td[tabindex=0]").focus();
        }
      }
      switch (e.keyCode) {
      case 40:
        next();
        break;
      case 38:
        previous();
        break;
      }
    });

    // When the popup is open sometimes the tab will still be updating it's state
    this.tabUpdateHandler = (tabId, changeInfo) => {
      const propertiesToUpdate = ["title", "favIconUrl"];
      const hasChanged = Object.keys(changeInfo).find((changeInfoKey) => {
        if (propertiesToUpdate.includes(changeInfoKey)) {
          return true;
        }
      });
      if (hasChanged) {
        this.prepareCurrentTabHeader();
      }
    };
    browser.tabs.onUpdated.addListener(this.tabUpdateHandler);
  },

  unregister() {
    browser.tabs.onUpdated.removeListener(this.tabUpdateHandler);
  },

  setupAssignmentCheckbox(siteSettings) {
    const assignmentCheckboxElement = document.getElementById("container-page-assigned");
    // Cater for null and false
    assignmentCheckboxElement.checked = !!siteSettings;
    let disabled = false;
    if (siteSettings === false) {
      disabled = true;
    }
    assignmentCheckboxElement.disabled = disabled;
  },

  async prepareCurrentTabHeader() {
    const currentTab = await Logic.currentTab();
    const currentTabElement = document.getElementById("current-tab");
    const assignmentCheckboxElement = document.getElementById("container-page-assigned");
    assignmentCheckboxElement.addEventListener("change", () => {
      const userContextId = Logic.userContextId(currentTab.cookieStoreId);
      Logic.setOrRemoveAssignment(currentTab.id, currentTab.url, userContextId, !assignmentCheckboxElement.checked);
    });
    currentTabElement.hidden = !currentTab;
    this.setupAssignmentCheckbox(false);
    if (currentTab) {
      const identity = await Logic.identity(currentTab.cookieStoreId);
      const siteSettings = await Logic.getAssignment(currentTab);
      this.setupAssignmentCheckbox(siteSettings);
      const currentPage = document.getElementById("current-page");
      currentPage.innerHTML = escaped`<span class="page-title truncate-text">${currentTab.title}</span>`;
      const favIconElement = Utils.createFavIconElement(currentTab.favIconUrl || "");
      currentPage.prepend(favIconElement);

      const currentContainer = document.getElementById("current-container");
      currentContainer.innerText = identity.name;

      currentContainer.setAttribute("data-identity-color", identity.color);
    }
  },

  // This method is called when the panel is shown.
  async prepare() {
    const fragment = document.createDocumentFragment();

    this.prepareCurrentTabHeader();

    Logic.identities().forEach(identity => {
      const hasTabs = (identity.hasHiddenTabs || identity.hasOpenTabs);
      const tr = document.createElement("tr");
      const context = document.createElement("td");
      const manage = document.createElement("td");

      tr.classList.add("container-panel-row");

      context.classList.add("userContext-wrapper", "open-newtab", "clickable");
      manage.classList.add("show-tabs", "pop-button");
      context.setAttribute("tabindex", "0");
      context.innerHTML = escaped`
        <div class="userContext-icon-wrapper open-newtab">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <div class="container-name truncate-text"></div>`;
      context.querySelector(".container-name").textContent = identity.name;
      manage.innerHTML = "<img src='/img/container-arrow.svg' class='show-tabs pop-button-image-small' />";

      fragment.appendChild(tr);

      tr.appendChild(context);

      if (hasTabs) {
        tr.appendChild(manage);
      }

      Logic.addEnterHandler(tr, e => {
        if (e.target.matches(".open-newtab")
            || e.target.parentNode.matches(".open-newtab")
            || e.type === "keydown") {
          browser.runtime.sendMessage({
            method: "openTab",
            message: {
              userContextId: Logic.userContextId(identity.cookieStoreId),
              source: "pop-up"
            }
          }).then(() => {
            window.close();
          }).catch(() => {
            window.close();
          });
        } else if (hasTabs) {
          Logic.showPanel(P_CONTAINER_INFO, identity);
        }
      });
    });

    const list = document.querySelector(".identities-list tbody");

    list.innerHTML = "";
    list.appendChild(fragment);
    /* Not sure why extensions require a focus for the doorhanger,
       however it allows us to have a tabindex before the first selected item
     */
    const focusHandler = () => {
      list.querySelector("tr .clickable").focus();
      document.removeEventListener("focus", focusHandler);
    };
    document.addEventListener("focus", focusHandler);
    /* If the user mousedown's first then remove the focus handler */
    document.addEventListener("mousedown", () => {
      document.removeEventListener("focus", focusHandler);
    });

    return Promise.resolve();
  },
});

// P_CONTAINER_INFO: More info about a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_INFO, {
  panelSelector: "#container-info-panel",

  // This method is called when the object is registered.
  initialize() {
    Logic.addEnterHandler(document.querySelector("#close-container-info-panel"), () => {
      Logic.showPreviousPanel();
    });

    Logic.addEnterHandler(document.querySelector("#container-info-hideorshow"), () => {
      const identity = Logic.currentIdentity();
      browser.runtime.sendMessage({
        method: identity.hasHiddenTabs ? "showTabs" : "hideTabs",
        userContextId: Logic.currentUserContextId()
      }).then(() => {
        window.close();
      }).catch(() => {
        window.close();
      });
    });

    // Check if the user has incompatible add-ons installed
    browser.runtime.sendMessage({
      method: "checkIncompatibleAddons"
    }).then(incompatible => {
      const moveTabsEl = document.querySelector("#container-info-movetabs");
      if (incompatible) {
        const fragment = document.createDocumentFragment();
        const incompatEl = document.createElement("div");

        moveTabsEl.classList.remove("clickable");
        moveTabsEl.setAttribute("title", "Moving container tabs is incompatible with Pulse, PageShot, and SnoozeTabs.");

        fragment.appendChild(incompatEl);
        incompatEl.setAttribute("id", "container-info-movetabs-incompat");
        incompatEl.textContent = "Incompatible with other Experiments.";
        incompatEl.classList.add("container-info-tab-row");

        moveTabsEl.parentNode.insertBefore(fragment, moveTabsEl.nextSibling);
      } else {
        Logic.addEnterHandler(moveTabsEl, () => {
          browser.runtime.sendMessage({
            method: "moveTabsToWindow",
            userContextId: Logic.userContextId(Logic.currentIdentity().cookieStoreId),
          }).then(() => {
            window.close();
          }).catch((e) => { throw e; });
        });
      }
    }).catch(() => {
      throw new Error("Could not check for incompatible add-ons.");
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const identity = Logic.currentIdentity();

    // Populating the panel: name and icon
    document.getElementById("container-info-name").textContent = identity.name;

    const icon = document.getElementById("container-info-icon");
    icon.setAttribute("data-identity-icon", identity.icon);
    icon.setAttribute("data-identity-color", identity.color);

    // Show or not the has-tabs section.
    for (let trHasTabs of document.getElementsByClassName("container-info-has-tabs")) { // eslint-disable-line prefer-const
      trHasTabs.style.display = !identity.hasHiddenTabs && !identity.hasOpenTabs ? "none" : "";
    }

    const hideShowIcon = document.getElementById("container-info-hideorshow-icon");
    hideShowIcon.src = identity.hasHiddenTabs ? CONTAINER_UNHIDE_SRC : CONTAINER_HIDE_SRC;

    const hideShowLabel = document.getElementById("container-info-hideorshow-label");
    hideShowLabel.textContent = identity.hasHiddenTabs ? "Show this container" : "Hide this container";

    // Let's remove all the previous tabs.
    const table = document.getElementById("container-info-table");
    while (table.firstChild) {
      table.firstChild.remove();
    }

    // Let's retrieve the list of tabs.
    return browser.runtime.sendMessage({
      method: "getTabs",
      userContextId: Logic.currentUserContextId(),
    }).then(this.buildInfoTable);
  },

  buildInfoTable(tabs) {
    // For each one, let's create a new line.
    const fragment = document.createDocumentFragment();
    for (let tab of tabs) { // eslint-disable-line prefer-const
      const tr = document.createElement("tr");
      fragment.appendChild(tr);
      tr.classList.add("container-info-tab-row");
      tr.innerHTML = escaped`
        <td></td>
        <td class="container-info-tab-title truncate-text">${tab.title}</td>`;
      tr.querySelector("td").appendChild(Utils.createFavIconElement(tab.favicon));

      // On click, we activate this tab. But only if this tab is active.
      if (tab.active) {
        tr.classList.add("clickable");
        Logic.addEnterHandler(tr, () => {
          browser.runtime.sendMessage({
            method: "showTab",
            tabId: tab.id,
          }).then(() => {
            window.close();
          }).catch(() => {
            window.close();
          });
        });
      }
    }

    document.getElementById("container-info-table").appendChild(fragment);
  },
});

// P_CONTAINERS_EDIT: Makes the list editable.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINERS_EDIT, {
  panelSelector: "#edit-containers-panel",

  // This method is called when the object is registered.
  initialize() {
    Logic.addEnterHandler(document.querySelector("#exit-edit-mode-link"), () => {
      Logic.showPanel(P_CONTAINERS_LIST);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const fragment = document.createDocumentFragment();
    Logic.identities().forEach(identity => {
      const tr = document.createElement("tr");
      fragment.appendChild(tr);
      tr.classList.add("container-panel-row");
      tr.innerHTML = escaped`
        <td class="userContext-wrapper">
          <div class="userContext-icon-wrapper">
            <div class="usercontext-icon"
              data-identity-icon="${identity.icon}"
              data-identity-color="${identity.color}">
            </div>
          </div>
          <div class="container-name truncate-text"></div>
        </td>
        <td class="edit-container pop-button edit-container-icon">
          <img
            src="/img/container-edit.svg"
            class="pop-button-image" />
        </td>
        <td class="remove-container pop-button delete-container-icon" >
          <img
            class="pop-button-image"
            src="/img/container-delete.svg"
          />
        </td>`;
      tr.querySelector(".container-name").textContent = identity.name;
      tr.querySelector(".edit-container .pop-button-image").setAttribute("title", `Edit ${identity.name} container`);
      tr.querySelector(".remove-container .pop-button-image").setAttribute("title", `Edit ${identity.name} container`);


      Logic.addEnterHandler(tr, e => {
        if (e.target.matches(".edit-container-icon") || e.target.parentNode.matches(".edit-container-icon")) {
          Logic.showPanel(P_CONTAINER_EDIT, identity);
        } else if (e.target.matches(".delete-container-icon") || e.target.parentNode.matches(".delete-container-icon")) {
          Logic.showPanel(P_CONTAINER_DELETE, identity);
        }
      });
    });

    const list = document.querySelector("#edit-identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    return Promise.resolve(null);
  },
});

// P_CONTAINER_EDIT: Editor for a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_EDIT, {
  panelSelector: "#edit-container-panel",

  // This method is called when the object is registered.
  initialize() {
    this.initializeRadioButtons();

    Logic.addEnterHandler(document.querySelector("#edit-container-panel-back-arrow"), () => {
      this._submitForm();
    });
    this._editForm = document.getElementById("edit-container-panel-form");
    this._editForm.addEventListener("submit", this._submitForm.bind(this));

  },

  _submitForm() {
    const formValues = new FormData(this._editForm);
    return browser.runtime.sendMessage({
      method: "createOrUpdateContainer",
      message: {
        userContextId: Logic.currentUserContextId() || false,
        params: {
          name: document.getElementById("edit-container-panel-name-input").value || Logic.generateIdentityName(),
          icon: formValues.get("container-icon") || DEFAULT_ICON,
          color: formValues.get("container-color") || DEFAULT_COLOR,
        }
      }
    }).then(() => {
      return Logic.refreshIdentities();
    }).then(() => {
      Logic.showPreviousPanel();
    }).catch(() => {
      Logic.showPanel(P_CONTAINERS_LIST);
    });
  },

  showAssignedContainers(assignments) {
    const assignmentPanel = document.getElementById("edit-sites-assigned");
    const assignmentKeys = Object.keys(assignments);
    assignmentPanel.hidden = !(assignmentKeys.length > 0);
    if (assignments) {
      const tableElement = assignmentPanel.querySelector("table > tbody");
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
        const assumedUrl = `https://${site.hostname}`;
        trElement.innerHTML = escaped`
        <td><img class="icon" src="${assumedUrl}/favicon.ico"></td>
        <td title="${site.hostname}" class="truncate-text">${site.hostname}
          <img
            class="pop-button-image delete-assignment"
            src="/img/container-delete.svg"
          />
        </td>`;
        const deleteButton = trElement.querySelector(".delete-assignment");
        Logic.addEnterHandler(deleteButton, () => {
          const userContextId = Logic.currentUserContextId();
          // Lets show the message to the current tab
          // TODO remove then when firefox supports arrow fn async
          Logic.currentTab().then((currentTab) => {
            Logic.setOrRemoveAssignment(currentTab.id, assumedUrl, userContextId, true);
            delete assignments[siteKey];
            this.showAssignedContainers(assignments);
          }).catch((e) => {
            throw e;
          });
        });
        trElement.classList.add("container-info-tab-row", "clickable");
        tableElement.appendChild(trElement);
      });
    }
  },

  initializeRadioButtons() {
    const colorRadioTemplate = (containerColor) => {
      return escaped`<input type="radio" value="${containerColor}" name="container-color" id="edit-container-panel-choose-color-${containerColor}" />
     <label for="edit-container-panel-choose-color-${containerColor}" class="usercontext-icon choose-color-icon" data-identity-icon="circle" data-identity-color="${containerColor}">`;
    };
    const colors = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple" ];
    const colorRadioFieldset = document.getElementById("edit-container-panel-choose-color");
    colors.forEach((containerColor) => {
      const templateInstance = document.createElement("span");
      // eslint-disable-next-line no-unsanitized/property
      templateInstance.innerHTML = colorRadioTemplate(containerColor);
      colorRadioFieldset.appendChild(templateInstance);
    });

    const iconRadioTemplate = (containerIcon) => {
      return escaped`<input type="radio" value="${containerIcon}" name="container-icon" id="edit-container-panel-choose-icon-${containerIcon}" />
     <label for="edit-container-panel-choose-icon-${containerIcon}" class="usercontext-icon choose-color-icon" data-identity-color="grey" data-identity-icon="${containerIcon}">`;
    };
    const icons = ["fingerprint", "briefcase", "dollar", "cart", "vacation", "gift", "food", "fruit", "pet", "tree", "chill", "circle"];
    const iconRadioFieldset = document.getElementById("edit-container-panel-choose-icon");
    icons.forEach((containerIcon) => {
      const templateInstance = document.createElement("span");
      // eslint-disable-next-line no-unsanitized/property
      templateInstance.innerHTML = iconRadioTemplate(containerIcon);
      iconRadioFieldset.appendChild(templateInstance);
    });
  },

  // This method is called when the panel is shown.
  async prepare() {
    const identity = Logic.currentIdentity();

    const userContextId = Logic.currentUserContextId();
    const assignments = await Logic.getAssignmentObjectByContainer(userContextId);
    this.showAssignedContainers(assignments);

    document.querySelector("#edit-container-panel-name-input").value = identity.name || "";
    [...document.querySelectorAll("[name='container-color']")].forEach(colorInput => {
      colorInput.checked = colorInput.value === identity.color;
    });
    [...document.querySelectorAll("[name='container-icon']")].forEach(iconInput => {
      iconInput.checked = iconInput.value === identity.icon;
    });

    return Promise.resolve(null);
  },

});

// P_CONTAINER_DELETE: Delete a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_DELETE, {
  panelSelector: "#delete-container-panel",

  // This method is called when the object is registered.
  initialize() {
    Logic.addEnterHandler(document.querySelector("#delete-container-cancel-link"), () => {
      Logic.showPreviousPanel();
    });

    Logic.addEnterHandler(document.querySelector("#delete-container-ok-link"), () => {
      /* This promise wont resolve if the last tab was removed from the window.
          as the message async callback stops listening, this isn't an issue for us however it might be in future
          if you want to do anything post delete do it in the background script.
          Browser console currently warns about not listening also.
      */
      Logic.removeIdentity(Logic.userContextId(Logic.currentIdentity().cookieStoreId)).then(() => {
        return Logic.refreshIdentities();
      }).then(() => {
        Logic.showPreviousPanel();
      }).catch(() => {
        Logic.showPanel(P_CONTAINERS_LIST);
      });
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const identity = Logic.currentIdentity();

    // Populating the panel: name and icon
    document.getElementById("delete-container-name").textContent = identity.name;

    const icon = document.getElementById("delete-container-icon");
    icon.setAttribute("data-identity-icon", identity.icon);
    icon.setAttribute("data-identity-color", identity.color);

    return Promise.resolve(null);
  },
});

Logic.init();
