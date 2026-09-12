// This object allows other scripts to access the list mapping containers to their proxies
proxifiedContainers = {

  async retrieveAll() {
    const result = await browser.storage.local.get("proxifiedContainersKey");
    if(!result || !result["proxifiedContainersKey"]) {
      return null;
    }

    return result["proxifiedContainersKey"];
  },

  async retrieve(cookieStoreId) {
    const result = await this.retrieveAll();
    if(!result) {
      return null;
    }

    return result.find(o => o.cookieStoreId === cookieStoreId);
  },

  async set(cookieStoreId, proxy) {
    // Assumes proxy is a properly formatted object
    let proxifiedContainersStore = await proxifiedContainers.retrieveAll();
    if (!proxifiedContainersStore) proxifiedContainersStore = [];

    const index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    if (index === -1) {
      proxifiedContainersStore.push({
        cookieStoreId: cookieStoreId,
        proxy: proxy
      });
    } else {
      proxifiedContainersStore[index] = {
        cookieStoreId: cookieStoreId,
        proxy: proxy
      };
    }

    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });
  },

  // Parses a proxy description string of the format type://host[:port] or type://username:password@host[:port] (port is optional)
  parseProxy(proxy_str, mozillaVpnData = null) {
    const proxyRegexp = /^(?<type>https?|socks4?):\/\/(?:(?<username>[^\s:@/?#]+):(?<password>[^\s@/?#]+)@)?(?<host>[\w.-]+)(?::(?<port>\d+))?$/;
    const matches = proxyRegexp.exec(proxy_str);
    if (!matches) {
      return false;
    }

    try {
      if (matches.groups.username !== undefined) {
        matches.groups.username = decodeURIComponent(matches.groups.username);
        matches.groups.password = decodeURIComponent(matches.groups.password);
      }
      if (
        (matches.groups.type === "http" || matches.groups.type === "https") &&
        matches.groups.username && matches.groups.password
      ) {
        // Basic authentication uses the first colon to separate the username.
        if (matches.groups.username.includes(":")) return false;
        matches.groups.proxyAuthorizationHeader =
          "Basic " + btoa(matches.groups.username + ":" + matches.groups.password);
        delete matches.groups.username;
        delete matches.groups.password;
      }
    } catch {
      return false;
    }

    if (mozillaVpnData && mozillaVpnData.mozProxyEnabled === undefined) {
      matches.groups.type = null;
    }

    if (!mozillaVpnData) {
      mozillaVpnData = MozillaVPN.getMozillaProxyInfoObj();
    }

    return {...matches.groups,...mozillaVpnData};
  },

  // Deletes the proxy information object for a specified cookieStoreId [useful for cleaning]
  async delete(cookieStoreId) {
    // Assumes proxy is a properly formatted object
    const proxifiedContainersStore = await proxifiedContainers.retrieveAll();
    if(!proxifiedContainersStore) {
      return null;
    }

    const index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    if (index !== -1) {
      proxifiedContainersStore.splice(index, 1);
    }
    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });
  }
};
