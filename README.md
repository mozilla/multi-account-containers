# Containers Add-on

[![Available on Test Pilot](https://img.shields.io/badge/available_on-Test_Pilot-0996F8.svg)](https://testpilot.firefox.com/experiments/containers)

[Embedded Web Extension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Embedded_WebExtensions) to build [Containers](https://blog.mozilla.org/tanvi/2016/06/16/contextual-identities-on-the-web/) as a Firefox [Test Pilot](https://testpilot.firefox.com/) Experiment and [Shield Study](https://wiki.mozilla.org/Firefox/Shield/Shield_Studies) to learn:

* Will a general Firefox audience understand the Containers feature?
* Is the UI as currently implemented in Nightly clear or discoverable?

For more info, see: 

* [Test Pilot Product Hypothesis Document](https://docs.google.com/document/d/1WQdHTVXROk7dYkSFluc6_hS44tqZjIrG9I-uPyzevE8/edit#)
* [Shield Product Hypothesis Document](https://docs.google.com/document/d/1vMD-fH_5hGDDqNvpRZk12_RhCN2WAe4_yaBamaNdtik/edit#)


## Requirements

* node 7+ (for jpm)
* Firefox 53+


## Development
### Development Environment

Add-on development is better with [a particular  environment](https://developer.mozilla.org/en-US/Add-ons/Setting_up_extension_development_environment). One simple way to get that environment set up is to install the [DevPrefs add-on](https://addons.mozilla.org/en-US/firefox/addon/devprefs/). You can make a custom Firefox profile that includes the DevPrefs add-on, and use that profile when you run the code in this repository. 

1. Make a new profile by running `/path/to/firefox -P`, which launches the profile editor. "Create Profile" -- name it whatever you wish (e.g. 'addon_dev') and store it in the default location. It's probably best to deselect the option to "Use without asking," since you probably don't want to use this as your default profile.

2. Once you've created your profile, click "Start Firefox". A new instance of Firefox should launch. Go to Tools->Add-ons and search for "DevPrefs". Install it. Quit Firefox.

3. Now you have a new, vanilla Firefox profile with the DevPrefs add-on installed. You can use your new profile with the code in _this_ repository like so:

#### Run the `.xpi` file in an unbranded build
Release & Beta channels do not allow un-signed add-ons, even with the DevPrefs. So, you must run the add-on in an [unbranded build](https://wiki.mozilla.org/Add-ons/Extension_Signing#Unbranded_Builds):

1. Download and install an un-branded build of Firefox
2. Download the latest `.xpi` from this repository's releases
3. Run the un-branded build of Firefox with your DevPrefs profile
4. Go to `about:addons`
5. Click the gear, and select "Install Add-on From File..."
6. Select the `.xpi` file

#### Run the TxP experiment with `jpm`

1. `git clone git@github.com:mozilla/testpilot-containers.git`
2. `cd testpilot-containers`
3. `npm install`
4. `./node_modules/.bin/jpm run -p /Path/To/Firefox/Profiles/{junk}.addon_dev -b FirefoxBeta` (where FirefoxBeta might be: ~/<reponame>/obj-x86_64-pc-linux-gnu/dist/bin/firefox or ~/<downloadedFirefoxBeta>/firefox)

Check out the [Browser Toolbox](https://developer.mozilla.org/en-US/docs/Tools/Browser_Toolbox) for more information about debugging add-on code.

#### Run the shield study with `shield`

1. `git clone git@github.com:mozilla/testpilot-containers.git`
2. `cd testpilot-containers`
3. `npm install`
4. `npm install -g shield-study-cli`
5. `shield run . -- --binary Nightly`

### Building .xpi

To build a local testpilot-containers.xpi, use the plain [`jpm
xpi`](https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/jpm#jpm_xpi) command,
or run `npm run build`.

#### Building a shield .xpi
To build a local shield-study-containers.xpi, run `npm run build-shield`.

### Signing an .xpi

To sign an .xpi, use [`jpm
sign`](https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/jpm#jpm_sign)
command.

Note: You will need to be [an author on the AMO
add-on](https://addons.mozilla.org/en-US/developers/addon/containers-experiment/ownership).

### Testing
TBD

### Distributing
TBD

### Links

- [Licence](./LICENSE.txt)
- [Contributing](./CONTRIBUTING.md)
- [Code Of Conduct](./CODE_OF_CONDUCT.md)
