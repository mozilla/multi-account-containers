const webExtension = require('sdk/webextension');

function handleWebExtensionMessage(message, sender, sendReply) {
  console.log(message);
  if (message === 'message-from-webextension') {
    sendReply({
      content: 'reply-from-sdk'
    });
  }
}

webExtension.startup().then(api=> {
  const {browser} = api;

  browser.runtime.onMessage.addListener(handleWebExtensionMessage);
});
