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
