const THEME_BUILD_DATE = 20170630;
const themeManager = {
  existingTheme: null,
  disabled: false,
  async init() {
    const browserInfo = await browser.runtime.getBrowserInfo();
    if (Number(browserInfo.buildID.substring(0, 8)) >= THEME_BUILD_DATE) {
      this.disabled = true;
    } else {
      this.check();
    }
  },
  setPopupIcon(theme) {
    if (this.disabled) {
      return;
    }
    let icons = {
      16: "img/container-site-d-24.png",
      32: "img/container-site-d-48.png"
    };
    if (theme === "firefox-compact-dark@mozilla.org") {
      icons = {
        16: "img/container-site-w-24.png",
        32: "img/container-site-w-48.png"
      };
    }
    browser.browserAction.setIcon({
      path: icons
    });
  },
  check() {
    if (this.disabled) {
      return;
    }
    browser.runtime.sendMessage({
      method: "getTheme"
    }).then((theme) => {
      this.update(theme);
    }).catch(() => {
      throw new Error("Unable to get theme");
    });
  },
  update(theme) {
    if (this.existingTheme !== theme) {
      this.setPopupIcon(theme);
      this.existingTheme = theme;
    }
  }
};

themeManager.init();
