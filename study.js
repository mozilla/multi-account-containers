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
    "privacyOnboarding": () => {},
    "onlineAccountsOnboarding": () => {},
    "tabManagementOnboarding": () => {}
  }
};

class ContainersStudy extends shield.Study {
  isEligible () {
    // If the user already has testpilot-containers extension, they are in the
    // Test Pilot experiment, so exclude them.
    return super.isEligible();
  }

  whenEligible () {
    console.log("ContainersStudy.whenEligible()");
  }

  whenInstalled () {
    console.log("ContainersStudy.whenInstalled()");
    console.log("shield variation: ", this.variation);
    tabs.open(`data:text/html, Thank you for helping us study Containers in Firefox. You are in the ${this.variation} variation.`);
  }

  cleanup(reason) {
    console.log("ContainersStudy.cleanup()");
    console.log(reason);
  }
}

const thisStudy = new ContainersStudy(studyConfig);

unload((reason) => thisStudy.shutdown(reason));

exports.study = thisStudy;
