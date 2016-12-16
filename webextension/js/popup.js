browser.runtime.sendMessage('get-identities').then(reply=> {
  if (reply) {
    reply.content.identities.forEach(identity=> {
      document.querySelector('.identities-list').innerHTML += `<li><a href="#">${identity.icon}</a></li>`;
    });
    console.log('response from sdk addon: ', reply.content);
  }
});
