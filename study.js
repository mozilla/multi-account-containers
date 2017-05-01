const self = require("sdk/self");
const { shield } = require("./node_modules/shield-studies-addon-utils/lib/index");
const { when: unload } = require("sdk/system/unload");

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
  }

  whenEligible () {
  }

  whenInstalled () {
  }

  cleanup(reason) {
    console.log(reason);
  }
}

const thisStudy = new ContainersStudy(studyConfig);

unload((reason) => thisStudy.shutdown(reason));
