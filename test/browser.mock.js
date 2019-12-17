module.exports = () => {
  const _localStorage = {};
  const _syncStorage = {};

  // could maybe be replaced by https://github.com/acvetkov/sinon-chrome
  const browserMock = {
    _localStorage,
    _syncStorage,
    runtime: {
      onMessage: {
        addListener: sinon.stub(),
      },
      onMessageExternal: {
        addListener: sinon.stub(),
      },
      sendMessage: sinon.stub().resolves(),
      onInstalled: {
        addListener: sinon.stub()
      },
      onStartup: {
        addListener: sinon.stub()
      }
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
        set: sinon.stub(),
        clear: () => { this._localStorage = {}; }
      },
      sync: {
        get: sinon.stub(),
        set: sinon.stub(),
        clear: () => { this._syncStorage = {}; }
      }
    },
    contextualIdentities: {
      create: sinon.stub(),
      get: sinon.stub(),
      query: sinon.stub().resolves([]),
      onCreated: {
        addListener: sinon.stub()
      },
      onUpdated: {
        addListener: sinon.stub()
      },
      onRemoved: {
        addListener: sinon.stub()
      }
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
    },
    permissions: {
      contains: sinon.stub().returns(true)
    }
  };

  // inmemory local storage
  browserMock.storage.local = {
    get: sinon.spy(async key => {
      if (!key) {
        return _localStorage;
      }
      let result = {};
      if (Array.isArray(key)) {
        key.map(akey => {
          if (typeof _localStorage[akey] !== "undefined") {
            result[akey] = _localStorage[akey];
          }
        });
      } else if (typeof key === "object") {
        // TODO support nested objects
        Object.keys(key).map(oKey => {
          if (typeof _localStorage[oKey] !== "undefined") {
            result[oKey] = _localStorage[oKey];
          } else {
            result[oKey] = key[oKey];
          }
        });
      } else {
        result = _localStorage[key];
      }
      return result;
    }),
    set: sinon.spy(async (key, value) => {
      if (typeof key === "object") {
        // TODO support nested objects
        Object.keys(key).map(oKey => {
          _localStorage[oKey] = key[oKey];
        });
      } else {
        _localStorage[key] = value;
      }
    }),
    remove: sinon.spy(async (key) => {
      if (Array.isArray(key)) {
        key.map(aKey => {
          delete _localStorage[aKey];
        });
      } else {
        delete _localStorage[key];
      }
    }),
  };
  
  browserMock.storage.sync = {
    get: sinon.spy(async key => {
      if (!key) {
        return _syncStorage;
      }
      let result = {};
      if (Array.isArray(key)) {
        key.map(akey => {
          if (typeof _syncStorage[akey] !== "undefined") {
            result[akey] = _syncStorage[akey];
          }
        });
      } else if (typeof key === "object") {
        // TODO support nested objects
        Object.keys(key).map(oKey => {
          if (typeof _syncStorage[oKey] !== "undefined") {
            result[oKey] = _syncStorage[oKey];
          } else {
            result[oKey] = key[oKey];
          }
        });
      } else {
        result = _syncStorage[key];
      }
      return result;
    }),
    set: sinon.spy(async (key, value) => {
      if (typeof key === "object") {
        // TODO support nested objects
        Object.keys(key).map(oKey => {
          _syncStorage[oKey] = key[oKey];
        });
      } else {
        _syncStorage[key] = value;
      }
    }),
    remove: sinon.spy(async (key) => {
      if (Array.isArray(key)) {
        key.map(aKey => {
          delete _syncStorage[aKey];
        });
      } else {
        delete _syncStorage[key];
      }
    }),
  };
  return browserMock;
};
