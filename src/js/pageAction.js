async function init() {
  const fragment = document.createDocumentFragment();

  const identities = await browser.contextualIdentities.query({});

  identities.forEach(identity => {
    const tr = document.createElement("tr");
    tr.classList.add("menu-item");
    const td = document.createElement("td");

    td.innerHTML = Utils.escaped`          
        <div class="menu-icon">
          <div class="usercontext-icon"
            data-identity-icon="${identity.icon}"
            data-identity-color="${identity.color}">
          </div>
        </div>
        <span class="menu-text">${identity.name}</span>`;

    fragment.appendChild(tr);

    tr.appendChild(td);

    Utils.addEnterHandler(tr, async () => {
      const currentTab = await Utils.currentTab();
      const assignedUserContextId = Utils.userContextId(identity.cookieStoreId);
      Utils.setOrRemoveAssignment(
        currentTab.id, 
        currentTab.url, 
        assignedUserContextId, 
        false
      );
      Utils.reloadInContainer(
        currentTab.url, 
        false, 
        assignedUserContextId,
        currentTab.index + 1, 
        currentTab.active
      );
      window.close();
    });
  });

  const list = document.querySelector("#picker-identities-list");

  list.innerHTML = "";
  list.appendChild(fragment);
}

init();
