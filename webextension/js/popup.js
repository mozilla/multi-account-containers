/* global browser, window, document */
const CONTAINER_HIDE_SRC = '/img/container-hide.svg';
const CONTAINER_UNHIDE_SRC = '/img/container-unhide.svg';

function hideContainerTabs(userContextId) {
  const tabIdsToRemove = [];
  const tabUrlsToSave = [];
  const hideorshowIcon = document.querySelector(`#uci-${userContextId}-hideorshow-icon`);

  browser.runtime.sendMessage({
    method: 'queryTabs',
    userContextId: userContextId
  }).then(tabs=> {
    tabs.forEach(tab=> {
      tabIdsToRemove.push(tab.id);
      tabUrlsToSave.push(tab.url);
    });
    browser.runtime.sendMessage({
      method: 'hideTabs',
      userContextId: userContextId,
      tabUrlsToSave: tabUrlsToSave
    }).then(()=> {
      browser.runtime.sendMessage({
        method: 'removeTabs',
        tabIds: tabIdsToRemove
      });
      hideorshowIcon.src = CONTAINER_UNHIDE_SRC;
    });
  });
}

function showContainerTabs(userContextId) {
  const hideorshowIcon = document.querySelector(`#uci-${userContextId}-hideorshow-icon`);

  browser.runtime.sendMessage({
    method: 'showTabs',
    userContextId: userContextId
  }).then(hiddenTabUrls=> {
    hiddenTabUrls.forEach(url=> {
      browser.runtime.sendMessage({
        method: 'openTab',
        userContextId: userContextId,
        url: url
      });
    });
  });
  hideorshowIcon.src = CONTAINER_HIDE_SRC;
}

browser.runtime.sendMessage({method: 'queryIdentities'}).then(identities=> {
  const identitiesListElement = document.querySelector('.identities-list');

  identities.forEach(identity=> {
    let hideOrShowIconSrc = CONTAINER_HIDE_SRC;

    if (identity.hiddenTabUrls.length) {
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
  });

  const rows = identitiesListElement.querySelectorAll('tr');

  rows.forEach(row=> {
    row.addEventListener('click', e=> {
      const userContextId = e.target.parentElement.parentElement.dataset.identityCookieStoreId;

      if (e.target.matches('.hideorshow-icon')) {
        browser.runtime.sendMessage({method: 'getIdentitiesState'}).then(identitiesState=> {
          if (identitiesState[userContextId].hiddenTabUrls.length) {
            showContainerTabs(userContextId);
          } else {
            hideContainerTabs(userContextId);
          }
        });
      } else if (e.target.matches('.newtab-icon')) {
        browser.runtime.sendMessage({method: 'openTab', userContextId: userContextId});
        window.close();
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

function moveTabs(sortedTabsArray) {
  let positionIndex = 0;

  sortedTabsArray.forEach(tabID=> {
    browser.tabs.move(tabID, {index: positionIndex});
    positionIndex++;
  });
}

document.querySelector('#sort-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage({method: 'queryIdentities'}).then(identities=> {
    identities.unshift({userContextId: 0});

    browser.runtime.sendMessage({method: 'queryTabs'}).then(tabsArray=> {
      const sortedTabsArray = [];

      identities.forEach(identity=> {
        tabsArray.forEach(tab=> {
          if (tab.userContextId === identity.userContextId) {
            sortedTabsArray.push(tab.id);
          }
        });
      });

      moveTabs(sortedTabsArray);
    });
  });
});
