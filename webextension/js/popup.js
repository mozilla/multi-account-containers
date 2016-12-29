/* global browser, window, document */
const identityState = {
};

function hideContainer(containerId) {
  const hideorshowIcon = document.querySelector(`#${containerId}-hideorshow-icon`);

  hideorshowIcon.src = '/img/container-unhide.svg';
  browser.contextualIdentities.hide(containerId);
}

function showContainer(containerId) {
  const hideorshowIcon = document.querySelector(`#${containerId}-hideorshow-icon`);

  hideorshowIcon.src = '/img/container-hide.svg';
  browser.contextualIdentities.show(containerId);
}

browser.contextualIdentities.query({}).then(identities=> {
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

  });

  const rows = identitiesListElement.querySelectorAll('tr');

  rows.forEach(row=> {
    row.addEventListener('click', e=> {
      if (e.target.matches('.hideorshow-icon')) {
        const containerId = e.target.dataset.identityCookieStoreId;

        if (!(containerId in identityState)) {
          identityState[containerId] = true;
        }
        if (identityState[containerId]) {
          hideContainer(containerId);
          identityState[containerId] = false;
        } else {
          showContainer(containerId);
          identityState[containerId] = true;
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
  browser.contextualIdentities.query({}).then(identities=> {
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
