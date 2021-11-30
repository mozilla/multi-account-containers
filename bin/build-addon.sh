#!/bin/bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

. $(dirname $0)/commons.sh

print Y "Update the submodules..."
git submodule init || die
git submodule update --remote --depth 1 src/_locales || die

print Y "Installing dependencies..."
npm install || die

print Y "Running tests..."
npm test

print Y "Creating the final package..."
cd src || die

if [[ $# -gt 0 ]]; then
  EXTRA_PARAMS="--filename $1"
fi

# Let's include just 'en' for this release
$(npm bin)/web-ext build --overwrite-dest $EXTRA_PARAMS --ignore-files $(find _locales/* | grep  \/en -v) $(find _locales/* | grep en_) || die
#$(npm bin)/web-ext build --overwrite-dest $EXTRA_PARAMS || die
