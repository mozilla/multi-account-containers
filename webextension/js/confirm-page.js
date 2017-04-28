const redirectUrl = new URL(window.location).searchParams.get("url");
document.getElementById("redirect-url").textContent = redirectUrl;
const redirectSite = new URL(redirectUrl).hostname;
document.getElementById("redirect-site").textContent = redirectSite;

document.getElementById("redirect-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const neverAsk = document.getElementById("never-ask").checked;
  // Sending neverAsk message to background to store for next time we see this process
  if (neverAsk) {
    browser.runtime.sendMessage({
      type: "never-ask",
      neverAsk: true,
      pageUrl: redirectUrl
    }).then(() => {
      redirect();
    }).catch(() => {
      // Can't really do much here user will have to click it again
    });
  }
  browser.runtime.sendMessage({
    method: "sendTelemetryPayload",
    event: "click-to-reload-page-in-container",
  });
  redirect();
});

function redirect() {
  const redirectUrl = document.getElementById("redirect-url").textContent;
  document.location.replace(redirectUrl);
}
