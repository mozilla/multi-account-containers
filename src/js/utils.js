/*global getBogusProxy */

const DEFAULT_FAVICON = "/img/blank-favicon.svg";

// eslint-disable-next-line
const CONTAINER_ORDER_STORAGE_KEY = "container-order";

// TODO use export here instead of globals
const Utils = {

  createFavIconElement(url) {
    const imageElement = document.createElement("img");
    imageElement.classList.add("icon", "offpage", "menu-icon");
    imageElement.src = url;
    const loadListener = (e) => {
      e.target.classList.remove("offpage");
      e.target.removeEventListener("load", loadListener);
      e.target.removeEventListener("error", errorListener);
    };
    const errorListener = (e) => {
      e.target.src = DEFAULT_FAVICON;
    };
    imageElement.addEventListener("error", errorListener);
    imageElement.addEventListener("load", loadListener);
    return imageElement;
  },

  // See comment in PR #313 - so far the (hacky) method being used to block proxies is to produce a sufficiently long random address
  getBogusProxy() {
    const bogusFailover = 1;
    const bogusType = "socks4";
    const bogusPort = 9999;
    const bogusUsername = "foo";
    if(typeof window.Utils.pregeneratedString !== "undefined")
    {
      return {type:bogusType, host:`w.${window.Utils.pregeneratedString}.coo`, port:bogusPort, username:bogusUsername, failoverTimeout:bogusFailover};
    }
    else
    {
      // Initialize Utils.pregeneratedString
      window.Utils.pregeneratedString = "";

      // We generate a cryptographically random string (of length specified in bogusLength), but we only do so once - thus negating any time delay caused
      const bogusLength = 8;
      const array = new Uint8Array(bogusLength);
      window.crypto.getRandomValues(array);
      for(let i = 0; i < bogusLength; i++)
      {
        const s = array[i].toString(16);
        if(s.length === 1)
          window.Utils.pregeneratedString += `0${s}`;
        else
          window.Utils.pregeneratedString += s;
      }

      // The only issue with this approach is that if (for some unknown reason) pregeneratedString is not saved, it will result in an infinite loop - but better than a privacy leak!
      return getBogusProxy();
    }
  },

  /**
 * Escapes any occurances of &, ", <, > or / with XML entities.
 *
 * @param {string} str
 *        The string to escape.
 * @return {string} The escaped string.
 */
  escapeXML(str) {
    const replacements = { "&": "&amp;", "\"": "&quot;", "'": "&apos;", "<": "&lt;", ">": "&gt;", "/": "&#x2F;" };
    return String(str).replace(/[&"'<>/]/g, m => replacements[m]);
  },

  /**
 * A tagged template function which escapes any XML metacharacters in
 * interpolated values.
 *
 * @param {Array<string>} strings
 *        An array of literal strings extracted from the templates.
 * @param {Array} values
 *        An array of interpolated values extracted from the template.
 * @returns {string}
 *        The result of the escaped values interpolated with the literal
 *        strings.
 */
  escaped(strings, ...values) {
    const result = [];

    for (const [i, string] of strings.entries()) {
      result.push(string);
      if (i < values.length)
        result.push(this.escapeXML(values[i]));
    }

    return result.join("");
  },

  /**
   * @returns {Promise<Tab|false>}
   */
  async currentTab() {
    const activeTabs = await browser.tabs.query({ active: true, windowId: browser.windows.WINDOW_ID_CURRENT });
    if (activeTabs.length > 0) {
      return activeTabs[0];
    }
    return false;
  },

  addEnterHandler(element, handler) {
    element.addEventListener("click", (e) => {
      handler(e);
    });
    element.addEventListener("keydown", (e) => {
      if (e.keyCode === 13) {
        e.preventDefault();
        handler(e);
      }
    });
  },

  addEnterOnlyHandler(element, handler) {
    element.addEventListener("keydown", (e) => {
      if (e.keyCode === 13) {
        e.preventDefault();
        handler(e);
      }
    });
  },

  userContextId(cookieStoreId = "") {
    const userContextId = cookieStoreId.replace("firefox-container-", "");
    return (userContextId !== cookieStoreId) ? Number(userContextId) : false;
  },

  setOrRemoveAssignment(tabId, url, userContextId, value) {
    return browser.runtime.sendMessage({
      method: "setOrRemoveAssignment",
      tabId,
      url,
      userContextId,
      value
    });
  },

  resetCookiesForSite(pageUrl, cookieStoreId) {
    return browser.runtime.sendMessage({ 
      method: "resetCookiesForSite", 
      pageUrl,
      cookieStoreId,
    });
  },

  /**
   * @param {string} url
   * @param {string} currentUserContextId
   * @param {string} newUserContextId
   * @param {number} tabIndex
   * @param {boolean} active
   * @param {number} [groupId]
   * @returns {Promise<any>}
   */
  async reloadInContainer(url, currentUserContextId, newUserContextId, tabIndex, active, groupId = undefined) {
    return await browser.runtime.sendMessage({
      method: "reloadInContainer",
      url,
      currentUserContextId,
      newUserContextId,
      tabIndex,
      active,
      groupId
    });
  },

  async alwaysOpenInContainer(identity) {
    const currentTab = await this.currentTab();
    const assignedUserContextId = this.userContextId(identity.cookieStoreId);
    if (currentTab.cookieStoreId !== identity.cookieStoreId) {
      return await browser.runtime.sendMessage({
        method: "assignAndReloadInContainer",
        url: currentTab.url,
        currentUserContextId: false,
        newUserContextId: assignedUserContextId,
        tabIndex: currentTab.index +1,
        active: currentTab.active,
        groupId: currentTab.groupId
      });
    }
    await Utils.setOrRemoveAssignment(
      currentTab.id,
      currentTab.url,
      assignedUserContextId,
      false
    );
  },

  async removeAlwaysOpenInContainer() {
    const currentTab = await this.currentTab();
    const currentTabUserContextId = this.userContextId(currentTab.cookieStoreId);
    
    // We must remove the assignment FIRST to prevent the webRequest listener 
    // from instantly intercepting the new tab and forcing it back into the custom container.
    await this.setOrRemoveAssignment(
      false, // Don't trigger the content script message yet
      currentTab.url,
      currentTabUserContextId,
      true
    );

    if (currentTab.cookieStoreId !== "firefox-default") {
      // Open the page in the default container
      const newTab = await browser.tabs.create({
        url: currentTab.url,
        cookieStoreId: "firefox-default",
        index: currentTab.index + 1,
        active: currentTab.active
      });
      
      if (currentTab.groupId >= 0) {
        await browser.tabs.group({ groupId: currentTab.groupId, tabIds: newTab.id });
      }

      // Call it again with the new tab ID to show the success message in the new tab
      await this.setOrRemoveAssignment(
        newTab.id,
        currentTab.url,
        currentTabUserContextId,
        true
      );

      // Close the old custom container tab
      await browser.tabs.remove(currentTab.id);
      return;
    }
    
    // If we are already in the default container, we just needed to remove it.
    // Call it with the current tab ID to show the success message.
    await this.setOrRemoveAssignment(
      currentTab.id,
      currentTab.url,
      currentTabUserContextId,
      true
    );
  },

  /* Theme helper
   *
   * First, we look if there's a theme already set in the local storage. If
   * there isn't one, we set the theme based on `prefers-color-scheme`.
   * */
  getTheme(currentTheme, window) {
    if (typeof currentTheme !== "undefined" && currentTheme !== "auto") {
      return currentTheme;
    }
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  },
  async applyTheme() {
    const { currentTheme } = await browser.storage.local.get("currentTheme");
    const popup = document.getElementsByTagName("html")[0];
    const theme = Utils.getTheme(currentTheme, window);
    popup.setAttribute("data-theme", theme);
  }
};

window.Utils = Utils;