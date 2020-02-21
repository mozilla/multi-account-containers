const NUMBER_OF_KEYBOARD_SHORTCUTS = 2;

async function requestPermissions() {
  const checkbox = document.querySelector("#bookmarksPermissions");
  if (checkbox.checked) {
    const granted = await browser.permissions.request({permissions: ["bookmarks"]});
    if (!granted) { 
      checkbox.checked = false; 
      return;
    }
  } else {
    await browser.permissions.remove({permissions: ["bookmarks"]});
  }
  browser.runtime.sendMessage({ method: "resetBookmarksContext" });
}

async function enableDisableSync() {
  const checkbox = document.querySelector("#syncCheck");
  if (checkbox.checked) {
    await browser.storage.local.set({syncEnabled: true});
  } else {
    await browser.storage.local.set({syncEnabled: false});
  }
  browser.runtime.sendMessage({ method: "resetSync" });
}

async function setupOptions() {
  console.log("setup")
  const hasPermission = await browser.permissions.contains({permissions: ["bookmarks"]});
  const { syncEnabled } = await browser.storage.local.get("syncEnabled");
  if (hasPermission) {
    document.querySelector("#bookmarksPermissions").checked = true;
  }
  if (syncEnabled) {
    document.querySelector("#syncCheck").checked = true;
  } else {
    document.querySelector("#syncCheck").checked = false;
  }
  setupContainerShortcutSelects();
}

async function setupContainerShortcutSelects () {
  const keyboardShortcut = browser.runtime.sendMessage({method: "getShortcuts"});
  console.log(keyboardShortcut);
  const identities = await browser.contextualIdentities.query({});
  const fragment = document.createDocumentFragment();
  const noneOption = document.createElement("option");
  noneOption.value = "none";
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
      shortcutSelect.getElementById(keyboardShortcut[shortcutKey]).selected = true;
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

document.addEventListener("DOMContentLoaded", setupOptions);
document.querySelector("#bookmarksPermissions").addEventListener( "change", requestPermissions);
document.querySelector("#syncCheck").addEventListener( "change", enableDisableSync);

for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
  document.querySelector("#open_container_"+i)
    .addEventListener("change", storeShortcutChoice);
}