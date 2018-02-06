function saveOptions(e) {
  e.preventDefault();
  browser.storage.local.set({
    showAllTabs : document.querySelector("#showAllTabs").checked 
  });
}

function restoreOptions() {

  function setShowAllTabs(result) {
    document.querySelector("#showAllTabs").checked = result.showAllTabs;
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }
  var key = "showAllTabs";
  var showAllTabs = browser.storage.local.get({[key]: true});
  showAllTabs.then(setShowAllTabs, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

