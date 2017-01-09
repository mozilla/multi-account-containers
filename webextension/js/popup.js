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
    const identityRow = `
    <tr data-identity-cookie-store-id="${identity.userContextId}" >
      <td>
        <div class="userContext-icon"
          data-identity-icon="${identity.icon}"
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
