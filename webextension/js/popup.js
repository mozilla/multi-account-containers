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
const P_CONTAINERS_LIST  = "containersList";
const P_CONTAINERS_EDIT  = "containersEdit";
const P_CONTAINER_INFO   = "containerInfo";
const P_CONTAINER_EDIT   = "containerEdit";
const P_CONTAINER_DELETE = "containerDelete";

// This object controls all the panels, identities and many other things.
const Logic = {
  _identities: [],
  _currentIdentity: null,
  _currentPanel: null,
  _previousPanel: null,
  _panels: {},

  init() {
    // Retrieve the list of identities.
    this.refreshIdentities()

    // Routing to the correct panel.
    .then(() => {
      if (localStorage.getItem("onboarded3")) {
        this.showPanel(P_CONTAINERS_LIST);
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

  refreshIdentities() {
    return browser.runtime.sendMessage({
      method: "queryIdentities"
    })
    .then(identities => {
      this._identities = identities;
    });
  },

  showPanel(panel, currentIdentity = null) {
    // Invalid panel... ?!?
    if (!(panel in this._panels)) {
      throw new Error("Something really bad happened. Unknown panel: " + panel);
    }

    this._previousPanel = this._currentPanel;
    this._currentPanel = panel;

    this._currentIdentity = currentIdentity;

    // Initialize the panel before showing it.
    this._panels[panel].prepare().then(() => {
      for (let panelElement of document.querySelectorAll(".panel")) { // eslint-disable-line prefer-const
        panelElement.classList.add("hide");
      }
      document.querySelector(this._panels[panel].panelSelector).classList.remove("hide");
    })
    .catch(() => {
      throw new Error("Failed to show panel " + panel);
    });
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
    document.querySelector("#onboarding-start-button").addEventListener("click", () => {
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
    document.querySelector("#onboarding-next-button").addEventListener("click", () => {
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
    document.querySelector("#onboarding-done-button").addEventListener("click", () => {
      localStorage.setItem("onboarded3", true);
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
    document.querySelector("#container-add-link").addEventListener("click", () => {
      Logic.showPanel(P_CONTAINER_EDIT, { name: Logic.generateIdentityName() });
    });

    document.querySelector("#edit-containers-link").addEventListener("click", () => {
      browser.runtime.sendMessage({
        method: "sendTelemetryPayload",
        event: "edit-containers"
      });
      Logic.showPanel(P_CONTAINERS_EDIT);
    });

    document.querySelector("#sort-containers-link").addEventListener("click", () => {
      browser.runtime.sendMessage({
        method: "sortTabs"
      }).then(() => {
        window.close();
      }).catch(() => {
        window.close();
      });
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const fragment = document.createDocumentFragment();

    Logic.identities().forEach(identity => {
      const hasTabs = (identity.hasHiddenTabs || identity.hasOpenTabs);
      const tr = document.createElement("tr");
      const context = document.createElement("td");
      const manage = document.createElement("td");

      tr.classList.add("container-panel-row");
      context.classList.add("userContext-wrapper", "open-newtab", "clickable");
      manage.classList.add("show-tabs", "pop-button");
      context.innerHTML = `
        <div class="userContext-icon-wrapper open-newtab">
          <div class="userContext-icon"
            data-identity-icon="${identity.image}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <div class="container-name">${identity.name}</div>`;
      manage.innerHTML = "<img src='/img/container-arrow.svg' class='show-tabs pop-button-image-small' />";

      fragment.appendChild(tr);

      tr.appendChild(context);

      if (hasTabs) {
        tr.appendChild(manage);
      }

      tr.addEventListener("click", e => {
        if (e.target.matches(".open-newtab") || e.target.parentNode.matches(".open-newtab")) {
          browser.runtime.sendMessage({
            method: "openTab",
            userContextId: identity.userContextId,
            source: "pop-up"
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

    const list = document.querySelector(".identities-list");

    list.innerHTML = "";
    list.appendChild(fragment);

    return Promise.resolve();
  },
});

// P_CONTAINER_INFO: More info about a container.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINER_INFO, {
  panelSelector: "#container-info-panel",

  // This method is called when the object is registered.
  initialize() {
    document.querySelector("#close-container-info-panel").addEventListener("click", () => {
      Logic.showPreviousPanel();
    });

    document.querySelector("#container-info-hideorshow").addEventListener("click", () => {
      const identity = Logic.currentIdentity();
      browser.runtime.sendMessage({
        method: identity.hasHiddenTabs ? "showTabs" : "hideTabs",
        userContextId: identity.userContextId
      }).then(() => {
        window.close();
      }).catch(() => {
        window.close();
      });
    });

    document.querySelector("#container-info-movetabs").addEventListener("click", () => {
      return browser.runtime.sendMessage({
        method: "moveTabsToWindow",
        userContextId: Logic.currentIdentity().userContextId,
      }).then(() => {
        window.close();
      });
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const identity = Logic.currentIdentity();

    // Populating the panel: name and icon
    document.getElementById("container-info-name").innerText = identity.name;

    const icon = document.getElementById("container-info-icon");
    icon.setAttribute("data-identity-icon", identity.image);
    icon.setAttribute("data-identity-color", identity.color);

    // Show or not the has-tabs section.
    for (let trHasTabs of document.getElementsByClassName("container-info-has-tabs")) { // eslint-disable-line prefer-const
      trHasTabs.style.display = !identity.hasHiddenTabs && !identity.hasOpenTabs ? "none" : "";
    }

    const hideShowIcon = document.getElementById("container-info-hideorshow-icon");
    hideShowIcon.src = identity.hasHiddenTabs ? CONTAINER_UNHIDE_SRC : CONTAINER_HIDE_SRC;

    const hideShowLabel = document.getElementById("container-info-hideorshow-label");
    hideShowLabel.innerText = identity.hasHiddenTabs ? "Show this container" : "Hide this container";

    // Let's remove all the previous tabs.
    const table = document.getElementById("container-info-table");
    while (table.firstChild) {
      table.firstChild.remove();
    }

    // Let's retrieve the list of tabs.
    return browser.runtime.sendMessage({
      method: "getTabs",
      userContextId: identity.userContextId,
    }).then(this.buildInfoTable);
  },

  buildInfoTable(tabs) {
    // For each one, let's create a new line.
    const fragment = document.createDocumentFragment();
    for (let tab of tabs) { // eslint-disable-line prefer-const
      const tr = document.createElement("tr");
      fragment.appendChild(tr);
      tr.classList.add("container-info-tab-row");
      tr.innerHTML = `
        <td><img class="icon" src="${tab.favicon}" /></td>
        <td class="container-info-tab-title">${tab.title}</td>`;

      // On click, we activate this tab. But only if this tab is active.
      if (tab.active) {
        tr.classList.add("clickable");
        tr.addEventListener("click", () => {
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
    document.querySelector("#exit-edit-mode-link").addEventListener("click", () => {
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
      tr.innerHTML = `
        <td class="userContext-wrapper">
          <div class="userContext-icon-wrapper">
            <div class="userContext-icon"
              data-identity-icon="${identity.image}"
              data-identity-color="${identity.color}">
            </div>
          </div>
          <div class="container-name">${identity.name}</div>
        </td>
        <td class="edit-container pop-button edit-container-icon">
          <img
            title="Edit ${identity.name} container"
            src="/img/container-edit.svg"
            class="pop-button-image" />
        </td>
        <td class="remove-container pop-button delete-container-icon" >
          <img
            title="Remove ${identity.name} container"
            class="pop-button-image"
            src="/img/container-delete.svg"
          />
        </td>`;

      tr.addEventListener("click", e => {
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

    document.querySelector("#edit-container-panel-back-arrow").addEventListener("click", () => {
      Logic.showPreviousPanel();
    });

    document.querySelector("#edit-container-cancel-link").addEventListener("click", () => {
      Logic.showPreviousPanel();
    });

    document.querySelector("#edit-container-ok-link").addEventListener("click", () => {
      const identity = Logic.currentIdentity();
      const formValues = new FormData(document.getElementById("edit-container-panel-form"));
      browser.runtime.sendMessage({
        method: identity.userContextId ? "updateIdentity" : "createIdentity",
        userContextId: identity.userContextId || 0,
        name: document.getElementById("edit-container-panel-name-input").value || Logic.generateIdentityName(),
        icon: formValues.get("container-icon") || DEFAULT_ICON,
        color: formValues.get("container-color") || DEFAULT_COLOR,
      }).then(() => {
        return Logic.refreshIdentities();
      }).then(() => {
        Logic.showPreviousPanel();
      }).catch(() => {
        Logic.showPanel(P_CONTAINERS_LIST);
      });
    });
  },

  initializeRadioButtons() {
    const colorRadioTemplate = (containerColor) => {
      return `<input type="radio" value="${containerColor}" name="container-color" id="edit-container-panel-choose-color-${containerColor}" />
     <label for="edit-container-panel-choose-color-${containerColor}" class="usercontext-icon choose-color-icon" data-identity-icon="circle" data-identity-color="${containerColor}">`;
    };
    const colors = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple" ];
    const colorRadioFieldset = document.getElementById("edit-container-panel-choose-color");
    colors.forEach((containerColor) => {
      const templateInstance = document.createElement("span");
      templateInstance.innerHTML = colorRadioTemplate(containerColor);
      colorRadioFieldset.appendChild(templateInstance);
    });

    const iconRadioTemplate = (containerIcon) => {
      return `<input type="radio" value="${containerIcon}" name="container-icon" id="edit-container-panel-choose-icon-${containerIcon}" />
     <label for="edit-container-panel-choose-icon-${containerIcon}" class="usercontext-icon choose-color-icon" data-identity-color="grey" data-identity-icon="${containerIcon}">`;
    };
    const icons = ["fingerprint", "briefcase", "dollar", "cart", "vacation", "gift", "food", "fruit", "pet", "tree", "chill", "circle"];
    const iconRadioFieldset = document.getElementById("edit-container-panel-choose-icon");
    icons.forEach((containerIcon) => {
      const templateInstance = document.createElement("span");
      templateInstance.innerHTML = iconRadioTemplate(containerIcon);
      iconRadioFieldset.appendChild(templateInstance);
    });
  },

  // This method is called when the panel is shown.
  prepare() {
    const identity = Logic.currentIdentity();
    document.querySelector("#edit-container-panel-name-input").value = identity.name || "";
    [...document.querySelectorAll("[name='container-color']")].forEach(colorInput => {
      colorInput.checked = colorInput.value === identity.color;
    });
    [...document.querySelectorAll("[name='container-icon']")].forEach(iconInput => {
      iconInput.checked = iconInput.value === identity.image;
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
    document.querySelector("#delete-container-cancel-link").addEventListener("click", () => {
      Logic.showPreviousPanel();
    });

    document.querySelector("#delete-container-ok-link").addEventListener("click", () => {
      browser.runtime.sendMessage({
        method: "removeIdentity",
        userContextId: Logic.currentIdentity().userContextId,
      }).then(() => {
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
    document.getElementById("delete-container-name").innerText = identity.name;

    const icon = document.getElementById("delete-container-icon");
    icon.setAttribute("data-identity-icon", identity.image);
    icon.setAttribute("data-identity-color", identity.color);

    return Promise.resolve(null);
  },
});

Logic.init();
