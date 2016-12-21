browser.contextualIdentities.query({}).then((identites) => {
  identites.forEach((identity) => {
    document.querySelector('.identities-list').innerHTML += `<li><a href="#">
      <div
        class="userContext-indicator"
        data-identity-icon="${identity.icon}"
        data-identity-color="${identity.color}"></div>
      ${identity.name}
    </a></li>`;
  });
});
