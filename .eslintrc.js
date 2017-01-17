module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true,
    "webextensions": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "root": true,
  "rules": {
    "eqeqeq": "error",
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "no-throw-literal": "error",
    "no-var": "error",
    "prefer-const": "error",
    "quotes": ["error", "double"],
    "radix": "error",
    "semi": ["error", "always"]
  }
};
