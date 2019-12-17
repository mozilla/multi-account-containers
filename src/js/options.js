
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

async function restoreOptions() {
  const hasPermission = await browser.permissions.contains({permissions: ["bookmarks"]});
  if (hasPermission) {
    document.querySelector("#bookmarksPermissions").checked = true;
  }
}


document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("#bookmarksPermissions").addEventListener( "change", requestPermissions);