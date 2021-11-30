const MozillaVPN = {

  async handleContainerList(identities) {
    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
    const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });
    this.handleStatusIndicatorsInContainerLists(mozillaVpnInstalled);

    const proxies = await this.getProxies(identities);
    if (Object.keys(proxies).length === 0) {
      return;
    }

    const tooltipProxyWarning = browser.i18n.getMessage("tooltipWarning");
    for (const el of document.querySelectorAll("[data-cookie-store-id]")) {
      const cookieStoreId = el.dataset.cookieStoreId;

      if (!proxies[cookieStoreId]) {
        continue;
      }
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
          const tooltip = el.querySelector(".tooltip.proxy-unavailable");
          if (tooltip) {
            tooltip.textContent = tooltipProxyWarning;
          }
          const menuItemName = el.querySelector(".menu-item-name");
          if (menuItemName) {
            el.querySelector(".menu-item-name").dataset.mozProxyWarning = "proxy-unavailable";
          }
        }
      }
    }
  },

  async setStatusIndicatorIcons(mozillaVpnInstalled) {

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

    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
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
    const proxies = {};
    const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });

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

  getMozillaProxyInfoObj() {
    return {
      countryCode: undefined,
      cityName: undefined,
      mozProxyEnabled: undefined
    };
  },

  async requiredPermissionsEnabled() {
    const proxyPermissionEnabled = await browser.permissions.contains({ permissions: ["proxy"] });
    const nativeMessagingPermissionEnabled = await browser.permissions.contains({ permissions: ["nativeMessaging"] });
    return (proxyPermissionEnabled && nativeMessagingPermissionEnabled);
  },


  async getProxyWarnings(proxyObj) {
    if (!proxyObj) {
      return "";
    }

    const { proxy } = proxyObj;

    if (typeof(proxy) === "undefined") {
      return "";
    }

    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
    if (typeof(proxy.mozProxyEnabled) !== "undefined" && !mozillaVpnConnected) {
      return "proxy-unavailable";
    }
  },

  async getFlag(proxyObj) {
    const flag = {
      imgCode: "default",
      elemClasses: "display-none",
      imgAlt: "",
    };

    if (!proxyObj) {
      return flag;
    }

    const { proxy } = proxyObj;
    const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });
    if (typeof(proxy) === "undefined"  || !mozillaVpnInstalled) {
      return flag;
    }

    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
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

  async pickRandomLocation() {
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
  },
};

window.MozillaVPN = MozillaVPN;
