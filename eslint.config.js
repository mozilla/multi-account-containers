module.exports = {
  "parserOptions": {
    "ecmaVersion": 2018
  },
  "env": {
    "browser": true,
    "es6": true,
    "node": true,
    "webextensions": true
  },
  "globals": {
    "Utils": true,
    "CustomizableUI": true,
    "CustomizableWidgets": true,
    "SessionStore": true,
    "Services": true,
    "Components": true,
    "XPCOMUtils": true,
    "OS": true,
    "ADDON_UNINSTALL": true,
    "ADDON_DISABLE": true,
    "CONTAINER_ORDER_STORAGE_KEY": true,
    "proxifiedContainers": true,
    "MozillaVPN": true,
    "MozillaVPN_Background": true
  },
  "plugins": [
    "promise",
    "no-unsanitized"
  ],
  "extends": [
    "eslint:recommended"
  ],
  "root": true,
  "rules": {
    "linebreak-style": ["off"], // Disable linebreak-style rule
    "promise/always-return": "off",
    "promise/avoid-new": "off",
    "promise/catch-or-return": "error",
    "promise/no-callback-in-promise": "warn",
    "promise/no-native": "off",
    "promise/no-nesting": "warn",
    "promise/no-promise-in-callback": "warn",
    "promise/no-return-wrap": "error",
    "promise/param-names": "error",

    "no-unsanitized/method": ["error"],
    "no-unsanitized/property": [
      "error",
      {
        "escape": {
          "taggedTemplates": ["Utils.escaped"]
        }
      }
    ],

    "eqeqeq": "error",
    "indent": ["error", 2],
    "no-throw-literal": "error",
    "no-warning-comments": "warn",
    "no-var": "error",
    "prefer-const": "error",
    "quotes": ["error", "double"],
    "radix": "error",
    "semi": ["error", "always"]
  }
};
