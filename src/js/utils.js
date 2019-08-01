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
    if(typeof window.Utils.pregeneratedString !== 'undefined')
    {
      return {type:"socks4", host:"w.${window.Utils.pregeneratedString}.coo", port:9999, username:"foo", failoverTimeout:bogusFailover};
    }
    else
    {
      const bogusLength = 8;
      let array = new Uint8Array(bogusLength);
      window.crypto.getRandomValues(array);
      window.Utils.pregeneratedString = array.toString('hex');
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
