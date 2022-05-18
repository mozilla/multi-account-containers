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

async function backupContainers() {
  const backupLink = document.getElementById("containers-save-link");
  const backupResult = document.getElementById("containers-save-result");
  try {
    const content = JSON.stringify(
      await browser.runtime.sendMessage({
        method: "backupIdentitiesState"
      })
    );
    backupLink.href = `data:application/json;base64,${btoa(content)}`;
    backupLink.download = `containers-backup-${(new Date()).toISOString()}.json`;
    backupLink.click();
    backupResult.textContent = "";
  } catch (err) {
    backupResult.textContent = browser.i18n.getMessage("backupFailure", [String(err.message || err)]);
    backupResult.style.color = "red";
  }
}

async function restoreContainers(event) {
  const restoreInput = event.currentTarget;
  const restoreResult = document.getElementById("containers-restore-result");
  event.preventDefault();
  if (restoreInput.files.length) {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const identitiesState = JSON.parse(reader.result);
        const { created: restoredCount, incomplete } = await browser.runtime.sendMessage({
          method: "restoreIdentitiesState",
          identities: identitiesState
        });
        if (incomplete.length === 0) {
          restoreResult.textContent = browser.i18n.getMessage("containersRestored", [String(restoredCount)]);
          restoreResult.style.color = "green";
        } else {
          restoreResult.textContent = browser.i18n.getMessage("containersPartiallyRestored", [String(restoredCount), String(incomplete.join(", "))]);
          restoreResult.style.color = "orange";
        }
      } catch (err) {
        console.error("Cannot restore containers list: %s", err.message || err);
        restoreResult.textContent = browser.i18n.getMessage("containersRestorationFailed");
        restoreResult.style.color = "red";
      }
    };
    reader.readAsText(restoreInput.files.item(0));
  }
  restoreInput.value = "";
}

async function enableDisablePageAction() {
  const checkbox = document.querySelector("#pageActionCheck");
  await browser.storage.local.set({pageActionEnabled: !!checkbox.checked});
  await browser.runtime.sendMessage({ method: "resetPageAction" });
}

async function changeTheme(event) {
  const theme = event.currentTarget;
  await browser.storage.local.set({currentTheme: theme.value});
  await browser.storage.local.set({currentThemeId: theme.selectedIndex});
}

async function setupOptions() {
  const { syncEnabled } = await browser.storage.local.get("syncEnabled");
  const { replaceTabEnabled } = await browser.storage.local.get("replaceTabEnabled");
  const { pageActionEnabled } = await browser.storage.local.get({ pageActionEnabled: true });
  const { currentThemeId } = await browser.storage.local.get("currentThemeId");

  document.querySelector("#syncCheck").checked = !!syncEnabled;
  document.querySelector("#replaceTabCheck").checked = !!replaceTabEnabled;
  document.querySelector("#pageActionCheck").checked = !!pageActionEnabled;
  document.querySelector("#changeTheme").selectedIndex = currentThemeId;
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
document.querySelector("#containersRestoreInput").addEventListener( "change", restoreContainers);
document.querySelector("#pageActionCheck").addEventListener( "change", enableDisablePageAction);
document.querySelector("#changeTheme").addEventListener( "change", changeTheme);

maybeShowPermissionsWarningIcon();
for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
  document.querySelector("#open_container_"+i)
    .addEventListener("change", storeShortcutChoice);
}

document.querySelectorAll("[data-btn-id]").forEach(btn => {
  btn.addEventListener("click", e => {
    switch (btn.dataset.btnId) {
    case "containers-save-button":
      e.preventDefault();
      backupContainers();
      break;
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
