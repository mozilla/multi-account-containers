#!/bin/bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# addons-linter is not happy to see a `.github` folder in src/_locales.
# We need to do an horrible hack to run the test.

. $(dirname $0)/commons.sh

TMPDIR=/tmp/MAC_addonsLinter

print Y "Update the submodules..."
git submodule init || die
git submodule update --remote --depth 1 src/_locales || die

printn Y "Removing previous execution data... "
rm -rf $TMPDIR || die
print G "done."

printn Y "Creating a tmp folder ($TMPDIR)... "
mkdir $TMPDIR || die
print G "done."

printn Y "Copying data... "
cp -r src $TMPDIR || die
print G "done."

printn Y "Removing the github folder... "
rm -rf $TMPDIR/src/_locales/.github || die
print G "done."

print Y "Running the test..."
$(npm bin)/addons-linter $TMPDIR/src || die
