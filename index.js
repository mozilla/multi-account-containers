/* global require */
const tabs = require('sdk/tabs');
const webExtension = require('sdk/webextension');

function handleWebExtensionMessage(message, sender, sendReply) {
  switch (message) {
      case 'open-containers-preferences':
        tabs.open('about:preferences#containers');
        sendReply({content: 'opened'});
        break;
  }
}

webExtension.startup().then(api=> {
  const {browser} = api;

  browser.runtime.onMessage.addListener(handleWebExtensionMessage);
});
