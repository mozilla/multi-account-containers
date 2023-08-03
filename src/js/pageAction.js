async function init() {
  const fragment = document.createDocumentFragment();
  const [identities, containerOrderStorage] = await Promise.all([
    browser.contextualIdentities.query({}),
    browser.storage.local.get([CONTAINER_ORDER_STORAGE_KEY])
  ]);

  if (containerOrderStorage && containerOrderStorage[CONTAINER_ORDER_STORAGE_KEY]) {
    const order = containerOrderStorage[CONTAINER_ORDER_STORAGE_KEY];
    identities.sort((id1, id2) => order[id1.cookieStoreId] - order[id2.cookieStoreId]);
  }

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

  // Set the theme
  Utils.applyTheme();
}

init();
