const IDENTITY_L10NID_MATCH_INDEX = 1;

browser.runtime.sendMessage('get-identities').then(reply=> {
  if (reply) {
    reply.content.identities.forEach(identity=> {
      const identityName = identity.l10nID.match(/userContext(\w*)\.label/)[IDENTITY_L10NID_MATCH_INDEX];
      const identityRow = `
      <tr>
        <td><img class="${identity.icon}-icon" src="/img/usercontext.svg#${identity.icon}"></td>
        <td>${identityName}</td>
        <td>&gt;</td>
      </tr>`;

      document.querySelector('.identities-list').innerHTML += identityRow;
    });
    console.log('response from sdk addon: ', reply.content);
  }
});

document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage('open-containers-preferences').then(()=> {
    window.close();
  });
});
