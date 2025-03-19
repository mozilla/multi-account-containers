# Contributing

## Requirements

* Firefox 91.1.0+
* Git 2.13+
* Node 7+

## Getting Started

1. Follow the instructions on [How to fork a repository][fork]
2. Fetch the locales:

    ```
    cd multi-account-containers
    git submodule update --init
    ```
3. Install the project dependencies
    ```
    npm install --legacy-peer-deps
    ```
4. Run `npm run dev`.

## Translations

The translations are located in `src/_locales`. This directory is a git
repository like any other. Before editing files in this folder, you need to:

1. `cd src/_locales/`
2. `git checkout -b message-updates-yyyymmdd`
3. `git push -u origin message-updates-yyyymmdd`

You can then [open a pull request][pr] on [the l10n repository][l10n].

## Tips for contributing

1. Choose [an issue][issues] that you would like to work on.
2. Fork the repository and follow the [instructions for setting it up locally](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
3. Run the add-on locally and try reproducing the issue.
4. Debug add-ons by clicking the “Settings” icon in about:addons, and then clicking “Debug Add-ons”
5. Click “Inspect” on the MAC add-on to open developer tools for the popup extension (see [this documentation][extension-doc] for more information)
6. Once you have a fix ready, commit your changes with the following commit message template: “Fix #<insert issue id #>: <short description>”
7. Push your changes and open a pull request for review.

If you run into an issue, you can always ask the other community members in the [discussions board][discussions]. 

<!-- Please keep the list in alphabetical order -->
[discussions]: https://github.com/mozilla/multi-account-containers/discussions
[extension-doc]: https://extensionworkshop.com/documentation/develop/debugging/
[fork]: https://docs.github.com/en/get-started/quickstart/fork-a-repo
[issues]: https://github.com/mozilla/multi-account-containers/issues
[l10n]: https://github.com/mozilla-l10n/multi-account-containers-l10n/
[pr]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests
[web-ext]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext
