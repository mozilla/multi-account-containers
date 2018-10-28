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
  DEFAULT_PROXY: Object.freeze({type: "direct"})

};
