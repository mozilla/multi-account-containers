/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Drives the container palette and icon set from what the browser exposes
// (contextualIdentities.getSupportedColors/getSupportedIcons), falling back to
// the set bundled with the add-on on browsers that don't expose them.
// eslint-disable-next-line no-unused-vars
const ContainerStyle = {
  FALLBACK_COLOR_CODES: {
    blue: "#37adff",
    turquoise: "#00c79a",
    green: "#51cd00",
    yellow: "#ffcb00",
    orange: "#ff9f00",
    red: "#ff613d",
    pink: "#ff4bda",
    purple: "#af51f5",
  },
  FALLBACK_ICONS: [
    "fingerprint", "briefcase", "dollar", "cart", "vacation", "gift", "food",
    "fruit", "pet", "tree", "chill", "circle", "fence",
  ],

  // name -> color code (hex). name -> icon URL (or null when unknown).
  _colorCodes: null,
  _iconUrls: null,
  _loadPromise: null,

  load() {
    if (!this._loadPromise) {
      this._loadPromise = this._load();
    }
    return this._loadPromise;
  },

  async _load() {
    this._colorCodes = new Map();
    this._iconUrls = new Map();

    let colors = null;
    if (browser.contextualIdentities.getSupportedColors) {
      try {
        colors = await browser.contextualIdentities.getSupportedColors();
      } catch {
        // Fall back to the bundled palette below.
      }
    }
    if (colors && colors.length) {
      for (const { color, colorCode } of colors) {
        this._colorCodes.set(color, colorCode);
      }
    } else {
      for (const [name, code] of Object.entries(this.FALLBACK_COLOR_CODES)) {
        this._colorCodes.set(name, code);
      }
    }

    let icons = null;
    if (browser.contextualIdentities.getSupportedIcons) {
      try {
        icons = await browser.contextualIdentities.getSupportedIcons();
      } catch {
        // Fall back to the bundled icon set below.
      }
    }
    if (icons && icons.length) {
      for (const { icon, iconUrl } of icons) {
        this._iconUrls.set(icon, iconUrl || null);
      }
    } else {
      for (const name of this.FALLBACK_ICONS) {
        this._iconUrls.set(name, null);
      }
    }
  },

  colorNames() {
    return this._colorCodes ? [...this._colorCodes.keys()] : [];
  },

  iconNames() {
    return this._iconUrls ? [...this._iconUrls.keys()] : [];
  },

  colorCode(name) {
    return (this._colorCodes && this._colorCodes.get(name)) || null;
  },

  // Usable in a CSS url(): the browser's icon URL, or the bundled svg fragment.
  iconImage(name) {
    const iconUrl = this._iconUrls && this._iconUrls.get(name);
    return iconUrl || `/img/usercontext.svg#${name}`;
  },

  // Usable as a contextMenus icon path: the bundled svg fragment for icons we
  // ship (known-good for menus), else the browser's icon URL.
  iconMenuPath(name) {
    if (this.FALLBACK_ICONS.includes(name)) {
      return `img/usercontext.svg#${name}`;
    }
    const iconUrl = this._iconUrls && this._iconUrls.get(name);
    return iconUrl || `img/usercontext.svg#${name}`;
  },

  _buildStylesheet() {
    let css = "";
    for (const [name, code] of this._colorCodes) {
      css += `[data-identity-color="${name}"]{--identity-tab-color:${code};--identity-icon-color:${code};}\n`;
    }
    for (const name of this._iconUrls.keys()) {
      css += `[data-identity-icon="${name}"]{--identity-icon:url("${this.iconImage(name)}");}\n`;
    }
    return css;
  },

  async injectStylesheet() {
    await this.load();
    let style = document.getElementById("container-style-dynamic");
    if (!style) {
      style = document.createElement("style");
      style.id = "container-style-dynamic";
      document.head.appendChild(style);
    }
    style.textContent = this._buildStylesheet();
  },
};
