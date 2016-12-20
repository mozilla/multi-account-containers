const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');
const tabs = require('sdk/tabs');
const webExtension = require('sdk/webextension');

function handleWebExtensionMessage(message, sender, sendReply) {
  console.log(message);
  switch (message) {
      case 'get-identities':
        sendReply({
          content: {identities: ContextualIdentityService.getIdentities()}
        });
        break;
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
