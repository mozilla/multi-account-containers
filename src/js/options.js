const NUMBER_OF_KEYBOARD_SHORTCUTS = 10;

async function setUpCheckBoxes() {
  document.querySelectorAll("[data-permission-id]").forEach(async(el) => {
    const permissionId = el.dataset.permissionId;
    const permissionEnabled = await browser.permissions.contains({ permissions: [permissionId] });
    el.checked = !!permissionEnabled;
  });
}

function disablePermissionsInputs() {
  document.querySelectorAll("[data-permission-id").forEach(el => {
    el.disabled = true;
  });
}

function enablePermissionsInputs() {
  document.querySelectorAll("[data-permission-id").forEach(el => {
    el.disabled = false;
  });
}

document.querySelectorAll("[data-permission-id").forEach(async(el) => {
  const permissionId = el.dataset.permissionId;
  el.addEventListener("change", async() => {
    if (el.checked) {
      disablePermissionsInputs();
      const granted = await browser.permissions.request({ permissions: [permissionId] });
      if (!granted) {
        el.checked = false;
        enablePermissionsInputs();
      }
      return;
    }
    await browser.permissions.remove({ permissions: [permissionId] });
  });
});

async function maybeShowPermissionsWarningIcon() {
  const bothMozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();
  const permissionsWarningEl = document.querySelector(".warning-icon");
  permissionsWarningEl.classList.toggle("show-warning", !bothMozillaVpnPermissionsEnabled);
}

async function enableDisableSync() {
  const checkbox = document.querySelector("#syncCheck");
  await browser.storage.local.set({syncEnabled: !!checkbox.checked});
  browser.runtime.sendMessage({ method: "resetSync" });
}

async function enableDisableReplaceTab() {
  const checkbox = document.querySelector("#replaceTabCheck");
  await browser.storage.local.set({replaceTabEnabled: !!checkbox.checked});
}

async function setupOptions() {
  const { syncEnabled } = await browser.storage.local.get("syncEnabled");
  const { replaceTabEnabled } = await browser.storage.local.get("replaceTabEnabled");
  document.querySelector("#syncCheck").checked = !!syncEnabled;
  document.querySelector("#replaceTabCheck").checked = !!replaceTabEnabled;
  setupContainerShortcutSelects();
}

async function setupContainerShortcutSelects () {
  const keyboardShortcut = await browser.runtime.sendMessage({method: "getShortcuts"});
  const identities = await browser.contextualIdentities.query({});
  const fragment = document.createDocumentFragment();
  const noneOption = document.createElement("option");
  noneOption.value = "none";
  noneOption.id = "none";
  noneOption.textContent = "None";
  fragment.append(noneOption);

  for (const identity of identities) {
    const option = document.createElement("option");
    option.value = identity.cookieStoreId;
    option.id = identity.cookieStoreId;
    option.textContent = identity.name;
    fragment.append(option);
  }

  for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
    const shortcutKey = "open_container_"+i;
    const shortcutSelect = document.getElementById(shortcutKey);
    shortcutSelect.appendChild(fragment.cloneNode(true));
    if (keyboardShortcut && keyboardShortcut[shortcutKey]) {
      const cookieStoreId = keyboardShortcut[shortcutKey];
      shortcutSelect.querySelector("#" + cookieStoreId).selected = true;
    }
  }
}

function storeShortcutChoice (event) {
  browser.runtime.sendMessage({
    method: "setShortcut",
    shortcut: event.target.id,
    cookieStoreId: event.target.value
  });
}

function resetOnboarding() {
  browser.storage.local.set({"onboarding-stage": 0});
}

async function resetPermissionsUi() {
  await maybeShowPermissionsWarningIcon();
  await setUpCheckBoxes();
  enablePermissionsInputs();
}

browser.permissions.onAdded.addListener(resetPermissionsUi);
browser.permissions.onRemoved.addListener(resetPermissionsUi);

document.addEventListener("DOMContentLoaded", setupOptions);
document.querySelector("#syncCheck").addEventListener( "change", enableDisableSync);
document.querySelector("#replaceTabCheck").addEventListener( "change", enableDisableReplaceTab);
maybeShowPermissionsWarningIcon();
for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
  document.querySelector("#open_container_"+i)
    .addEventListener("change", storeShortcutChoice);
}

document.querySelectorAll("[data-btn-id]").forEach(btn => {
  btn.addEventListener("click", () => {
    switch (btn.dataset.btnId) {
    case "reset-onboarding":
      resetOnboarding();
      break;
    case "moz-vpn-learn-more":
      browser.tabs.create({
        url: MozillaVPN.attachUtmParameters("https://support.mozilla.org/kb/protect-your-container-tabs-mozilla-vpn", "options-learn-more")
      });
      break;
    }
  });
});
resetPermissionsUi();
