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

1. `npm install`
2. `./node_modules/.bin/web-ext run -s src/`

or

you can also test your changes without having to install web-ext as step #2 above

**Debugging in the browser**

Visit `about:debugging` in your browser.

Then select the option `load temporary Add-on`
and load the extension by selecting any file from the Web Extensions' dir. In our case, e.g. select manifest.json from the src dir. 

For reference, [watch this video](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#Installing)

After you make your changes, simply press the `reload` button to see them in effect.






### Testing
TBD

### Distributing
#### Make the new version

1. Bump the version number in `package.json` and `manifest.json`
2. Commit the version number bump
3. Create a git tag for the version: `git tag <version>`
4. Push the tag up to GitHub: `git push --tags`

#### Publish to AMO

1. `npm run-script build`
2. [Upload the `.zip` to AMO](https://addons.mozilla.org/en-US/developers/addon/multi-account-containers/versions/submit/)

#### Publish to GitHub
Finally, we also publish the release to GitHub for those followers.

1. Download the signed `.xpi` from [the addon versions page](https://addons.mozilla.org/en-US/developers/addon/multi-account-containers/versions)
2. [Make the new release on
   GitHub](https://github.com/mozilla/multi-account-containers/releases/new)
   * Use the version number for "Tag version" and "Release title"
   * Release notes: copy the output of `git log --no-merges --pretty=format:"%h %s" <previous-version>..<new-version>`
   * Attach binaries: select the signed `.xpi` file

### Links

Facebook & Twitter icons CC-Attrib https://fairheadcreative.com.

- [Licence](./LICENSE.txt)
- [Contributing](./CONTRIBUTING.md)
- [Code Of Conduct](./CODE_OF_CONDUCT.md)
