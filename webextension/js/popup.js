browser.contextualIdentities.query({}).then(identites=> {
  let customContainerStyles = '';
  const identitiesListElement = document.querySelector('.identities-list');

  identites.forEach(identity=> {
    const identityRow = `
    <tr>
      <td><div class="userContext-icon" data-identity-name="${identity.name}"></div></td>
      <td>${identity.name}</td>
      <td>&gt;</td>
    </tr>`;

    const customContainerStyle = `
    [data-identity-name="${identity.name}"] {
      --identity-icon: url('/img/usercontext.svg#${identity.icon}');
      --identity-icon-color: ${identity.color};
    }`;

    customContainerStyles += customContainerStyle;
    identitiesListElement.innerHTML += identityRow;
  });

  const customContainerStyleElement = document.createElement('style');

  customContainerStyleElement.type = 'text/css';
  customContainerStyleElement.appendChild(document.createTextNode(customContainerStyles));

  const head = document.head;

  head.appendChild(customContainerStyleElement);
});

document.querySelector('#edit-containers-link').addEventListener('click', ()=> {
  browser.runtime.sendMessage('open-containers-preferences').then(()=> {
    window.close();
  });
});
