const IDENTITY_L10NID_MATCH_INDEX = 1;

browser.runtime.sendMessage('get-identities').then(reply=> {
  if (reply) {
    console.log('reply from sdk addon: ', reply);
    reply.content.identities.forEach(identity=> {
      let identityName = identity.name;

      console.log('identityName: ', identityName);

      if (typeof identityName === 'undefined') {
        identityName = identity.l10nID.match(/userContext(\w*)\.label/)[IDENTITY_L10NID_MATCH_INDEX];
      }
      const identityRow = `
      <tr>
        <td><div class="userContext-icon" data-identity-icon="${identity.icon}" data-identity-icon-color="${identity.color}"></div></td>
        <td>${identityName}</td>
        <td>&gt;</td>
      </tr>`;

      document.querySelector('.identities-list').innerHTML += identityRow;
    });
  }
});

document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage('open-containers-preferences').then(()=> {
    window.close();
  });
});
