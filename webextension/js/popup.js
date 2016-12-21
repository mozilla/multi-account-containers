browser.contextualIdentities.query({}).then(identites=> {
  let customContainerStyles = '';
  const identitiesListElement = document.querySelector('.identities-list');

  identites.forEach(identity=> {
    const identityRow = `
    <tr>
      <td><div class="userContext-icon"
        data-identity-icon="${identity.icon}"
        data-identity-color="${identity.color}"
      ></div></td>
      <td>${identity.name}</td>
      <td>&gt;</td>
    </tr>`;

    identitiesListElement.innerHTML += identityRow;
  });
});

document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage('open-containers-preferences').then(()=> {
    window.close();
  });
});
