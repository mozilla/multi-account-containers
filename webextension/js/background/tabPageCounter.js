// eslint-disable-next-line no-unused-vars
const tabPageCounter = {
  counters: {},

  initTabCounter(tab) {
    if (tab.id in this.counters) {
      if (!("activity" in this.counters[tab.id])) {
        this.counters[tab.id].activity = {
          "cookieStoreId": tab.cookieStoreId,
          "pageRequests": 0
        };
      }
      if (!("tab" in this.counters[tab.id])) {
        this.counters[tab.id].tab = {
          "cookieStoreId": tab.cookieStoreId,
          "pageRequests": 0
        };
      }
    } else {
      this.counters[tab.id] = {};
      this.counters[tab.id].tab = {
        "cookieStoreId": tab.cookieStoreId,
        "pageRequests": 0
      };
      this.counters[tab.id].activity = {
        "cookieStoreId": tab.cookieStoreId,
        "pageRequests": 0
      };
    }
  },

  sendTabCountAndDelete(tabId, why = "user-closed-tab") {
    if (!(this.counters[tabId])) {
      return;
    }
    if (why === "user-closed-tab" && this.counters[tabId].tab) {
      // When we send the ping because the user closed the tab,
      // delete both the 'tab' and 'activity' counters
      delete this.counters[tabId];
    } else if (why === "user-went-idle" && this.counters[tabId].activity) {
      // When we send the ping because the user went idle,
      // only reset the 'activity' counter
      this.counters[tabId].activity = {
        "cookieStoreId": this.counters[tabId].tab.cookieStoreId,
        "pageRequests": 0
      };
    }
  },

  incrementTabCount(tab) {
    this.initTabCounter(tab);
    this.counters[tab.id].tab.pageRequests++;
    this.counters[tab.id].activity.pageRequests++;
  }
};
