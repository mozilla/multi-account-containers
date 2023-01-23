async function init() {
  const fragment = document.createDocumentFragment();
  const identities = await browser.contextualIdentities.query({});

  for (const identity of identities) {
    const tr = document.createElement("tr");
    tr.classList.add("menu-item", "hover-highlight");
    tr.setAttribute("data-cookie-store-id", identity.cookieStoreId);
    const td = document.createElement("td");

    // Create `<div class="menu-icon">`
    const fragmentDivMenuIcon = document.createElement("div");
    fragmentDivMenuIcon.classList.add("menu-icon");

    // Create `<div class="usercontext-icon"`
    const fragmentDivUserContextIcon= document.createElement("div");
    fragmentDivUserContextIcon.classList.add("usercontext-icon");
    fragmentDivUserContextIcon.setAttribute("data-identity-icon", identity.icon);
    fragmentDivUserContextIcon.setAttribute("data-identity-color", identity.color);
    fragmentDivMenuIcon.appendChild(fragmentDivUserContextIcon);

    // Append both of <td>
    td.appendChild(fragmentDivMenuIcon);
    
    // Create <span class"menu-text">
    const fragmentSpanMenuText= document.createElement("span");
    const fragmentSpanMenuTextContent = document.createTextNode(identity.name);
    fragmentSpanMenuText.classList.add("menu-text");
    fragmentSpanMenuText.appendChild(fragmentSpanMenuTextContent);
    td.appendChild(fragmentSpanMenuText);

    // Create <img class"flag-img">
    // Note: Flag source is dynamically set via mozillaVpn.js
    const fragmentImgFlag= document.createElement("img");
    fragmentImgFlag.classList.add("page-action-flag");
    fragmentImgFlag.classList.add("flag-img");

    td.appendChild(fragmentImgFlag);
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
