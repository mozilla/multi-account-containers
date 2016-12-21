browser.contextualIdentities.query({}).then((identites) => {
  identites.forEach((identity) => {
    document.querySelector('.identities-list').innerHTML += `<li><a href="#">${identity.icon} ${identity.name}</a></li>`;
  });
});
