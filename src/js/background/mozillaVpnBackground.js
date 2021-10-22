const MozillaVPN_Background = {
  MOZILLA_VPN_INSTALLED_KEY: "mozillaVpnInstalled",
  MOZILLA_VPN_CONNECTED_KEY: "mozillaVpnConnected",
  MOZILLA_VPN_COLLAPSE_EDIT_CONTAINER_TOUT_KEY: "mozillaVpnCollapseEditContainerTout",
  MOZILLA_VPN_HIDE_MAIN_TOUT_KEY: "mozillaVpnHideMainTout",
  MOZILLA_VPN_SERVERS_KEY: "mozillaVpnServers",

  _isolationKey: 0,

  async maybeInitPort() {
    if (this.port && this.port.error === null) {
      return;
    }
    try {
      /*
          Find a way to not spam the console when MozillaVPN client is not installed
          File at path ".../../MozillaVPN/..." is not executable.` thrown by resource://gre/modules/Subprocess.jsm:152`
          Which does is not caught by this try/catch
      */
      this.port = await browser.runtime.connectNative("mozillavpn");
      await browser.storage.local.set({ [this.MOZILLA_VPN_INSTALLED_KEY]: true});
      this.port.onMessage.addListener(response => this.handleResponse(response));

      this.postToApp("status");
      this.postToApp("servers");

      // When the mozillavpn dies or the VPN disconnects, we need to increase
      // the isolation key in order to create new proxy connections. Otherwise
      // we could see random timeout when the browser tries to connect to an
      // invalid proxy connection.
      this.port.onDisconnect.addListener(() => this.increaseIsolationKey());

    } catch(e) {
      browser.storage.local.set({ [this.MOZILLA_VPN_INSTALLED_KEY]: false });
      browser.storage.local.set({ [this.MOZILLA_VPN_CONNECTED_KEY]: false });
    }
  },

  async init() {
    const mozillaVpnConnected = await browser.storage.local.get(this.MOZILLA_VPN_CONNECTED_KEY);
    if (typeof(mozillaVpnConnected) === "undefined") {
      browser.storage.local.set({ [this.MOZILLA_VPN_CONNECTED_KEY]: false });
      browser.storage.local.set({ [this.MOZILLA_VPN_INSTALLED_KEY]: false });
      browser.storage.local.set({ [this.MOZILLA_VPN_SERVERS_KEY]: [] });
      browser.storage.local.set({ [this.MOZILLA_VPN_HIDE_MAIN_TOUT_KEY]: false });
      browser.storage.local.set({ [this.MOZILLA_VPN_COLLAPSE_EDIT_CONTAINER_TOUT_KEY]: false });
    }
    this.maybeInitPort();
  },


  // Post messages to MozillaVPN client
  postToApp(message) {
    try {
      this.port.postMessage({t: message});
    } catch(e) {
      if (e.message === "Attempt to postMessage on disconnected port") {
        browser.storage.local.set({ [this.MOZILLA_VPN_INSTALLED_KEY]: false });
        browser.storage.local.set({ [this.MOZILLA_VPN_CONNECTED_KEY]: false });
      }
    }
  },

  // Handle responses from MozillaVPN client
  async handleResponse(response) {
    if (response.error && response.error === "vpn-client-down") {
      browser.storage.local.set({ [MozillaVPN_Background.MOZILLA_VPN_CONNECTED_KEY]: false });
      this.increaseIsolationKey();
      return;
    }
    if (response.servers) {
      const servers = response.servers.countries;
      browser.storage.local.set({ [MozillaVPN_Background.MOZILLA_VPN_SERVERS_KEY]: servers});
      return;
    }

    if ((response.status && response.status.vpn) || response.t === "status") {
      browser.storage.local.set({ [MozillaVPN_Background.MOZILLA_VPN_INSTALLED_KEY]: true });

      const status = response.status ? response.status.vpn : response.vpn;

      if (status === "StateOn") {
        browser.storage.local.set({ [MozillaVPN_Background.MOZILLA_VPN_CONNECTED_KEY]: true });
      }

      if (status === "StateOff" || status === "StateDisconnecting") {
        browser.storage.local.set({ [MozillaVPN_Background.MOZILLA_VPN_CONNECTED_KEY]: false });
      }

      // Let's increase the network key isolation at any vpn status change.
      this.increaseIsolationKey();
    }
  },

  increaseIsolationKey() {
    ++this._isolationKey;
  },

  get isolationKey() {
    return this._isolationKey;
  },
};

MozillaVPN_Background.init();
