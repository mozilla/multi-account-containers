browser.runtime.sendMessage('message-from-webextension').then(reply=> {
  if (reply) {
    console.log('response from sdk addon: ', reply.content);
  }
});
