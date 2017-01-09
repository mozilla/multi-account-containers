/* global browser, window, document, localStorage */
const CONTAINER_HIDE_SRC = "/img/container-hide.svg";
const CONTAINER_UNHIDE_SRC = "/img/container-unhide.svg";

function showOrHideContainerTabs(userContextId, hasHiddenTabs) {
  // Let"s show/hide the tabs
  return browser.runtime.sendMessage({
    method: hasHiddenTabs ? "showTabs" : "hideTabs",
    userContextId: userContextId
  })
  // We need to retrieve the new identity configuration in order to choose the
  // correct icon.
  .then(() => {
    return browser.runtime.sendMessage({
      method: "getIdentity",
      userContextId: userContextId
    });
  })
  // Let"s update the icon.
  .then((identity) => {
    let hideorshowIcon = document.querySelector(`#uci-${identity.userContextId}-hideorshow-icon`);
    if (!identity.hasHiddenTabs && !identity.hasOpenTabs) {
      hideorshowIcon.style.display = "none";
    } else {
      hideorshowIcon.style.display = "";
    }

    hideorshowIcon.src = hasHiddenTabs ? CONTAINER_HIDE_SRC : CONTAINER_UNHIDE_SRC;

    // The new identity is returned.
    return identity;
  });
}

if (localStorage.getItem("onboarded2")) {
  for (let element of document.querySelectorAll(".onboarding")) {
    element.classList.add("hide");
  }
  document.querySelector("#container-panel").classList.remove("hide");
} else if (localStorage.getItem("onboarded1")) {
  document.querySelector(".onboarding-panel-1").classList.add("hide");
  document.querySelector("#container-panel").classList.add("hide");
} else {
  document.querySelector(".onboarding-panel-2").classList.add("hide");
  document.querySelector("#container-panel").classList.add("hide");
}

document.querySelector("#onboarding-next-button").addEventListener("click", () => {
  localStorage.setItem("onboarded1", true);
  document.querySelector(".onboarding-panel-2").classList.remove("hide");
  document.querySelector(".onboarding-panel-1").classList.add("hide");
  document.querySelector("#container-panel").classList.add("hide");
});

document.querySelector("#onboarding-done-button").addEventListener("click", () => {
  localStorage.setItem("onboarded2", true);
  document.querySelector(".onboarding-panel-1").classList.add("hide");
  document.querySelector(".onboarding-panel-2").classList.add("hide");
  document.querySelector("#container-panel").classList.remove("hide");
});

browser.runtime.sendMessage({method: "queryIdentities"}).then(identities => {
  let fragment = document.createDocumentFragment();

  identities.forEach(identity => {
    let hideOrShowIconSrc = CONTAINER_HIDE_SRC;

    if (identity.hasHiddenTabs) {
      hideOrShowIconSrc = CONTAINER_UNHIDE_SRC;
    }

    let tr = document.createElement("tr");
    fragment.appendChild(tr);
    tr.setAttribute("data-identity-cookie-store-id", identity.userContextId);
    tr.innerHTML = `
      <td>
        <div class="userContext-icon"
          data-identity-icon="${identity.image}"
          data-identity-color="${identity.color}">
        </div>
      </td>
      <td>${identity.name}</td>
      <td class="newtab">
        <img
          title="Open a new ${identity.name} container tab"
          src="/img/container-add.svg"
          class="icon newtab-icon" />
      </td>
      <td class="hideorshow" >
        <img
          title="Hide or show ${identity.name} container tabs"
          data-identity-cookie-store-id="${identity.userContextId}"
          id="uci-${identity.userContextId}-hideorshow-icon"
          class="icon hideorshow-icon"
          src="${hideOrShowIconSrc}"
        />
      </td>
      <td>&gt;</td>`;

    // No tabs, no icon.
    if (!identity.hasHiddenTabs && !identity.hasOpenTabs) {
      let hideorshowIcon = fragment.querySelector(`#uci-${identity.userContextId}-hideorshow-icon`);
      hideorshowIcon.style.display = "none";
    }

    tr.addEventListener("click", e => {
      if (e.target.matches(".hideorshow-icon")) {
        showOrHideContainerTabs(identity.userContextId,
                                identity.hasHiddenTabs).then(i => { identity = i; });
      } else if (e.target.matches(".newtab-icon")) {
        showOrHideContainerTabs(identity.userContextId, true).then(() => {
          browser.runtime.sendMessage({
            method: "openTab",
            userContextId: identity.userContextId,
          }).then(() => {
            window.close();
          });
        });
      }
    });
  });

  document.querySelector(".identities-list").appendChild(fragment);
});

document.querySelector("#edit-containers-link").addEventListener("click", () => {
  browser.runtime.sendMessage({
    method: "openTab",
    url: "about:preferences#containers"
  }).then(() => {
    window.close();
  });
});

document.querySelector("#sort-containers-link").addEventListener("click", () => {
  browser.runtime.sendMessage({
    method: "sortTabs"
  }).then(() => {
    window.close();
  });
});
