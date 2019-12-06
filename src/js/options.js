
function requestPermissions() {
  const checkbox = document.querySelector("#bookmarksPermissions");
  if (checkbox.checked) {
    browser.permissions.request({permissions: ["bookmarks"]}).
      then((response) => {
        if (response) {
          browser.runtime.sendMessage({ method: "resetBookmarksContext" });
        } else {
          checkbox.checked = false;
        }
      }).
      catch((err) => {
        return err.message;
      });
  } else {
    browser.permissions.remove({permissions: ["bookmarks"]}).
      then(() => {
        browser.runtime.sendMessage({ method: "resetBookmarksContext" });
      }).
      catch((err) => {
        return err.message;
      });
  }
}

function restoreOptions() {
  browser.permissions.getAll()
    .then((permissions) => {
      if (permissions.permissions.includes("bookmarks")) {
        document.querySelector("#bookmarksPermissions").checked = true;
      }
    }).
    catch((err) => {
      return err.message;
    });
}


document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("#bookmarksPermissions").addEventListener( "change", requestPermissions);