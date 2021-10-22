// This object allows other scripts to access the list mapping containers to their proxies
proxifiedContainers = {

  // Slightly modified version of 'retrieve' which returns a direct proxy whenever an error is met.
  async retrieveFromBackground(cookieStoreId = null) {
    try {
      const success = await proxifiedContainers.retrieve(cookieStoreId);
      return success.proxy;
    } catch (e) {
      return Utils.DEFAULT_PROXY;
    }
  },

  report_proxy_error(error, identifier = null) {
    // Currently I print to console but this is inefficient
    const relevant_id_str = identifier === null ? "" : ` call supplied with id: ${identifier.toString()}`;
    browser.extension.getBackgroundPage().console.log(`proxifiedContainers error occured ${relevant_id_str}: ${JSON.stringify(error)}`);
  },

  // Resolves to a proxy object which can be used in the return of the listener required for browser.proxy.onRequest.addListener
  retrieve(cookieStoreId = null) {
    return new Promise((resolve, reject) => {
      browser.storage.local.get("proxifiedContainersKey").then((results) => {
        // Steps to test:
        // 1. Is result empty? If so we must inform the caller to intialize proxifiedContainersStore with some initial info.
        // 2. Is cookieStoreId null? This means the caller probably wants everything currently in the proxifiedContainersStore object store
        // 3. If there doesn't exist an entry for the associated cookieStoreId, inform the caller of this
        // 4. Normal operation - if the cookieStoreId exists in the map, we can simply resolve with the correct proxy value

        const results_array = results["proxifiedContainersKey"];
        if (Object.getOwnPropertyNames(results).length === 0) {
          reject({
            error: "uninitialized",
            message: ""
          });
        } else if (cookieStoreId === null) {
          resolve(results_array);
        } else {
          const val = results_array.find(o => o.cookieStoreId === cookieStoreId);

          if (typeof val !== "object" || val === null) {
            reject({
              error: "doesnotexist",
              message: ""
            });
          } else {
            resolve(val);
          }
        }

      }, (error) => {
        reject({
          error: "internal",
          message: error
        });
      }).catch((error) => {
        proxifiedContainers.report_proxy_error(error, "proxified-containers.js: error 1");
      });
    });
  },

  async set(cookieStoreId, proxy, initialize = false) {
    if (initialize === true) {
      const proxifiedContainersStore = [];
      proxifiedContainersStore.push({
        cookieStoreId: cookieStoreId,
        proxy: proxy
      });
      await browser.storage.local.set({
        proxifiedContainersKey: proxifiedContainersStore
      });
      return proxy;
    }
    // Assumes proxy is a properly formatted object
    const proxifiedContainersStore = await proxifiedContainers.retrieve();
    let index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    if (index === -1) {
      proxifiedContainersStore.push({
        cookieStoreId: cookieStoreId,
        proxy: proxy
      });
      index = proxifiedContainersStore.length - 1;
    } else {
      proxifiedContainersStore[index] = {
        cookieStoreId: cookieStoreId,
        proxy: proxy
      };
    }
    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });
    return proxifiedContainersStore[index];
  },


  // Parses a proxy description string of the format type://host[:port] or type://username:password@host[:port] (port is optional)
  parseProxy(proxy_str, mozillaVpnData = null) {
    const proxyRegexp = /(?<type>(https?)|(socks4?)):\/\/(\b(?<username>\w+):(?<password>\w+)@)?(?<host>((?:\d{1,3}\.){3}\d{1,3}\b)|(\b([\w.-]+)+))(:(?<port>\d+))?/;
    const matches = proxyRegexp.exec(proxy_str);
    if (!matches) {
      return false;
    }

    if (mozillaVpnData && mozillaVpnData.mozProxyEnabled === undefined) {
      matches.groups.type = "direct";
    }

    if (!mozillaVpnData) {
      mozillaVpnData = MozillaVPN.getMozillaProxyInfoObj();
    }

    return {...matches.groups,...mozillaVpnData};
  },

  // Deletes the proxy information object for a specified cookieStoreId [useful for cleaning]
  async delete(cookieStoreId) {
    // Assumes proxy is a properly formatted object
    const proxifiedContainersStore = await proxifiedContainers.retrieve();
    const index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    if (index !== -1) {
      proxifiedContainersStore.splice(index, 1);
    }
    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });
  }
};
