const MozillaVPN_Background = {
  MOZILLA_VPN_SERVERS_KEY: "mozillaVpnServers",
  MOZILLA_VPN_HIDDEN_TOUTS_LIST_KEY: "mozillaVpnHiddenToutsList",

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
      this.port.onMessage.addListener(response => this.handleResponse(response));

      this.port.onMessage.addListener(this.handleResponse);
      this.postToApp("status");
      this.postToApp("servers");

      // When the mozillavpn dies or the VPN disconnects, we need to increase
      // the isolation key in order to create new proxy connections. Otherwise
      // we could see random timeout when the browser tries to connect to an
      // invalid proxy connection.
      this.port.onDisconnect.addListener(() => this.increaseIsolationKey());

    } catch(e) {
      this._installed = false;
      this._connected = false;
    }
  },

  async init() {
    const { mozillaVpnServers } = await browser.storage.local.get(this.MOZILLA_VPN_SERVERS_KEY);
    if (typeof(mozillaVpnServers) === "undefined") {
      await browser.storage.local.set({ [this.MOZILLA_VPN_SERVERS_KEY]:[] });
      await browser.storage.local.set({ [this.MOZILLA_VPN_HIDDEN_TOUTS_LIST_KEY]:[] });
      this._installed = false;
      this._connected = false;
    }
    this.maybeInitPort();
  },

  async getConnectionStatus() {
    return this._connected;
  },

  async getInstallationStatus() {
    return this._installed;
  },

  // Post messages to MozillaVPN client
  postToApp(message) {
    try {
      this.port.postMessage({t: message});
    } catch(e) {
      if (e.message === "Attempt to postMessage on disconnected port") {
        this._installed = false;
        this._connected = false;
      }
    }
  },

  // Handle responses from MozillaVPN client
  async handleResponse(response) {
    if (response.error && response.error === "vpn-client-down") {
      MozillaVPN_Background._connected = false;
      return;
    }
    MozillaVPN_Background._installed = true;
    if (response.servers) {
      const servers = response.servers.countries;
      browser.storage.local.set({ [MozillaVPN_Background.MOZILLA_VPN_SERVERS_KEY]: servers});
      return;
    }

    if ((response.status && response.status.vpn) || response.t === "status") {
      const status = response.status ? response.status.vpn : response.vpn;

      if (status === "StateOn") {
        MozillaVPN_Background._connected = true;
      }

      if (status === "StateOff" || status === "StateDisconnecting") {
        MozillaVPN_Background._connected = false;
      }

      // Let's increase the network key isolation at any vpn status change.
      MozillaVPN_Background.increaseIsolationKey();
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
