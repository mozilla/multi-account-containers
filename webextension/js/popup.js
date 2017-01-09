/* global browser, window, document, localStorage */
const CONTAINER_HIDE_SRC = '/img/container-hide.svg';
const CONTAINER_UNHIDE_SRC = '/img/container-unhide.svg';

function showOrHideContainerTabs(userContextId, hasHiddenTabs) {
  return new Promise((resolve, reject) => {
    const hideorshowIcon = document.querySelector(`#uci-${userContextId}-hideorshow-icon`);

    browser.runtime.sendMessage({
      method: hasHiddenTabs ? 'showTabs' : 'hideTabs',
      userContextId: userContextId
    }).then(() => {
      return browser.runtime.sendMessage({
        method: 'getIdentity',
        userContextId: userContextId
      });
    }).then((identity) => {
      if (!identity.hasHiddenTabs && !identity.hasOpenTabs) {
        hideorshowIcon.style.display = "none";
      } else {
        hideorshowIcon.style.display = "";
      }

      hideorshowIcon.src = hasHiddenTabs ? CONTAINER_HIDE_SRC : CONTAINER_UNHIDE_SRC;
    }).then(resolve);
  });
}

// In FF 50-51, the icon is the full path, in 52 and following releases, we
// have IDs to be used with a svg file. In this function we map URLs to svg IDs.
function getIconAndColorForIdentity(identity) {
  let image, color;

  if (identity.icon == "fingerprint" ||
      identity.icon == "chrome://browser/skin/usercontext/personal.svg") {
    image = "fingerprint";
  } else if (identity.icon == "briefcase" ||
           identity.icon == "chrome://browser/skin/usercontext/work.svg") {
    image = "briefcase";
  } else if (identity.icon == "dollar" ||
           identity.icon == "chrome://browser/skin/usercontext/banking.svg") {
    image = "dollar";
  } else if (identity.icon == "cart" ||
           identity.icon == "chrome://browser/skin/usercontext/shopping.svg") {
    image = "cart";
  } else {
    image = "circle";
  }

  if (identity.color == "#00a7e0") {
    color = "blue";
  } else if (identity.color == "#f89c24") {
    color = "orange";
  } else if (identity.color == "#7dc14c") {
    color = "green";
  } else if (identity.color == "#ee5195") {
    color = "pink";
  } else if (["blue", "turquoise", "green", "yellow", "orange", "red",
              "pink", "purple"].indexOf(identity.color) != -1) {
    color = identity.color;
  } else {
    color = "";
  }

  return { image, color };
}

if (localStorage.getItem('onboarded2')) {
  for (const element of document.querySelectorAll('.onboarding')) {
    element.classList.add('hide');
  }
  document.querySelector('#container-panel').classList.remove('hide');
} else if (localStorage.getItem('onboarded1')) {
  document.querySelector('.onboarding-panel-1').classList.add('hide');
  document.querySelector('#container-panel').classList.add('hide');
} else {
  document.querySelector('.onboarding-panel-2').classList.add('hide');
  document.querySelector('#container-panel').classList.add('hide');
}

document.querySelector('#onboarding-next-button').addEventListener('click', ()=> {
  localStorage.setItem('onboarded1', true);
  document.querySelector('.onboarding-panel-2').classList.remove('hide');
  document.querySelector('.onboarding-panel-1').classList.add('hide');
  document.querySelector('#container-panel').classList.add('hide');
});

document.querySelector('#onboarding-done-button').addEventListener('click', ()=> {
  localStorage.setItem('onboarded2', true);
  document.querySelector('.onboarding-panel-1').classList.add('hide');
  document.querySelector('.onboarding-panel-2').classList.add('hide');
  document.querySelector('#container-panel').classList.remove('hide');
});

browser.runtime.sendMessage({method: 'queryIdentities'}).then(identities=> {
  const identitiesListElement = document.querySelector('.identities-list');

  identities.forEach(identity=> {
    let hideOrShowIconSrc = CONTAINER_HIDE_SRC;

    if (identity.hasHiddenTabs) {
      hideOrShowIconSrc = CONTAINER_UNHIDE_SRC;
    }

    let {image, color} = getIconAndColorForIdentity(identity);

    const identityRow = `
    <tr data-identity-cookie-store-id="${identity.userContextId}" >
      <td>
        <div class="userContext-icon"
          data-identity-icon="${image}"
          data-identity-color="${color}">
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
      <td>&gt;</td>
    </tr>`;

    identitiesListElement.innerHTML += identityRow;

    // No tabs, no icon.
    if (!identity.hasHiddenTabs && !identity.hasOpenTabs) {
      const hideorshowIcon = document.querySelector(`#uci-${identity.userContextId}-hideorshow-icon`);
      hideorshowIcon.style.display = "none";
    }
  });

  const rows = identitiesListElement.querySelectorAll('tr');

  rows.forEach(row=> {
    row.addEventListener('click', e=> {
      const userContextId = e.target.parentElement.parentElement.dataset.identityCookieStoreId;

      if (e.target.matches('.hideorshow-icon')) {
        browser.runtime.sendMessage({
          method: 'getIdentity',
          userContextId
        }).then(identity=> {
          showOrHideContainerTabs(userContextId, identity.hasHiddenTabs);
        });
      } else if (e.target.matches('.newtab-icon')) {
        showOrHideContainerTabs(userContextId, true).then(() => {
          browser.runtime.sendMessage({
            method: 'openTab',
            userContextId: userContextId})
          .then(() => {
            window.close();
          });
        });
      }
    });
  });
});

document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage({
    method: 'openTab',
    url: "about:preferences#containers"
  }).then(()=> {
    window.close();
  });
});

document.querySelector('#sort-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage({
    method: 'sortTabs'
  }).then(()=> {
    window.close();
  });
});
