/* global browser, window, document */
const identitiesState = {
};

function hideContainerTabs(containerId) {
  const tabIdsToRemove = [];
  const hideorshowIcon = document.querySelector(`#${containerId}-hideorshow-icon`);

  browser.tabs.query({cookieStoreId: containerId}).then(tabs=> {
    tabs.forEach(tab=> {
      tabIdsToRemove.push(tab.id);
      identitiesState[containerId].hiddenTabUrls.push(tab.url);
    });
    browser.tabs.remove(tabIdsToRemove);
    hideorshowIcon.src = '/img/container-unhide.svg';
  });
}

function showContainerTabs(containerId) {
  const hideorshowIcon = document.querySelector(`#${containerId}-hideorshow-icon`);

  identitiesState[containerId].hiddenTabUrls.forEach(url=> {
    // Have to use SDK to open tabs in case they are about:* pages
    browser.tabs.create({
      url: url,
      cookieStoreId: containerId
    });
  });
  identitiesState[containerId].hiddenTabUrls = [];
  hideorshowIcon.src = '/img/container-hide.svg';
}

browser.runtime.sendMessage({method: 'query'}).then(identities=> {
  const identitiesListElement = document.querySelector('.identities-list');

  identities.forEach(identity=> {
    const identityRow = `
    <tr data-identity-cookie-store-id="${identity.cookieStoreId}" >
      <td><div class="userContext-icon"
        data-identity-icon="${identity.icon}"
        data-identity-color="${identity.color}"
      ></div></td>
      <td>${identity.name}</td>
      <td class="hideorshow" >
        <img
          data-identity-cookie-store-id="${identity.cookieStoreId}"
          id="${identity.cookieStoreId}-hideorshow-icon"
          class="hideorshow-icon"
          src="/img/container-hide.svg"
        />
      </td>
      <td>&gt;</td>
    </tr>`;

    identitiesListElement.innerHTML += identityRow;

    if (!(identity in identitiesState)) {
      identitiesState[identity.cookieStoreId] = {hiddenTabUrls: []};
    }
  });

  const rows = identitiesListElement.querySelectorAll('tr');

  rows.forEach(row=> {
    row.addEventListener('click', e=> {
      if (e.target.matches('.hideorshow-icon')) {
        const containerId = e.target.dataset.identityCookieStoreId;

        if (identitiesState[containerId].hiddenTabUrls.length) {
          showContainerTabs(containerId);
        } else {
          hideContainerTabs(containerId);
        }
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
