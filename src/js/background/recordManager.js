const recordManager = {
  recording: undefined,
  listening: undefined,

  Recording: class {
    constructor(tab) {
      if (tab) {
        this.windowId    = tab.windowId;
        this.tabId       = tab.id;
        this.isTabActive = tab.active;
        this.isTabReady  = tab.url.startsWith("http");
        this.tabMessage  = {};
      } else {
        this.windowId    = browser.windows.WINDOW_ID_NONE;
        this.tabId       = browser.tabs.TAB_ID_NONE;
        this.isTabActive = false;
        this.isTabReady  = false;
        this.tabMessage  = undefined;
      }
    }

    get valid() { return this.tabId !== browser.tabs.TAB_ID_NONE; }

    updateTabPopup(active, opts) {
      if (this.valid) { this.tabMessage.popup = active; this.updateTabPopupOptions(opts); }
    }

    updateTabPopupOptions(opts) {
      if (this.valid) { Object.assign(this.tabMessage.popupOptions, opts); }
    }

    async sendTabMessage() {
      return messageHandler.sendTabMessage(this.tabId, this.tabMessage);
    }

    async stop() {
      if (!this.valid) { return; }

      recordManager.listening.enabled = false;

      // Update GUI
      this.tabMessage = { recording: false, popup: false };
      const tab = await backgroundLogic.getTabOrNull(this.tabId);
      // Don't try to send "stop recording" message to tab if already closed or showing an invalid page
      if (tab && tab.url) {
        return this.sendTabMessage();
      }
    }

    async start() {
      if (!this.valid) { return; }

      recordManager.listening.enabled = true;

      // Update GUI
      const baPopup = messageHandler.browserAction.popup;
      const showTabPopup = this.isTabActive && (!baPopup || baPopup.windowId !== this.windowId);
      this.tabMessage = { recording: true, popup: showTabPopup, popupOptions: {tabId: this.tabId, hide:!showTabPopup} };
      const showingPage = this.isTabReady
        ? Promise.resolve()
        : browser.tabs.update(this.tabId, { url: browser.runtime.getURL("/recording.html") });
      const messagingTab = this.sendTabMessage();

      return Promise.all([showingPage, messagingTab]);
    }

    // Re-show recording state on page load
    onTabsUpdated(tabId, changeInfo) {
      if (this.tabId === tabId && changeInfo.status === "complete") {
        this.sendTabMessage();
      }
    }

    // Show/hide tabPopup on this tab show/hide
    onTabsActivated(activeInfo) {
      if (this.tabId === activeInfo.tabId) {
        this.isTabActive = true;
        this.sendTabMessage();
      } else if (this.windowId === activeInfo.windowId) {
        this.isTabActive = false;
      }
    }

    // Keep track of tab's windowId
    onTabsAttached(tabId, attachInfo) {
      if (this.tabId === tabId) {
        this.windowId = attachInfo.newWindowId;
      }
    }

    // Stop recording on close
    onTabsRemoved(tabId) {
      if (this.tabId === tabId) {
        recordManager.setTabId(browser.tabs.TAB_ID_NONE);
      }
    }

    // Show/hide tabPopup on hide/show browserActionPopup
    onToggleBrowserActionPopup(baPopupVisible, baPopup) {
      if (this.windowId === baPopup.windowId && this.isTabActive) {
        const showTabPopup = !baPopupVisible;
        this.updateTabPopup(showTabPopup, { width:baPopup.width, height:baPopup.height, hide:!showTabPopup });
        this.sendTabMessage();
      }
    }
  },

  Listening: class {
    constructor() {
      this._enabled = false;
    }

    get enabled() { return this._enabled; }

    set enabled(enabled) {
      if (this._enabled === !!enabled) { return; }
      this._enabled = !!enabled;

      if (enabled) {
        browser.tabs.onUpdated.addListener(this.onTabsUpdated, { properties: ["status"] });
        browser.tabs.onActivated.addListener(this.onTabsActivated);
        browser.tabs.onAttached.addListener(this.onTabsAttached);
        browser.tabs.onRemoved.addListener(this.onTabsRemoved);
        window.addEventListener("BrowserActionPopupLoad", this.onBrowserActionPopupLoad);
        window.addEventListener("BrowserActionPopupUnload", this.onBrowserActionPopupUnload);
      } else {
        browser.tabs.onUpdated.removeListener(this.onTabsUpdated);
        browser.tabs.onActivated.removeListener(this.onTabsActivated);
        browser.tabs.onAttached.removeListener(this.onTabsAttached);
        browser.tabs.onRemoved.removeListener(this.onTabsRemoved);
        window.removeEventListener("BrowserActionPopupLoad", this.onBrowserActionPopupLoad);
        window.removeEventListener("BrowserActionPopupUnload", this.onBrowserActionPopupUnload);
      }
    }

    onTabsUpdated(...args)       { recordManager.recording.onTabsUpdated(...args); }
    onTabsActivated(...args)     { recordManager.recording.onTabsActivated(...args); }
    onTabsAttached(...args)      { recordManager.recording.onTabsAttached(...args); }
    onTabsRemoved(...args)       { recordManager.recording.onTabsRemoved(...args); }
    onBrowserActionPopupLoad()   { recordManager.recording.onToggleBrowserActionPopup(true, messageHandler.browserAction.popup); }
    onBrowserActionPopupUnload() { recordManager.recording.onToggleBrowserActionPopup(false, messageHandler.browserAction.popup); }
  },

  init() {
    this.recording = new recordManager.Recording();
    this.listening = new recordManager.Listening();
  },

  isRecordingTabId(tabId) {
    if (!this.recording.valid) { return false; }
    if (this.recording.tabId !== tabId) { return false; }
    return true;
  },

  getTabId() {
    return this.recording.tabId;
  },

  async setTabId(tabId) {
    // Ensure tab is recordable
    tabId = backgroundLogic.asTabId(tabId);
    const tab = await backgroundLogic.getTabOrNull(tabId);
    const wantRecordableTab = tabId !== browser.tabs.TAB_ID_NONE;
    const isRecordableTab = tab && "cookieStoreId" in tab;

    // Invalid tab - stop recording & throw error
    if (wantRecordableTab && !isRecordableTab) {
      this.setTabId(browser.tabs.TAB_ID_NONE); // Don't wait for stop
      throw new Error(`Recording not possible for tab with id ${tabId}`);
    }

    // Already recording
    if (this.recording.tabId === tabId) { return; }

    const oldRecording = this.recording;
    const newRecording = this.recording = new recordManager.Recording(tab);

    // Don't wait for stop
    if (oldRecording.valid) { oldRecording.stop(); }
    try {
      // But DO wait for start
      if (newRecording.valid) { await newRecording.start(); }

    // If error while starting, immediately stop, but don't wait
    } catch (e) {
      this.setTabId(browser.tabs.TAB_ID_NONE);
      throw e;
    }
  },

  async setTabPopupPosition(tabId, x, y) {
    if (this.isRecordingTabId(tabId)) { this.recording.updateTabPopupOptions({x,y}); }
  }
};

recordManager.init();