module.exports = {
  sourceDir: "./src",
  build: {
    overwriteDest: true,
  },
  run: {
    pref: [
      "ui.popup.disable_autohide=true",
      "extensions.manifestV3.enabled=false",
      "xpinstall.signatures.required=false",
      "ui.systemUsesDarkTheme=1"
    ],
    browserConsole: true
  },
};
