document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("[data-i18n-message-id]").forEach(el => {
    const messageArgs = el.dataset.i18nPlaceholder ? el.dataset.i18nPlaceholder : null;
    el.textContent = browser.i18n.getMessage(el.dataset.i18nMessageId, [messageArgs]);
  });
  document.querySelectorAll("[data-i18n-attribute]").forEach(el => {
    el.setAttribute(el.dataset.i18nAttribute, browser.i18n.getMessage(el.dataset.i18nAttributeMessageId));
  });
});
