# Release a new version

## Make the new version

1. Bump the version number in `package.json` and `src/manifest.json`
2. Commit the version number bump
3. Create a git tag for the version: `git tag <version>`
4. Push the tag up to GitHub: `git push --tags`

## Publish to AMO

1. Run `./bin/build-addon.sh`
2. [Upload the zip file to AMO][amo-upload]

## Publish to GitHub

Finally, we also publish the release to GitHub.

1. Download the signed `.xpi` from [the addon versions page][addon-page]
2. [Create a new release on GitHub][gh-release]
   * For *Tag version* and *Release title*, use the version number
   * For *Release notes*, copy the output of:
     ```
     git log --no-merges \
             --pretty=format:"%h %s" <previous-version>..<new-version>
     ```
   * For the *Attach binaries*, select the signed `.xpi` file

[addon-page]: https://addons.mozilla.org/developers/addon/multi-account-containers/versions
[amo-upload]: https://addons.mozilla.org/developers/addon/multi-account-containers/versions/submit/
[gh-release]: https://github.com/mozilla/multi-account-containers/releases/new
