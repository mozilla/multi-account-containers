module.exports = {
    env: {
      "node": true,
      "mocha": true
    },
    "parserOptions": {
      "ecmaVersion": 2018
    },
    globals: {
      "sinon": false,
      "expect": false,
      "nextTick": false,
      "buildDom": false,
      "buildBackgroundDom": false,
      "background": false,
      "buildPopupDom": false,
      "popup": false,
      "helper": false
    }
}
