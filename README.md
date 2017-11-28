# Multi-Account Containers

The Firefox Multi-Account Containers extension lets you carve out a separate box for each of your online lives – no more opening a different browser just to check your work email! [Learn More Here](https://blog.mozilla.org/firefox/introducing-firefox-multi-account-containers/)

[Available on addons.mozilla.org](https://addons.mozilla.org/en-GB/firefox/addon/multi-account-containers/)

For more info, see: 

* [Test Pilot Product Hypothesis Document](https://docs.google.com/document/d/1WQdHTVXROk7dYkSFluc6_hS44tqZjIrG9I-uPyzevE8/edit#)
* [Shield Product Hypothesis Document](https://docs.google.com/document/d/1vMD-fH_5hGDDqNvpRZk12_RhCN2WAe4_yaBamaNdtik/edit#)


## Requirements

* node 7+ (for jpm)
* Firefox 57+


## Development

1. Install web-ext with npm
2. cd src; web-ext run -f Nightly

### Testing
TBD

### Distributing
#### Make the new version

1. Bump the version number in `package.json` and `manifest.json`
2. Commit the version number bump
3. Create a git tag for the version: `git tag <version>`
4. Push the tag up to GitHub: `git push --tags`

#### Publish to AMO
While the add-on is an Embedded Web Extension, we have to use the [Mozilla
Internal Signing
Service](https://mana.mozilla.org/wiki/display/FIREFOX/Internal+Extension+Signing)
to sign it as a Mozilla extension exempt from AMO's Web Extension restrictions.

So, to distribute the add-on to AMO:

1. Use `jpm xpi` to build the `.xpi` file
2. [Submit the `.xpi` to the Internal Signing Service and download the signed `.xpi`](https://mana.mozilla.org/wiki/display/SVCOPS/Sign+a+Mozilla+Internal+Extension)
3. [Upload the signed `.xpi` file to
   AMO](https://addons.mozilla.org/en-US/developers/addon/multi-account-containers/versions/submit/)

#### Publish to GitHub
Finally, we also publish the release to GitHub for those followers.

1. [Make the new release on
   GitHub](https://github.com/mozilla/multi-account-containers/releases/new)
   * Use the version number for "Tag version" and "Release title"
   * Release notes: copy the output of `git log --no-merges --pretty=format:"%h %s" <previous-version>..<new-version>`
   * Attach binaries: select the signed `.xpi` file

### Links

Facebook & Twitter icons CC-Attrib http://fairheadcreative.com.

- [Licence](./LICENSE.txt)
- [Contributing](./CONTRIBUTING.md)
- [Code Of Conduct](./CODE_OF_CONDUCT.md)
