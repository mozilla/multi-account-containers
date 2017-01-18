/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const CONTAINER_HIDE_SRC = "/img/container-hide.svg";
const CONTAINER_UNHIDE_SRC = "/img/container-unhide.svg";

// TODO: Let's set it to false before releasing!!!
const DEBUG = true;

// List of panels
const P_ONBOARDING_1     = "onboarding1";
const P_ONBOARDING_2     = "onboarding2";
const P_CONTAINERS_LIST  = "containersList";
const P_CONTAINERS_EDIT  = "containersEdit";
const P_CONTAINER_INFO   = "containerInfo";
const P_CONTAINER_EDIT   = "containerEdit";
const P_CONTAINER_DELETE = "containerDelete";

function log(...args) {
  if (DEBUG) {
    console.log.call(console, ...args); // eslint-disable-line no-console
  }
}

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
      if (localStorage.getItem("onboarded2")) {
        this.showPanel(P_CONTAINERS_LIST);
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
    const defaultName = "Container";
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
    document.querySelector("#onboarding-next-button").addEventListener("click", () => {
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
    document.querySelector("#onboarding-done-button").addEventListener("click", () => {
      localStorage.setItem("onboarded2", true);
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
      log("identities.forEach");
      const tr = document.createElement("tr");
      fragment.appendChild(tr);
      tr.classList.add("container-panel-row", "clickable");
      tr.innerHTML = `
        <td>
          <div class="userContext-icon open-newtab"
            data-identity-icon="${identity.image}"
            data-identity-color="${identity.color}">
          </div>
        </td>
        <td class="open-newtab">${identity.name}</td>
        <td class="info">&gt;</td>`;

      tr.addEventListener("click", e => {
        if (e.target.matches(".open-newtab")) {
          browser.runtime.sendMessage({
            method: "showTabs",
            userContextId: identity.userContextId
          }).then(() => {
            return browser.runtime.sendMessage({
              method: "openTab",
              userContextId: identity.userContextId,
            });
          }).then(() => {
            window.close();
          }).catch(() => {
            window.close();
          });
        } else if (e.target.matches(".info")) {
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
    hideShowLabel.innerText = identity.hasHiddenTabs ? "Show these container tabs" : "Hide these container tabs";

    // Let's remove all the previous tabs.
    for (let trTab of document.getElementsByClassName("container-info-tab")) { // eslint-disable-line prefer-const
      trTab.remove();
    }

    // Let's retrieve the list of tabs.
    return browser.runtime.sendMessage({
      method: "getTabs",
      userContextId: identity.userContextId,
    }).then(tabs => {
      log("browser.runtime.sendMessage getTabs, tabs: ", tabs);
      // For each one, let's create a new line.
      const fragment = document.createDocumentFragment();
      for (let tab of tabs) { // eslint-disable-line prefer-const
        const tr = document.createElement("tr");
        fragment.appendChild(tr);
        tr.classList.add("container-info-tab");
        tr.innerHTML = `
          <td><img class="icon" src="${tab.favicon}" /></td>
          <td>${tab.title}</td>`;

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
    });
  },
});

// P_CONTAINERS_EDIT: Makes the list editable.
// ----------------------------------------------------------------------------

Logic.registerPanel(P_CONTAINERS_EDIT, {
  panelSelector: "#edit-containers-panel",

  // This method is called when the object is registered.
  initialize() {
    document.querySelector("#edit-containers-add-link").addEventListener("click", () => {
      Logic.showPanel(P_CONTAINER_EDIT, { name: Logic.generateIdentityName() });
    });

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
      tr.innerHTML = `
        <td>
          <div class="userContext-icon"
            data-identity-icon="${identity.image}"
            data-identity-color="${identity.color}">
          </div>
        </td>
        <td>${identity.name}</td>
        <td class="edit-container">
          <img
            title="Edit ${identity.name} container"
            src="/img/container-edit.svg"
            class="icon edit-container-icon clickable" />
        </td>
        <td class="remove-container" >
          <img
            title="Remove ${identity.name} container"
            class="icon delete-container-icon clickable"
            src="/img/container-delete.svg"
          />
        </td>`;

      tr.addEventListener("click", e => {
        if (e.target.matches(".edit-container-icon")) {
          Logic.showPanel(P_CONTAINER_EDIT, identity);
        } else if (e.target.matches(".delete-container-icon")) {
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
    document.querySelector("#edit-container-panel-back-arrow").addEventListener("click", () => {
      Logic.showPreviousPanel();
    });

    document.querySelector("#edit-container-cancel-link").addEventListener("click", () => {
      Logic.showPreviousPanel();
    });

    document.querySelector("#edit-container-ok-link").addEventListener("click", () => {
      const identity = Logic.currentIdentity();
      browser.runtime.sendMessage({
        method: identity.userContextId ? "updateIdentity" : "createIdentity",
        userContextId: identity.userContextId || 0,
        name: document.getElementById("edit-container-panel-name-input").value || Logic.generateIdentityName(),
        icon: identity.image || "fingerprint",
        color: identity.color || "green",
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
    document.querySelector("#edit-container-panel-name-input").value = identity.name || "";

    // FIXME: color and icon must be set. But we need the UI first.

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
