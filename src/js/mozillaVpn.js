const MozillaVPN = {

  async handleContainerList(identities) {
    const { mozillaVpnConnected } = await browser.storage.local.get("mozillaVpnConnected");
    const { mozillaVpnInstalled } = await browser.storage.local.get("mozillaVpnInstalled");
    this.handleStatusIndicatorsInContainerLists(mozillaVpnInstalled);

    const proxies = await this.getProxies(identities);
    if (Object.keys(proxies).length === 0) {
      return;
    }

    for (const el of document.querySelectorAll("[data-cookie-store-id]")) {
      const cookieStoreId = el.dataset.cookieStoreId;
      const { proxy } = proxies[cookieStoreId];

      if (typeof(proxy) !== "undefined") {
        const flag = el.querySelector(".flag-img");
        if (proxy.countryCode) {
          flag.src = `/img/flags/${proxy.countryCode.toUpperCase()}.png`;
        }
        if (typeof(proxy.mozProxyEnabled) === "undefined" && typeof(proxy.countryCode) !== "undefined") {
          flag.classList.add("proxy-disabled");
        }
        if (!mozillaVpnConnected && proxy.mozProxyEnabled) {
          flag.classList.add("proxy-unavailable");
          const menuItemName = el.querySelector(".menu-item-name");
          if (menuItemName) {
            el.querySelector(".menu-item-name").dataset.mozProxyWarning = "proxy-unavailable";
          }
        }
      }
    }
  },

  async setStatusIndicatorIcons(mozillaVpnInstalled) {
    const { mozillaVpnConnected } = await browser.storage.local.get("mozillaVpnConnected");

    const statusIconEls = document.querySelectorAll(".moz-vpn-connection-status-indicator");

    if (!mozillaVpnInstalled) {
      statusIconEls.forEach(el => {
        el.style.backgroundImage = "none";
        if (el.querySelector(".tooltip")) {
          el.querySelector(".tooltip").textContent = "";
        }
        el.textContent = "";
      });
      return;
    }

    const connectedIndicatorSrc = "url(./img/moz-vpn-connected.svg)";
    const disconnectedIndicatorSrc = "url(./img/moz-vpn-disconnected.svg)";

    const connectionStatusStringId = mozillaVpnConnected ? "moz-vpn-connected" : "moz-vpn-disconnected";
    const connectionStatusLocalizedString = browser.i18n.getMessage(connectionStatusStringId);

    statusIconEls.forEach(el => {
      el.style.backgroundImage = mozillaVpnConnected ? connectedIndicatorSrc : disconnectedIndicatorSrc;
      if (el.querySelector(".tooltip")) {
        el.querySelector(".tooltip").textContent = connectionStatusLocalizedString;
      } else {
        el.textContent = connectionStatusLocalizedString;
      }
    });
  },

  async handleStatusIndicatorsInContainerLists(mozillaVpnInstalled) {
    const mozVpnLogotypes = document.querySelectorAll(".moz-vpn-logotype.vpn-status-container-list");

    try {
      if (!mozillaVpnInstalled) {
        mozVpnLogotypes.forEach(el => {
          el.style.display = "none";
        });
        return;
      }
      mozVpnLogotypes.forEach(el => {
        el.style.display = "flex";
        el.classList.remove("display-none");
      });
      this.setStatusIndicatorIcons(mozillaVpnInstalled);
    } catch (e) {
      mozVpnLogotypes.forEach(el => {
        el.style.display = "none";
      });
      return;
    }
  },

  handleMozillaCtaClick(buttonIdentifier) {
    browser.tabs.create({
      url: MozillaVPN.attachUtmParameters("https://www.mozilla.org/products/vpn", buttonIdentifier),
    });
  },

  getRandomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  proxyIsDisabled(proxy) {
    return (
      // Mozilla VPN proxy is disabled, last location data is stored
      (proxy.mozProxyEnabled === undefined && proxy.countryCode !== undefined && proxy.cityName !== undefined) ||
      // Mozilla VPN proxy is enabled but Mozilla VPN is not connected
      proxy.mozProxyEnabled !== undefined
    );
  },

  attachUtmParameters(baseUrl, utmContent) {
    const url = new URL(baseUrl);
    const utmParameters = {
      utm_source: "multi.account.containers",
      utm_medium: "mac-browser-addon",
      utm_content: utmContent,
      utm_campaign: "vpn-better-together",
    };

    for (const param in utmParameters) {
      url.searchParams.append(param, utmParameters[param]);
    }
    return url.href;
  },

  async getProxies(identities) {
    const { mozillaVpnInstalled } = await browser.storage.local.get("mozillaVpnInstalled");

    const proxies = {};
    if (mozillaVpnInstalled) {
      for (const identity of identities) {
        try {
          const proxy = await proxifiedContainers.retrieve(identity.cookieStoreId);
          proxies[identity.cookieStoreId] = proxy;
        } catch (e) {
          proxies[identity.cookieStoreId] = {};
        }
      }
    }
    return proxies;
  },

  getMozillaProxyInfoObj () {
    return {
      countryCode: undefined,
      cityName: undefined,
      mozProxyEnabled: undefined
    };
  },

  async getProxyWarnings(proxyObj) {
    const { mozillaVpnConnected } = await browser.storage.local.get("mozillaVpnConnected");

    if (!proxyObj) {
      return "";
    }

    const { proxy } = proxyObj;

    if (typeof(proxy) === "undefined") {
      return "";
    }

    if (typeof(proxy.mozProxyEnabled) !== "undefined" && !mozillaVpnConnected) {
      return "proxy-unavailable";
    }
  },

  async getFlag(proxyObj) {
    const { mozillaVpnConnected } = await browser.storage.local.get("mozillaVpnConnected");
    const { mozillaVpnInstalled } = await browser.storage.local.get("mozillaVpnInstalled");

    const flag = {
      imgCode: "default",
      elemClasses: "display-none",
      imgAlt: "",
    };

    if (!proxyObj) {
      return flag;
    }

    const { proxy } = proxyObj;
    if (typeof(proxy) === "undefined"  || !mozillaVpnInstalled) {
      return flag;
    }

    if (mozillaVpnInstalled && typeof(proxy.cityName) !== "undefined") {
      flag.imgCode = proxy.countryCode.toUpperCase();
      flag.imgAlt = proxy.cityName;
      flag.elemClasses = typeof(proxy.mozProxyEnabled) === "undefined" || !mozillaVpnConnected ? "proxy-disabled" : "";
    }

    return flag;
  },

  getProxy(countryCode, cityName, mozProxyEnabled, mozillaVpnServers) {
    const selectedServerCountry = mozillaVpnServers.find(({code}) => code === countryCode);
    const selectedServerCity = selectedServerCountry.cities.find(({name}) => name === cityName);
    const proxyServer = this.pickServerBasedOnWeight(selectedServerCity.servers);
    return proxifiedContainers.parseProxy(
      this.makeProxyString(proxyServer.socksName),
      {
        countryCode: countryCode,
        cityName: cityName,
        mozProxyEnabled,
      }
    );
  },

  makeProxyString(socksName) {
    return `socks://${socksName}.mullvad.net:1080`;
  },

  async pickRandomServer() {
    const { mozillaVpnServers } = await browser.storage.local.get("mozillaVpnServers");
    const randomInteger = this.getRandomInteger(0, mozillaVpnServers.length - 1);
    const randomServerCountry = mozillaVpnServers[randomInteger];

    return {
      randomServerCountryCode: randomServerCountry.code,
      randomServerCityName: randomServerCountry.cities[0].name,
    };

  },

  pickServerBasedOnWeight(serverList) {
    const filteredServerList = serverList.filter(server => typeof(server.socksName) !== "undefined" && server.socksName !== "");

    const sumWeight = filteredServerList.reduce((sum, { weight }) => sum + weight, 0);
    let randomInteger = this.getRandomInteger(0, sumWeight);

    let nextServer = {};
    for (const server of filteredServerList) {
      if (server.weight >= randomInteger) {
        return nextServer = server;
      }
      randomInteger = (randomInteger - server.weight);
    }
    return nextServer;
  }
};

window.MozillaVPN = MozillaVPN;
