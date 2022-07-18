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

[fork]: https://docs.github.com/en/get-started/quickstart/fork-a-repo
[l10n]: https://github.com/mozilla-l10n/multi-account-containers-l10n/
[pr]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests
[web-ext]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Getting_started_with_web-ext
