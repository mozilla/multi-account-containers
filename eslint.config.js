const {
  defineConfig,
  globalIgnores,
} = require("eslint/config");

const globals = require("globals");
const promise = require("eslint-plugin-promise");
const noUnsanitized = require("eslint-plugin-no-unsanitized");
const js = require("@eslint/js");

module.exports = defineConfig([{
  languageOptions: {
    "ecmaVersion": 2021,
    parserOptions: {},

    globals: {
      ...globals.browser,
      ...globals.node,
      ...globals.webextensions,
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
      "MozillaVPN_Background": true,
    },
  },

  plugins: {
    js,
    promise,
    "no-unsanitized": noUnsanitized,
  },

  extends: ["js/recommended"],

  "rules": {
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

    "no-unsanitized/property": ["error", {
      "escape": {
        "taggedTemplates": ["Utils.escaped"],
      },
    }],

    "eqeqeq": "error",
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "no-throw-literal": "error",
    "no-warning-comments": "warn",
    "no-var": "error",
    "prefer-const": "error",
    "quotes": ["error", "double"],
    "radix": "error",
    "semi": ["error", "always"],
  },
},

{
  files: ["test/**/*.js"],
  languageOptions: {
    globals: {
      ...globals.mocha,
    },
  },
  "rules": {
    "no-restricted-globals": ["error", "browser"],
  },
},

{
  files: ["src/js/**/*.js"],
  languageOptions: {
    globals: {
      "assignManager": true,
      "badge": true,
      "backgroundLogic": true,
      "identityState": true,
      "messageHandler": true,
      "sync": true,
    },
  },
},

globalIgnores(["lib/testpilot/*.js", "**/coverage"])]);
