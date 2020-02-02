
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
  const hasPermission = await browser.permissions.contains({ permissions: ["bookmarks"] });
  if (hasPermission) {
    document.querySelector("#bookmarksPermissions").checked = true;
  }

  const backupLink = document.getElementById("containers-save-link");
  document.getElementById("containers-save-button").addEventListener("click", async () => {
    const content = JSON.stringify(
      await browser.runtime.sendMessage({
        method: "backupIdentitiesState"
      })
    );
    backupLink.href = `data:application/json;base64,${btoa(content)}`;
    backupLink.download = `containers-backup-${(new Date()).toISOString()}.json`;
    backupLink.click();
  }, { capture: true, passive: false });

  const restoreInput = document.getElementById("containers-restore-input");
  restoreInput.addEventListener("change", () => {
    if (restoreInput.files.length) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const identitiesState = JSON.parse(reader.result);
        await browser.runtime.sendMessage({
          method: "restoreIdentitiesState",
          identities: identitiesState
        });
      };
      reader.readAsText(restoreInput.files.item(0));
    }
    restoreInput.value = "";
  });
}


document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("#bookmarksPermissions").addEventListener( "change", requestPermissions);
