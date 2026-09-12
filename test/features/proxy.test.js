const {expect, buildBackgroundDom} = require("../common");

describe("Proxy credentials", function () {
  let webExtension;
  let parse;

  before(async function () {
    webExtension = await buildBackgroundDom();
    parse = input => webExtension.background.window.proxifiedContainers.parseProxy(input, {mozProxyEnabled: true});
  });

  after(function () {
    if (webExtension) webExtension.destroy();
  });

  for (const password of ["password", "pass.word", "pass!word", "pass:word"]) {
    it(`preserves the proxy host and credentials for ${password}`, function () {
      const proxy = parse(`http://user:${password}@proxy.example:8080`);
      expect(proxy.host).to.equal("proxy.example");
      expect(proxy.port).to.equal("8080");
      expect(proxy.proxyAuthorizationHeader).to.equal(`Basic ${Buffer.from(`user:${password}`).toString("base64")}`);
    });
  }

  it("decodes percent-encoded credential delimiters", function () {
    const proxy = parse("socks://user%40example:pass%2Fword@proxy.example:1080");
    expect(proxy.host).to.equal("proxy.example");
    expect(proxy.username).to.equal("user@example");
    expect(proxy.password).to.equal("pass/word");
  });

  for (const input of ["junk http://proxy.example:8080", "http://proxy.example:8080/junk", "http://user:bad%ZZ@proxy.example:8080"]) {
    it(`rejects an invalid proxy description: ${input}`, function () {
      expect(parse(input)).to.equal(false);
    });
  }

  for (const input of ["http://user%3Aname:password@proxy.example:8080", "https://user:%E2%82%AC@proxy.example:8080"]) {
    it(`rejects credentials that cannot be represented as Basic authentication: ${input}`, function () {
      expect(parse(input)).to.equal(false);
    });
  }

  for (const type of ["http", "https", "socks", "socks4"]) {
    it(`preserves an unauthenticated ${type} proxy`, function () {
      const proxy = parse(`${type}://proxy.example:8080`);
      expect(proxy.type).to.equal(type);
      expect(proxy.host).to.equal("proxy.example");
      expect(proxy.port).to.equal("8080");
      expect(proxy.proxyAuthorizationHeader).to.equal(undefined);
    });
  }

  it("preserves an omitted port", function () {
    expect(parse("socks://proxy.example").port).to.equal(undefined);
  });

  it("keeps disabled Mozilla VPN metadata", function () {
    const proxy = webExtension.background.window.proxifiedContainers.parseProxy("socks://proxy.example:1080", {
      countryCode: "DE", cityName: "Berlin"
    });
    expect(proxy.type).to.equal(null);
    expect(proxy.countryCode).to.equal("DE");
    expect(proxy.cityName).to.equal("Berlin");
    expect(proxy.host).to.equal("proxy.example");
  });
});
