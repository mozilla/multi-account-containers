/**
 * Firefox does not yet have the `tabGroups` API, which exposes this constant
 * to indicate that a tab is not in a tab group. But the Firefox `tabs` API
 * currently returns this constant value for `Tab.groupId`.
 * @see https://searchfox.org/mozilla-central/rev/3b95c8dbe724b10390c96c1b9dd0f12c873e2f2e/browser/components/extensions/schemas/tabs.json#235
 */
const TAB_GROUP_ID_NONE = -1;

async function load() {
  const searchParams = new URL(window.location).searchParams;
  const redirectUrl = searchParams.get("url");
  const cookieStoreId = searchParams.get("cookieStoreId");
  const currentCookieStoreId = searchParams.get("currentCookieStoreId");
  const redirectUrlElement = document.getElementById("redirect-url");
  redirectUrlElement.textContent = redirectUrl;
  appendFavicon(redirectUrl, redirectUrlElement);

  // Option for staying on the previous container
  document.getElementById("deny").addEventListener("click", (e) => {
    e.preventDefault();
    denySubmit(redirectUrl, currentCookieStoreId);
  });

  // Option for going to the default container (no container)
  document.getElementById("deny-no-container").addEventListener("click", (e) => {
    e.preventDefault();
    denySubmit(redirectUrl, currentCookieStoreId);
  });

  const container = await browser.contextualIdentities.get(cookieStoreId);
  const currentContainer = currentCookieStoreId ? await browser.contextualIdentities.get(currentCookieStoreId) : null;
  const currentContainerName = currentContainer ? setDenyButton(currentContainer.name) : setDenyButton("");

  document.querySelectorAll("[data-message-id]").forEach(el => {
    const elementData = el.dataset;
    const containerName = elementData.messageArg === "container-name" ? container.name : currentContainerName;
    el.textContent = browser.i18n.getMessage(elementData.messageId, containerName);
  });

  // Option for going to newly selected container
  document.getElementById("confirm").addEventListener("click", (e) => {
    e.preventDefault();
    confirmSubmit(redirectUrl, cookieStoreId);
  });
}

function setDenyButton(currentContainerName) {
  const buttonDeny = document.getElementById("deny");
  const buttonDenyNoContainer = document.getElementById("deny-no-container");

  if (currentContainerName) {
    buttonDenyNoContainer.style.display = "none";
    return currentContainerName;
  }
  buttonDeny.style.display = "none";
  return;
}

function appendFavicon(pageUrl, redirectUrlElement) {
  const origin = new URL(pageUrl).origin;
  const favIconElement = Utils.createFavIconElement(`${origin}/favicon.ico`);

  redirectUrlElement.prepend(favIconElement);
}

function confirmSubmit(redirectUrl, cookieStoreId) {
  const neverAsk = document.getElementById("never-ask").checked;
  // Sending neverAsk message to background to store for next time we see this process
  if (neverAsk) {
    browser.runtime.sendMessage({
      method: "neverAsk",
      neverAsk: true,
      cookieStoreId: cookieStoreId,
      pageUrl: redirectUrl
    });
  }
  openInContainer(redirectUrl, cookieStoreId);
}

/**
 * @returns {Promise<Tab>}
 */
async function getCurrentTab() {
  const tabs = await browser.tabs.query({
    active: true,
    windowId: browser.windows.WINDOW_ID_CURRENT
  });
  return tabs[0];
}

async function denySubmit(redirectUrl, currentCookieStoreId) {
  const tab = await getCurrentTab();
  const currentContainer = currentCookieStoreId ? await browser.contextualIdentities.get(currentCookieStoreId) : null;
  const neverAsk = document.getElementById("never-ask").checked;

  if (neverAsk) {
    await browser.runtime.sendMessage({
      method: "neverAsk",
      neverAsk: true,
      cookieStoreId: currentCookieStoreId,
      pageUrl: redirectUrl,
      defaultContainer: !currentContainer
    });
  }

  await browser.runtime.sendMessage({
    method: "exemptContainerAssignment",
    tabId: tab.id,
    pageUrl: redirectUrl
  });
  document.location.replace(redirectUrl);
}

load();

async function openInContainer(redirectUrl, cookieStoreId) {
  const tab = await getCurrentTab();
  const reopenedTab = await browser.tabs.create({
    index: tab.index + 1,
    cookieStoreId,
    url: redirectUrl
  });
  if (tab.groupId && tab.groupId !== TAB_GROUP_ID_NONE && browser.tabs.group) {
    // If the original tab was in a tab group, make sure that the reopened tab
    // stays in the same tab group.
    browser.tabs.group({ groupId: tab.groupId, tabIds: reopenedTab.id });
  }
  browser.tabs.remove(tab.id);
}
