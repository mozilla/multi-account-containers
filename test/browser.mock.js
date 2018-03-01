module.exports = () => {
  const _storage = {};

  // could maybe be replaced by https://github.com/acvetkov/sinon-chrome
  const browserMock = {
    _storage,
    runtime: {
      onMessage: {
        addListener: sinon.stub(),
      },
      onMessageExternal: {
        addListener: sinon.stub(),
      },
      sendMessage: sinon.stub().resolves(),
    },
    webRequest: {
      onBeforeRequest: {
        addListener: sinon.stub()
      },
      onCompleted: {
        addListener: sinon.stub()
      },
      onErrorOccurred: {
        addListener: sinon.stub()
      }
    },
    windows: {
      getCurrent: sinon.stub().resolves({}),
      onFocusChanged: {
        addListener: sinon.stub(),
      }
    },
    tabs: {
      onActivated: {
        addListener: sinon.stub()
      },
      onCreated: {
        addListener: sinon.stub()
      },
      onUpdated: {
        addListener: sinon.stub()
      },
      sendMessage: sinon.stub(),
      query: sinon.stub().resolves([{}]),
      get: sinon.stub(),
      create: sinon.stub().resolves({}),
      remove: sinon.stub().resolves()
    },
    history: {
      deleteUrl: sinon.stub()
    },
    storage: {
      local: {
        get: sinon.stub(),
        set: sinon.stub()
      }
    },
    contextualIdentities: {
      create: sinon.stub(),
      get: sinon.stub(),
      query: sinon.stub().resolves([])
    },
    contextMenus: {
      create: sinon.stub(),
      remove: sinon.stub(),
      onClicked: {
        addListener: sinon.stub()
      }
    },
    browserAction: {
      setBadgeBackgroundColor: sinon.stub(),
      setBadgeText: sinon.stub()
    },
    management: {
      get: sinon.stub(),
      onInstalled: {
        addListener: sinon.stub()
      },
      onUninstalled: {
        addListener: sinon.stub()
      }
    },
    extension: {
      getURL: sinon.stub().returns("moz-extension://multi-account-containers/confirm-page.html")
    }
  };

  // inmemory local storage
  browserMock.storage.local = {
    get: sinon.spy(async key => {
      if (!key) {
        return _storage;
      }
      let result = {};
      if (Array.isArray(key)) {
        key.map(akey => {
          if (typeof _storage[akey] !== "undefined") {
            result[akey] = _storage[akey];
          }
        });
      } else if (typeof key === "object") {
        // TODO support nested objects
        Object.keys(key).map(oKey => {
          if (typeof _storage[oKey] !== "undefined") {
            result[oKey] = _storage[oKey];
          } else {
            result[oKey] = key[oKey];
          }
        });
      } else {
        result = _storage[key];
      }
      return result;
    }),
    set: sinon.spy(async (key, value) => {
      if (typeof key === "object") {
        // TODO support nested objects
        Object.keys(key).map(oKey => {
          _storage[oKey] = key[oKey];
        });
      } else {
        _storage[key] = value;
      }
    }),
    remove: sinon.spy(async (key) => {
      if (Array.isArray(key)) {
        key.map(aKey => {
          delete _storage[aKey];
        });
      } else {
        delete _storage[key];
      }
    }),
  };

  return browserMock;
};
