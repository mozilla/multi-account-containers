const identityState = {
};

browser.contextualIdentities.query({}).then(identites=> {
  let customContainerStyles = '';
  const identitiesListElement = document.querySelector('.identities-list');

  identites.forEach(identity => {
    const identityRow = `
    <tr data-identity-id="${identity.cookieStoreId}" >
      <td><div class="userContext-icon"
        data-identity-icon="${identity.icon}"
        data-identity-color="${identity.color}"
      ></div></td>
      <td>${identity.name}</td>
      <td class="hideorshow" >H/S</td>
      <td>&gt;</td>
    </tr>`;

    identitiesListElement.innerHTML += identityRow;

  });

  const rows = identitiesListElement.querySelectorAll('tr');
  rows.forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.matches('.hideorshow')) {
        const containerId = e.target.parentElement.dataset.identityId;
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


function hideContainer(containerId) {
  browser.contextualIdentities.hide(containerId);
}

function showContainer(containerId) {
  browser.contextualIdentities.show(containerId);
}
