/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const self = require("sdk/self");
const { when: unload } = require("sdk/system/unload");
const tabs = require("sdk/tabs");

const shield = require("./lib/shield/index");

const studyConfig = {
  name: self.addonId,
  days: 28,
  surveyUrls: {
  },
  variations: {
    "control": () => {},
    "securityOnboarding": () => {}
  }
};

class ContainersStudy extends shield.Study {
  isEligible () {
    // If the user already has testpilot-containers extension, they are in the
    // Test Pilot experiment, so exclude them.
    return super.isEligible();
  }

  whenEligible () {
  }

  whenInstalled () {
    tabs.open(`data:text/html, Thank you for helping us study Containers in Firefox. You are in the ${this.variation} variation.`);
  }

  cleanup() {
  }
}

const thisStudy = new ContainersStudy(studyConfig);

unload((reason) => thisStudy.shutdown(reason));

exports.study = thisStudy;
