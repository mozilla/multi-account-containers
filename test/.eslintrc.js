module.exports = {
    env: {
      "node": true,
      "mocha": true
    },
    "parserOptions": {
      "ecmaFeatures": {
        "experimentalObjectRestSpread": true
      }
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
