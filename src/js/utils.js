const DEFAULT_FAVICON = "/img/blank-favicon.svg";

// TODO use export here instead of globals
window.Utils = {

  createFavIconElement(url) {
    const imageElement = document.createElement("img");
    imageElement.classList.add("icon", "offpage");
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
    const bogusPassword = "foo";
    if(typeof window.Utils.pregeneratedString !== 'undefined')
    {
      return {type:bogusType, host:`w.${window.Utils.pregeneratedString}.coo`, port:bogusPort, username:bogusUsername, failoverTimeout:bogusFailover};
    }
    else
    {
      // Initialize Utils.pregeneratedString
      window.Utils.pregeneratedString = "";

      // We generate a cryptographically random string (of length specified in bogusLength), but we only do so once - thus negating any time delay caused
      const bogusLength = 8;
      let array = new Uint8Array(bogusLength);
      window.crypto.getRandomValues(array);
      for(let i = 0; i < bogusLength; i++)
      {
        let s = array[i].toString(16);
        if(s.length == 1)
          window.Utils.pregeneratedString += `0${s}`;
        else
          window.Utils.pregeneratedString += s;
      }

      // The only issue with this approach is that if (for some unknown reason) pregeneratedString is not saved, it will result in an infinite loop - but better than a privacy leak!
      return getBogusProxy();
    }
  }

};

// The following creates a fake (but convincing) constant Utils.DEFAULT_PROXY
Object.defineProperty(window.Utils, "DEFAULT_PROXY", {
  value: Object.freeze({type: "direct"}),
  writable: false,
  enumerable: true,

  // Setting configurable to false avoids deletion of Utils.DEFAULT_PROXY
  configurable: false
});
