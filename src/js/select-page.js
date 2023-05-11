async function load() {
  const searchParams = new URL(window.location).searchParams;
  const redirectUrl = searchParams.get("url");
  const redirectUrlElement = document.getElementById("redirect-url");
  redirectUrlElement.textContent = redirectUrl;
  appendFavicon(redirectUrl, redirectUrlElement);

  const identities = await browser.contextualIdentities.query({});
  const redirectFormElement = document.getElementById("redirect-identities");
  
  identities.forEach(identity => {
    const cookieStoreId = identity.cookieStoreId;
    var containerButtonElement = document.createElement("button");
    containerButtonElement.classList.add("button");
    containerButtonElement.id = "container-" + identity.name;
    containerButtonElement.setAttribute("container-id", cookieStoreId);
    containerButtonElement.addEventListener("click", e => {
      e.preventDefault();
      selectContainer(redirectUrl, identity)
    })
    var containerIconElement = document.createElement("img");
    containerIconElement.src = identity.iconUrl;
    containerIconElement.alt = identity.icon;
    containerIconElement.style.fill = identity.colorCode;
    var containerLabelElement = document.createElement("label");
    containerLabelElement.textContent = identity.name;
    containerButtonElement.appendChild(containerIconElement);
    containerButtonElement.appendChild(containerLabelElement);
    redirectFormElement.appendChild(containerButtonElement);
  })

  document.querySelectorAll("[data-message-id]").forEach(el => {
    const elementData = el.dataset;
    el.textContent = browser.i18n.getMessage(elementData.messageId);
  });
}

function appendFavicon(pageUrl, redirectUrlElement) {
  const origin = new URL(pageUrl).origin;
  const favIconElement = Utils.createFavIconElement(`${origin}/favicon.ico`);

  redirectUrlElement.prepend(favIconElement);
}

function getCurrentTab() {
  return browser.tabs.query({
    active: true,
    windowId: browser.windows.WINDOW_ID_CURRENT
  });
}

load();

function selectContainer(redirectUrl, identity){
  const neverAsk = document.getElementById("never-ask").checked;
  if (neverAsk) {
    assignContainer(redirectUrl, identity);
  }
  openInContainer(redirectUrl, identity.cookieStoreId);
}

async function openInContainer(redirectUrl, cookieStoreId) {
  const tab = await getCurrentTab();
  await browser.tabs.create({
    index: tab[0].index + 1,
    cookieStoreId,
    url: redirectUrl
  });
  if (tab.length > 0) {
    browser.tabs.remove(tab[0].id);
  }
}

async function assignContainer(redirectUrl, identity) {
  const currentTab = await Utils.currentTab();
  const assignedUserContextId = Utils.userContextId(identity.cookieStoreId);
  await Utils.setOrRemoveAssignment(
    null,
    redirectUrl,
    assignedUserContextId,
    false
  );
}