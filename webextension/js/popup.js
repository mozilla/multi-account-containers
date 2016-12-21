browser.contextualIdentities.query({}).then(identites=> {
  identites.forEach(identity=> {
    console.log('identity: ', identity);
    const identityRow = `
    <tr>
      <td><div class="userContext-icon" data-identity-icon="${identity.icon}" data-identity-icon-color="${identity.color}"></div></td>
      <td>${identity.name}</td>
      <td>&gt;</td>
    </tr>`;

    document.querySelector('.identities-list').innerHTML += identityRow;
  });
});

document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage('open-containers-preferences').then(()=> {
    window.close();
  });
});
