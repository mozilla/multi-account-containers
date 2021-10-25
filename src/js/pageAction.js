async function init() {
  const fragment = document.createDocumentFragment();
  const identities = await browser.contextualIdentities.query({});

  for (const identity of identities) {
    const tr = document.createElement("tr");
    tr.classList.add("menu-item", "hover-highlight");
    tr.setAttribute("data-cookie-store-id", identity.cookieStoreId);
    const td = document.createElement("td");
    td.innerHTML = Utils.escaped`
        <div class="menu-icon">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <span class="menu-text">${identity.name}</span>
        <img alt="" class="page-action-flag flag-img" src="/img/flags/.png"/>
        `;

    tr.appendChild(td);
    fragment.appendChild(tr);

    Utils.addEnterHandler(tr, async () => {
      Utils.alwaysOpenInContainer(identity);
      window.close();
    });
  }

  const list = document.querySelector("#picker-identities-list");
  list.innerHTML = "";
  list.appendChild(fragment);

  MozillaVPN.handleContainerList(identities);
}

init();
