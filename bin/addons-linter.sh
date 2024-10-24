#!/bin/env bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# addons-linter is not happy to see a `.github` folder in src/_locales.
# We need to do an horrible hack to run the test.

. $(dirname $0)/commons.sh

print Y "Update the submodules..."
git submodule init || die
git submodule update --remote --depth 1 src/_locales || die

print Y "Running the test..."
npx addons-linter ./src || die
