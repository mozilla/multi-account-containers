async function init() {
  await ContainerStyle.injectStylesheet();

  const fragment = document.createDocumentFragment();
  const identities = await browser.contextualIdentities.query({});

  const defaultTr = document.createElement("tr");
  defaultTr.classList.add("menu-item", "hover-highlight");
  const defaultTd = document.createElement("td");
  defaultTd.innerHTML = Utils.escaped`
      <div class="menu-icon">
        <div class="mac-icon">
        </div>
      </div>
      <span class="menu-text">Default Container</span>
      `;
  defaultTr.appendChild(defaultTd);
  fragment.appendChild(defaultTr);

  Utils.addEnterHandler(defaultTr, async () => {
    await Utils.removeAlwaysOpenInContainer();
    window.close();
  });

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