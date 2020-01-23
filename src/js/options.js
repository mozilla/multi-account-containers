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

async function restoreOptions() {
  const hasPermission = await browser.permissions.contains({permissions: ["bookmarks"]});
  const { syncEnabled } = await browser.storage.local.get("syncEnabled");
  console.log(syncEnabled);
  if (hasPermission) {
    document.querySelector("#bookmarksPermissions").checked = true;
  }
  if (syncEnabled) {
    document.querySelector("#syncCheck").checked = true;
  } else {
    document.querySelector("#syncCheck").checked = false;
  }
}


document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("#bookmarksPermissions").addEventListener( "change", requestPermissions);
document.querySelector("#syncCheck").addEventListener( "change", enableDisableSync);
