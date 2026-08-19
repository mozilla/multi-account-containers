/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Keeps the add-on's per-site assignments and Firefox's own per-site container
 * associations (bug 2052136) in step. Firefox owns the truth: we import what it
 * holds at every startup, hand over the assignments it doesn't have yet, and
 * from then on the changes travel both ways as they happen.
 */
window.siteAssociation = {
  STORAGE_PREFIX: "siteContainerMap@@_",

  get supported() {
    return !!(browser.contextualIdentities &&
              browser.contextualIdentities.setSiteAssociation);
  },

  init() {
    this.load().catch((e) => {
      console.error("Could not load the site associations", e);
    });
  },

  // Importing first is what makes Firefox win every disagreement.
  async load() {
    if (!this.supported) {
      return;
    }

    // Listen before the first query so a change racing with it isn't lost.
    browser.contextualIdentities.onSiteAssociationChanged.addListener(
      (changeInfo) => {
        this.onChanged(changeInfo).catch((e) => {
          console.error("Could not apply a site association change", e);
        });
      }
    );

    let associations;
    try {
      associations =
        await browser.contextualIdentities.querySiteAssociations({});
    } catch (e) {
      // Containers can be disabled by pref, in which case the API throws.
      console.error("Could not read the existing site associations", e);
      return;
    }

    const sitesFromFirefox = new Set();
    for (const {site, cookieStoreId} of associations) {
      sitesFromFirefox.add(site);
      await this.applyFromFirefox(site, cookieStoreId);
    }

    const assignedSites = await assignManager.storageArea.getAssignedSites();
    for (const siteStoreKey of Object.keys(assignedSites)) {
      const site = this.siteFromStoreKey(siteStoreKey);
      if (sitesFromFirefox.has(site)) {
        continue;
      }
      await this._set(
        site,
        backgroundLogic.cookieStoreId(assignedSites[siteStoreKey].userContextId)
      );
    }
  },

  // cookieStoreId is left out when the association was removed.
  async onChanged({site, cookieStoreId}) {
    if (cookieStoreId) {
      await this.applyFromFirefox(site, cookieStoreId);
      return;
    }
    await this.removeFromFirefox(site);
  },

  // neverAsk stays off for a site we don't know yet: the user never went
  // through our confirm page for it.
  async applyFromFirefox(site, cookieStoreId) {
    const userContextId =
      backgroundLogic.getUserContextIdFromCookieStoreId(cookieStoreId);
    if (!userContextId) {
      // Not a container: we have nothing to store.
      return;
    }

    const siteStoreKey = `${this.STORAGE_PREFIX}${site}`;
    const assignment =
      await assignManager.storageArea.getByUrlKey(siteStoreKey);
    if (assignment && String(assignment.userContextId) === userContextId) {
      return;
    }

    await assignManager.storageArea.set(
      siteStoreKey,
      {
        userContextId,
        neverAsk: assignment ? assignment.neverAsk : false
      },
      undefined, // exemptedTabIds
      true, // backup
      true // fromFirefox
    );
  },

  async removeFromFirefox(site) {
    const siteStoreKey = `${this.STORAGE_PREFIX}${site}`;
    if (!await assignManager.storageArea.getByUrlKey(siteStoreKey)) {
      return;
    }

    await assignManager.storageArea.remove(
      siteStoreKey,
      true, // shouldSync
      true // fromFirefox
    );
  },

  /*
   * getSiteStoreKey concatenates hostname and port without a separator, so an
   * assignment for https://example.com:8080 becomes "example.com8080" and can
   * no longer be parsed back into a hostname. We hand that string to Firefox
   * as is: it matches no navigation, so the assignment stays handled by our own
   * webRequest listener. Guessing "example.com" would also capture
   * https://example.com, which the user never assigned.
   */
  siteFromStoreKey(pageUrlOrUrlKey) {
    const siteStoreKey =
      assignManager.storageArea.getSiteStoreKey(pageUrlOrUrlKey);
    return siteStoreKey.slice(this.STORAGE_PREFIX.length);
  },

  async set(pageUrlOrUrlKey, userContextId) {
    if (!this.supported) {
      return;
    }
    await this._set(
      this.siteFromStoreKey(pageUrlOrUrlKey),
      backgroundLogic.cookieStoreId(userContextId)
    );
  },

  async remove(pageUrlOrUrlKey) {
    if (!this.supported) {
      return;
    }
    await this._remove(this.siteFromStoreKey(pageUrlOrUrlKey));
  },

  async _set(site, cookieStoreId) {
    try {
      await browser.contextualIdentities.setSiteAssociation({
        site,
        cookieStoreId
      });
    } catch (e) {
      // Invalid host or missing container: the assignment stays in storage.
      console.error(`Could not associate ${site} with ${cookieStoreId}`, e);
    }
  },

  async _remove(site) {
    try {
      await browser.contextualIdentities.removeSiteAssociation({site});
    } catch (e) {
      console.error(`Could not remove the association for ${site}`, e);
    }
  }
};

siteAssociation.init();
