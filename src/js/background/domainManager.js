window.domainManager = {
  getDomainNameFromHostname(hostname) {
    try {
      const domainName = browser.publicSuffix.getDomain(
        hostname,
        { allowUnknownSuffix: true, encoding: "display" },
      );
      return domainName?.endsWith(".")
        ? domainName.slice(0, -1)
        : domainName;
    } catch {
      return null;
    }
  },

  getDomainStoreKey(pageUrlorUrlKey) {
    if (pageUrlorUrlKey.includes("siteContainerMap@@_")) return pageUrlorUrlKey;
    const url = new window.URL(pageUrlorUrlKey);
    const domainName = this.getDomainNameFromHostname(url.hostname);
    return domainName ? this.getDomainStoreKeyFromHostname(domainName) : null;
  },

  getDomainMatchKeys(pageUrl) {
    const url = new window.URL(pageUrl);
    const domainName = this.getDomainNameFromHostname(url.hostname);
    return domainName ? this.getDomainMatchKeysFromName(domainName) : [];
  },

  getDomainStoreKeyFromName(domainName) {
    const storagePrefix = "siteContainerMap@@_*.";
    return `${storagePrefix}${domainName}`;
  },

  getDomainMatchKeysFromName(domainName) {
    // "mysite.s3.us-west-1.amazonaws.com" ===>
    // [
    //   "siteContainerMap@@_*.mysite.s3.us-west-1.amazonaws.com",
    //   "siteContainerMap@@_*.s3.us-west-1.amazonaws.com",
    //   "siteContainerMap@@_*.us-west-1.amazonaws.com",
    //   "siteContainerMap@@_*.amazonaws.com",
    //   "siteContainerMap@@_*.com",
    // ]
    let previous;
    return domainName
      .split(".")
      .reverse()
      .map(domainName => previous = previous ? `${domainName}.${previous}` : domainName)
      .map(domainName => this.getDomainStoreKeyFromName(domainName))
      .reverse();
  },

  getDomainNameFromStoreKey(domainStoreKey) {
    const storagePrefix = "siteContainerMap@@_*.";
    if (domainStoreKey.startsWith(storagePrefix)) {
      return domainStoreKey.slice(storagePrefix.length);
    }
    return null;
  },

  async getDomainsAndAssignments(containerSites) {
    const enabledDomains = new Set(Object.entries(containerSites)
      .filter(([, site]) => site.isDomain)
      .map(([siteStoreKey]) => siteStoreKey)
    );

    const domains = {};
    const assignments = {};
    for (const [siteStoreKey, site] of Object.entries(containerSites)) {
      // Site is an enabled domain
      if (site.isDomain) {
        domains[siteStoreKey] = site;
        continue;
      }

      // Site with invalid hostname
      const domainName = this.getDomainNameFromHostname(site.hostname);
      if (!domainName) {
        assignments[siteStoreKey] = site;
        continue;
      }

      // Enabled domain exists for site - exclude site
      if (enabledDomains.size) {
        const domainMatchKeys = this.getDomainMatchKeysFromName(domainName);
        if (domainMatchKeys.find(key => enabledDomains.has(key))) {
          continue;
        }
      }

      // No enabled domain for site - add site, and add a disabled domain placeholder,
      // since these are not stored
      assignments[siteStoreKey] = site;
      const domainStoreKey = this.getDomainStoreKeyFromName(domainName);
      if (!(domainStoreKey in domains)) {
        const userContextId = site.userContextId;
        const domainSite = { hostname: domainName, userContextId, isDomain: true, disabled: true };
        domains[domainStoreKey] = domainSite;
      }
    }
    return { domains, assignments };
  },
};
