async function load() {
  const searchParams = new URL(window.location).searchParams;
  const redirectUrl = decodeURIComponent(searchParams.get("url"));
  const cookieStoreId = searchParams.get("cookieStoreId");
  const currentCookieStoreId = searchParams.get("currentCookieStoreId");
  const redirectUrlElement = document.getElementById("redirect-url");
  redirectUrlElement.textContent = redirectUrl;
  appendFavicon(redirectUrl, redirectUrlElement);

  const container = await browser.contextualIdentities.get(cookieStoreId);
  [...document.querySelectorAll(".container-name")].forEach((containerNameElement) => {
    containerNameElement.textContent = container.name;
  });

  // If default container, button will default to normal HTML content
  if (currentCookieStoreId) {
    const currentContainer = await browser.contextualIdentities.get(currentCookieStoreId);
    document.getElementById("current-container-name").textContent = currentContainer.name;
  }

  document.getElementById("redirect-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const buttonTarget = e.explicitOriginalTarget;
    switch (buttonTarget.id) {
    case "confirm":
      confirmSubmit(redirectUrl, cookieStoreId);
      break;
    case "deny":
      denySubmit(redirectUrl);
      break;
    }
  });
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
      pageUrl: redirectUrl
    });
  }
  browser.runtime.sendMessage({
    method: "sendTelemetryPayload",
    event: "click-to-reload-page-in-container",
  });
  openInContainer(redirectUrl, cookieStoreId);
}

async function denySubmit(redirectUrl) {
  const tab = await browser.tabs.query({active: true});
  await browser.runtime.sendMessage({
    method: "exemptContainerAssignment",
    tabId: tab[0].id,
    pageUrl: redirectUrl
  });
  browser.runtime.sendMessage({
    method: "sendTelemetryPayload",
    event: "click-to-reload-page-in-same-container",
  });
  document.location.replace(redirectUrl);
}

load();

async function openInContainer(redirectUrl, cookieStoreId) {
  const tabs = await browser.tabs.query({active: true});
  await browser.tabs.create({
    cookieStoreId,
    url: redirectUrl
  });
  if (tabs.length > 0) {
    browser.tabs.remove(tabs[0].id);
  }
}
