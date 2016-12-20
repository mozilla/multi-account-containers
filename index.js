const webExtension = require('sdk/webextension');
const {ContextualIdentityService} = require('resource://gre/modules/ContextualIdentityService.jsm');

function handleWebExtensionMessage(message, sender, sendReply) {
}

webExtension.startup().then(api=> {
  const {browser} = api;

  browser.runtime.onMessage.addListener(handleWebExtensionMessage);
});
