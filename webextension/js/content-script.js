async function delayAnimation(delay = 350) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

async function doAnimation(element, property, value) {
  return new Promise((resolve) => {
    const handler = () => {
      resolve();
      element.removeEventListener("transitionend", handler);
    };
    element.addEventListener("transitionend", handler);
    window.requestAnimationFrame(() => {
      element.style[property] = value;
    });
  });
}
/*
async function awaitEvent(eventName) {
  return new Promise((resolve) => {
    const handler = () => {
      resolve();
      divElement.removeEventListener(eventName, handler);
    };
    divElement.addEventListener(eventName, handler);
  });
}
*/

async function addMessage(message) {
  const divElement = document.createElement("div");
  divElement.classList.add("container-notification");
  // For the eager eyed, this is an experiment. It is however likely that a website will know it is "contained" anyway
  divElement.innerText = message.text;

  const imageElement = document.createElement("img");
  imageElement.src = browser.extension.getURL("/img/container-site-d-24.png");
  divElement.prepend(imageElement);

  document.body.appendChild(divElement);

  await delayAnimation(100);
  await doAnimation(divElement, "transform", "translateY(0)");
  await delayAnimation(2000);
  await doAnimation(divElement, "transform", "translateY(-100%)");

  divElement.remove();
}

browser.runtime.onMessage.addListener((message) => {
  addMessage(message);
});


const menuClickHandler = {
  menuElement: null,
  lastUrl: null,
  linkSelector:"a[href]",

  init() {
    this.createMenu();

    document.addEventListener("keydown", this);
    document.addEventListener("click", this);
  },

  handleEvent(e) {
    switch(e.type) {
    case "keydown":
      if (this.isMenuOpen()) {
        if (e.key === "Escape") {
          this.menuClose();
        }
      }
      if (e.altKey && (e.shiftKey || e.key === "Shift")) {
        e.preventDefault();
        e.stopPropagation();
        this.addOpenListeners();
      } 
    break;
    case "keyup":
      if (e.altKey && (e.shiftKey || e.key === "Shift")) {
        this.removeOpenListeners();
      }
      break;
    case "click":
      if (this.isMenuOpen() &&
          (e.target.closest(this.linkSelector) || e.target.matches(this.linkSelector))) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        this.menuClose();
      }
      this.removeOpenListeners();
      break;
    case "mousedown":
      if (this.isMenuOpen()) {
        if (!e.target.closest("#containers-menu")) {
          this.menuClose();
        }
        return;
      }
      if (e.target.closest(this.linkSelector) ||
          e.target.matches(this.linkSelector)) {
        // Prevent text selection
        e.preventDefault();
        e.stopPropagation();
        this.lastUrl = e.target.href;
        this.showMenu(e);
      }
      /*
      setTimeout(() => {
        this.removeOpenListeners();
      }, 1000);
      */
      break;
    }
  },

  addOpenListeners() {
    document.addEventListener("mousedown", this);
    document.addEventListener("keyup", this);
  },

  removeOpenListeners() {
    document.removeEventListener("mousedown", this);
    document.removeEventListener("keyup", this);
  },

  isMenuOpen() {
    return !this.menuElement.hidden;
  },

  menuOpen() {
    this.menuElement.hidden = false;
  },

  menuClose() {
    this.menuElement.hidden = true;
  },

  getContainers() {
    return browser.runtime.sendMessage({
      method: "getContainers"
    });
  },

  async createMenu() {
    if (this.menuElement) {
      return this.menuElement;
    }
    const menuElement = document.createElement("ul");
    menuElement.id = "containers-menu";
    menuElement.hidden = true;
    const containers = await this.getContainers();
    containers.forEach((container) => {
      const containerElement = document.createElement("li");
      const spanElement = document.createElement("span");
      spanElement.innerText = container.name;
      containerElement.appendChild(spanElement);
      containerElement.setAttribute("tabindex", 0);
      const iconElement = document.createElement("div");
      iconElement.classList.add("usercontext-icon");
      iconElement.setAttribute("data-identity-icon", container.icon);
      iconElement.setAttribute("data-identity-color", container.color);
      containerElement.prepend(iconElement);
      menuElement.appendChild(containerElement);
      containerElement.addEventListener("click", (e) => {
        this.openContainer(container);
      });
    });
    document.body.appendChild(menuElement);
    this.menuElement = menuElement;
    return menuElement;
  },

  async showMenu(e) {
    const menuElement = await this.createMenu();
    this.menuOpen();
    menuElement.style.top = `${e.clientY}px`;
    menuElement.style.left = `${e.clientX}px`;
    menuElement.querySelector("div").focus();
  },

  openContainer(container) {
    return browser.runtime.sendMessage({
      method: "openTab",
      url: this.lastUrl,
      cookieStoreId: container.cookieStoreId
    });
  }

};

menuClickHandler.init();
