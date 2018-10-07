//This object allows other scripts to access the list mapping containers to their proxies
window.proxifiedContainers = {
  //Resolves to a proxy object which can be used in the return of the listener required for browser.proxy.onRequest.addListener
  retrieve: function(cookieStoreId = null) {
    return new Promise((resolve, reject) => {
      browser.storage.local.get("proxifiedContainersKey").then((results) => {
          //Steps to test:
          //1. Is result empty? If so we must inform the caller to intialize proxifiedContainersStore with some initial info.
          //2. Is cookieStoreId null? This means the caller probably wants everything currently in the proxifiedContainersStore object store
          //3. If there doesn't exist an entry for the associated cookieStoreId, inform the caller of this
          //4. Normal operation - if the cookieStoreId exists in the map, we can simply resolve with the correct proxy value

          var results_array = results["proxifiedContainersKey"];

          if (Object.getOwnPropertyNames(results).length == 0) {
            reject({error: "uninitialized", message: ""});
          }
          
          else if(cookieStoreId == null) {
            resolve(results_array);
          }          


          else {
            var val = results_array.find(o => o.cookieStoreId === cookieStoreId);
            if(val == null) {
              reject({error: "doesnotexist", message: ""});
            }
            else {
              resolve(val);
            }
          }

        }, (error) => {
          reject({error: "internal", message: error});
        }
      );
    });
  },
  set: function(cookieStoreId, proxy, initialize = false) {
    return new Promise((resolve, reject) => {
      if(initialize === true) {
        var proxifiedContainersStore = [];
        browser.storage.local.set({proxifiedContainersKey: proxifiedContainersStore});
      }

      //Assumes proxy is a properly formatted object
      window.proxifiedContainers.retrieve().then((proxifiedContainersStore) => {

        var index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
        if(index === -1)
        {
          proxifiedContainersStore.push({cookieStoreId: cookieStoreId, proxy: proxy});
          index = proxifiedContainersStore.length - 1;
        }
        else
        {
          proxifiedContainersStore[index] = {cookieStoreId: cookieStoreId, proxy: proxy};
        }
        
        browser.storage.local.set({proxifiedContainersKey: proxifiedContainersStore});
        resolve(proxifiedContainersStore[index]);
      }, (errorObj) => {
        reject(errorObj);
      });
    });
  },
  parseProxy: function(proxy_str) {
    var regexp = /(\b(\w+):(\w+)@)?(((?:\d{1,3}\.){3}\d{1,3}\b)|(\b(\w+)(\.(\w+))+))(:(\d+))?/;
    if(regexp.test(proxy_str) !== true)
      return false;

    else
    {
      var matches = regexp.exec(proxy_str);

      var result = {
        type: "http",
        host: matches[4],
        port: parseInt(matches[11]) || 8080,
        username: matches[2] || "",
        password: matches[3] || ""
      };

      return result;
    }
  }
};
