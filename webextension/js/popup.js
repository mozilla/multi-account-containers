/* global browser, window, document */
const CONTAINER_HIDE_SRC = '/img/container-hide.svg';
const CONTAINER_UNHIDE_SRC = '/img/container-unhide.svg';

function hideContainerTabs(containerId) {
  const tabIdsToRemove = [];
  const tabUrlsToSave = [];
  const hideorshowIcon = document.querySelector(`#${containerId}-hideorshow-icon`);

  browser.tabs.query({cookieStoreId: containerId}).then(tabs=> {
    tabs.forEach(tab=> {
      tabIdsToRemove.push(tab.id);
      tabUrlsToSave.push(tab.url);
    });
    browser.runtime.sendMessage({
      method: 'hide',
      cookieStoreId: containerId,
      tabUrlsToSave: tabUrlsToSave
    }).then(()=> {
      browser.tabs.remove(tabIdsToRemove);
      hideorshowIcon.src = CONTAINER_UNHIDE_SRC;
    });
  });
}

function showContainerTabs(containerId) {
  const hideorshowIcon = document.querySelector(`#${containerId}-hideorshow-icon`);

  browser.runtime.sendMessage({
    method: 'show',
    cookieStoreId: containerId
  }).then(hiddenTabUrls=> {
    hiddenTabUrls.forEach(url=> {
      browser.runtime.sendMessage({
        method: 'openTab',
        containerId: containerId,
        url: url
      });
    });
  });
  hideorshowIcon.src = CONTAINER_HIDE_SRC;
}

browser.runtime.sendMessage({method: 'query'}).then(identities=> {
  const identitiesListElement = document.querySelector('.identities-list');

  identities.forEach(identity=> {
    let hideOrShowIconSrc = CONTAINER_HIDE_SRC;

    if (identity.hiddenTabUrls.length) {
      hideOrShowIconSrc = CONTAINER_UNHIDE_SRC;
    }
    const identityRow = `
    <tr data-identity-cookie-store-id="${identity.cookieStoreId}" >
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
          data-identity-cookie-store-id="${identity.cookieStoreId}"
          id="${identity.cookieStoreId}-hideorshow-icon"
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
      const containerId = e.target.parentElement.parentElement.dataset.identityCookieStoreId;

      if (e.target.matches('.hideorshow-icon')) {
        browser.runtime.sendMessage({method: 'getIdentitiesState'}).then(identitiesState=> {
          if (identitiesState[containerId].hiddenTabUrls.length) {
            showContainerTabs(containerId);
          } else {
            hideContainerTabs(containerId);
          }
        });
      } else if (e.target.matches('.newtab-icon')) {
        browser.runtime.sendMessage({method: 'openTab', containerId: containerId});
        window.close();
      }
    });
  });
});


document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage('open-containers-preferences').then(()=> {
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
  browser.runtime.sendMessage({method: 'query'}).then(identities=> {
    identities.unshift({cookieStoreId: 'firefox-default'});

    browser.tabs.query({}).then(tabsArray=> {
      const sortedTabsArray = [];

      identities.forEach(identity=> {
        tabsArray.forEach(tab=> {
          if (tab.cookieStoreId === identity.cookieStoreId) {
            sortedTabsArray.push(tab.id);
          }
        });
      });

      moveTabs(sortedTabsArray);
    });
  });
});
