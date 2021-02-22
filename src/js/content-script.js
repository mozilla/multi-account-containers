class Defer extends Promise {
  constructor() {
    let resolve, reject;
    super((res, rej) => { resolve = res; reject = rej; });
    this.resolve = resolve; this.reject = reject;
  }

  // Fix to make then/catch/finally return a vanilla Promise, not a Defer
  static get [Symbol.species]() { return Promise; }
  get [Symbol.toStringTag]() { return this.constructor.name; }
}

/**
  Wraps a promise chain that:
    1. can be interrupted  (e.g. to stop an animation)
    2. has a cleanup phase (e.g. to remove listeners)

  Note: interrupting is important when the browser is about to redirect. The background
  script may have previously sent us a message and we returned a promise while we show
  the message using an animation. If the browser now redirects, the promise is lost
  and the background script hangs waiting forever on a promise that will never finish.
  By interrupting the promise, we ensure the background script receives an error.
  */
class Operation extends Defer {
  constructor(name) {
    super();
    this.name = name;
    this.finished = this.error = this.completions = undefined;
    const resolveFinally = this.resolve;
    const rejectFinally = this.reject;
    // eslint-disable-next-line promise/catch-or-return
    new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }).then(
      v => { this._setFinished(); resolveFinally(v); },
      v => { this.error = v || new Error(`${this} failed`); this._setFinished(); rejectFinally(this.error); });
  }

  _setFinished() {
    this.finished = true;
    if (this.completions) {
      this.completions.forEach(completion => { try { completion(this); } catch (e) { this.errored("completion", e); } });
      this.completions = undefined;
    }
  }

  mustBeRunning(running, optional) {
    const wantFinished = running === false;
    const ok = wantFinished === !!this.finished;
    if (!ok && !optional) { throw new Error(`${this} ${wantFinished ? "unfinished" : "cancelled"}`); }
    return ok;
  }

  addFinishListener(listener) {
    if (this.finished) {
      listener({target: this});
    } else {
      if (!(this.completions || (this.completions = [])).find(c => c === listener)) { this.completions.push(listener); }
    }
  }

  removeFinishListener(listener) {
    if (this.completions) { this.completions = this.completions.filter(c => c !== listener); }
  }

  addEventListener(type, listener) {
    if (/^finish$/i.test(type)) { this.addFinishListener(listener); }
    else { throw new Error(`${this} unsupported event '${type}'`); }
  }

  removeEventListener(type, listener) {
    if (/^finish$/i.test(type)) { this.removeFinishListener(listener); }
  }

  errored(name, e) { console.error("%s error during %s: %s", this, name, e); }
  toString() { return this.name || this.constructor.name; }
}

/**
  Builds an operation with concurrent tasks (e.g. onTimeout, onEvent).
  */
class Operator {
  constructor(operation) {
    if (operation) {
      this.operation = typeof operation === "string" ? new Operation(operation) : operation;
    } else {
      const name = this.constructor === Operator ? undefined : `${this.constructor.name}Operation`;
      this.operation = new Operation(name);
    }
  }

  // Performs a named task, checks if operation is already finished and handles errors.
  async exec(handler, opts = {name: "exec"}, ...args) {
    if (this.operation.mustBeRunning(!opts.finished, opts.optional)) {
      try {
        const result = await handler(this.operation, ...args);
        this.operation.mustBeRunning(!opts.finished, opts.optional);
        return result;
      } catch (e) {
        if (!this.operation.finished || opts.finished) {
          this.operation.errored(name, e);
          this.operation.reject(e);
        }
      }
    }
  }

  delay(millis) {
    return this.exec(() => { return new Promise(resolve => setTimeout(resolve, millis)); }, {name: "delay"});
  }

  onStart(handler) { this.exec(handler, {name: "start"}); return this; }
  onFinish(handler) { this.operation.addFinishListener(e => handler(e.target)); return this; }

  onTimeout(delay, handler) {
    const timer = () => this.exec(handler, {name: "timeout", optional: true});
    let timeoutId = setTimeout(() => { timeoutId = null; timer(); }, delay);
    this.onFinish(() => clearTimeout(timeoutId));
    return this;
  }

  onEvent(target, type, handler) {
    if (target) {
      const options = {name: type, optional: true, finished: this.isFinishEvent(target, type)};
      if (this.isPriorEvent(target, type)) {
        this.exec(handler, options, {target});
      } else {
        const listener = event => this.exec(handler, options, event);
        target.addEventListener(type, listener, {once: true});
        this.onFinish(() => target.removeEventListener(type, listener));
      }
    }
    return this;
  }

  isPriorEvent(target, type) {
    if (this.isWindowLoadEvent(target, type) || this.isWindowInteractiveEvent(target, type)) {
      switch (document.readyState) {
      case "loading":     return false;
      case "complete":    return true;
      case "interactive": return this.isWindowInteractiveEvent(target, type);
      }
    } else if (this.isFinishEvent(target, type)) {
      return target.finished;
    }
    return false;
  }

  isWindowLoadEvent(target, type) { return target === window && /^load$/i.test(type); }
  isWindowInteractiveEvent(target, type) { return target === window && /^domcontentloaded$/i.test(type); }
  isFinishEvent(target, type) { return "finished" in target && /^finish$/i.test(type); }
}

class Animator extends Operator {
  static isShown(elem) { return elem && elem.classList.contains("show"); }

  toggle(elem, show, timeoutDelay = 3000) {
    if (Animator.isShown(elem) === !!show) { return; }

    const animate = (operation) => {
      if (!operation.finished) {
        elem.classList[(show ? "add" : "remove")]("show");
      }
    };

    return new Operator(`Animate${show ? "Show" : "Hide"}`)
      // Ensure animation always reaches final state on timeout
      .onTimeout(timeoutDelay, operation => { animate(operation); operation.resolve(); })
      .onEvent(elem, "transitionend", operation => operation.resolve())
      .onEvent(this.operation, "finish", operation => operation.reject("Interrupted"))
      .onStart(operation => {
        requestAnimationFrame(() => { // Delay until element has been rendered
          setTimeout(() => {
            animate(operation);
          }, 1);
        });
      })
      .operation;
  }
}

class Draggable {
  constructor(elem) {
    this.elem = elem;
    this.x = this.y = this.left = this.top = this.insetTop = this.insetLeft = this.insetBottom = this.insetRight = this.finishHandler = undefined;
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onDrag = this.onDrag.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  start(finishHandler) {
    this.finishHandler = finishHandler;
    this.elem.querySelector(".draggable").addEventListener("mousedown", this.onMouseDown);
  }

  stop() {
    this.onMouseUp();
    this.elem.querySelector(".draggable").removeEventListener("mousedown", this.onMouseDown);
    this.finishHandler = undefined;
  }

  onMouseDown(e) {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    const minInsetX = rect.width - 30;
    const minInsetY = rect.height - 30;
    this.x = e.clientX;
    this.y = e.clientY;
    this.insetTop = e.clientY - rect.top - minInsetY;
    this.insetLeft = e.clientX - rect.left - minInsetX;
    this.insetBottom = rect.bottom - e.clientY - minInsetY;
    this.insetRight = rect.right - e.clientX - minInsetX;
    this.elem.classList.add("drag");
    document.addEventListener("mousemove", this.onDrag);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  onDrag(e) {
    e.preventDefault();
    const x = Math.max(this.insetLeft, Math.min(window.innerWidth - this.insetRight, e.clientX));
    const y = Math.max(this.insetTop, Math.min(window.innerHeight - this.insetBottom, e.clientY));
    const deltaX = this.x - x;
    const deltaY = this.y - y;
    this.x = x;
    this.y = y;
    this.left = this.elem.offsetLeft - deltaX;
    this.top = this.elem.offsetTop - deltaY;
    Draggable.moveTo(this.elem, this.left, this.top);
  }

  onMouseUp() {
    this.elem.classList.remove("drag");
    document.removeEventListener("mousemove", this.onDrag);
    window.removeEventListener("mouseup", this.onMouseUp);
    if (this.finishHandler) {
      this.finishHandler(this.left, this.top);
    }
  }

  static moveTo(elem, x, y) {
    let left, top;
    if (x === undefined || y === undefined) {
      left = top = "";
    } else {
      left = `min(calc(100vw - 30px), ${x}px)`;
      top = `min(calc(100vh - 30px), ${y}px)`;
    }
    elem.style.left = left;
    elem.style.top = top;
  }
}

class Component {
  static async toggle(show, options) {
    const action = show ? "add" : "remove";
    const response = UI.request(this, action, options);
    return response.animating;
  }

  static getElement(isAll) {
    if (isAll) { return this.getElements(); }
    const unique = this.unique;
    if (unique) {
      if (unique.id) {
        return document.getElementById(unique.id);
      } else {
        const parentElem = this.getParentElement();
        return parentElem && parentElem.querySelector(unique.selector);
      }
    }
  }

  static getElements() {
    const identifier = this.all || this.unique;
    if (identifier) {
      const parents = this.getParentElement(true);
      if (parents) {
        const selector = identifier.selector || `#${identifier.id}`;
        return parents.flatMap(parent => Array.from(parent.querySelectorAll(selector)));
      }
    }
  }

  static getParentElement(isAll) {
    const parent = this.parent;
    return "querySelector" in parent ? (isAll ? [parent] : parent) : parent.getElement(isAll);
  }

  static get options() { return this.unique || this.all ? ["all"] : []; }
  static isReady()     { return true; }
  static toString()    { return this.name; }
}

const UI = {
  requests: {
    _store: [],
    getRequest: function(component) {
      if (component.unique) { return this._store[component.name]; }
    },
    addRequest: function(request) {
      if (request.component.unique) { this._store[request.component.name] = request; }
    },
    removeRequest: function(request) {
      if (this._store[request.component.name] === request) {
        this._store[request.component.name] = undefined;
      }
    }
  },

  request: function(component, action, options = {}) {
    const request = new UI.Request(component, action, options);
    const previous = this.requests.getRequest(component);

    // Already requested
    if (request.isEqual(previous)) { return previous.response; }

    // Element already added/removed
    if (!previous) {
      if (component.unique || request.options.all) {
        const elem = component.getElement(request.options.all);
        if (elem && (!request.options.all || elem.length > 0)) {
          if (action === "add") { if (component.isReady(elem, options)) { return UI.Response.element(elem); } }
        } else {
          if (action === "remove") { return UI.Response.element(null); }
        }
      }
    }

    if (component.unique || request.options.all) { this.requests.addRequest(request); }
    return new UI.Requestor(request, previous)
      .onFinish(() => this.requests.removeRequest(request))
      .submit();
  },

  Requestor: class extends Operator {
    constructor (request, previous) {
      super(`${request}`);
      this.request = request;
      this.previous = previous;
      this.modifiedDOM = new Defer();
      this.request.response = new UI.Response(this.modifiedDOM, this.operation);
      this.operation.addFinishListener(() => this.modifiedDOM.reject()); // Terminate immediately on interrupt
    }

    submit() {
      this.performRequest();
      return this.request.response;
    }

    async performRequest() {
      try {
        await this.stillAnimatingPrevious();
        const existing = this.request.component.getElement(this.request.options.all);
        const elem = await (this.request.action === "add" ? this.addElement(existing) : this.removeElement(existing));
        this.modifiedDOM.resolve(elem);
        this.operation.resolve(elem);
      } catch (e) {
        this.modifiedDOM.reject(e);
        this.operation.reject(e);
      }
    }

    async addElement(elem) {
      const alreadyAdded = elem;
      if (!alreadyAdded) {
        elem = await this.createElement();
        const parentElem = this.request.component.getParentElement() || await this.addParentElement();
        if (this.request.component.prepend) {
          parentElem.prepend(elem);
        } else {
          parentElem.appendChild(elem);
        }
      }

      await this.event("onUpdate", elem);
      this.modifiedDOM.resolve(elem); // Resolve before start animating
      if (!alreadyAdded || !this.request.component.isReady(elem)) {
        await this.event("onAdd", elem);
      }
      return elem;
    }

    async removeElement(elem) {
      if (elem) {
        const removeOne = async elem => {
          await this.event("onRemove", elem);
          if (this.request.options.hide) {
            elem.style.display = "none";
          } else {
            elem.remove();
          }
        };
        if (this.request.options.all) {
          await Promise.all(elem.map(e => removeOne(e)));
        } else {
          await removeOne(elem);
        }
      }
      return elem;
    }

    async stillAnimatingPrevious() {
      if (this.previous) {
        try { await this.previous.response.animating; } catch (e) { /* Ignore request success/failure */ }
        this.operation.mustBeRunning();
      }
    }

    async addParentElement() {
      const elem = await UI.request(this.request.component.parent, "add", this.request.options).modifyingDOM;
      this.operation.mustBeRunning();
      return elem;
    }

    async createElement() {
      const elem = await this.request.component.create(this.operation, this.request.options);
      this.operation.mustBeRunning();
      return elem;
    }

    async event(name, elem) {
      if (this.request.component[name]) {
        await this.request.component[name](elem, this.operation, this.request.options);
        this.operation.mustBeRunning();
      }
    }
  },

  Request: class {
    constructor (component, action, options) {
      this.component = component;
      this.action = action;
      this.options = this.validateOptions(options);
      this.response = undefined;
    }

    validateOptions(options) {
      return options && this.component.options.reduce((result, key) => {
        if (key in options) {
          let value = options[key];
          if (key === "all") { value = this.action === "remove" && (this.component.all || this.component.unique) ? !!value : undefined; }
          if (value !== undefined) { result[key] = value; }
        }
        return result;
      }, {});
    }

    isEqual(other) {
      return other && other.component === this.component && other.action === this.action && this.isEqualOptions(other.options);
    }

    isEqualOptions(options) {
      return options === this.options || (options && this.options &&
        Object.keys(this.component.options).every(k => options[k] === this.options[k]));
    }

    toString() { return `${this.component}::${this.action}::${JSON.stringify(this.options)}`; }
  },

  Response: class {
    constructor (modifyingDOM, animating) {
      this.modifyingDOM = modifyingDOM;
      this.animating = animating || modifyingDOM;
    }

    static element(elem) {
      return new this(Promise.resolve(elem));
    }
  },

  Container: class extends Component {
    static get parent()  { return document.body; }
    static get unique()  { return { id: "container-notifications" }; }
    static create() {
      const elem = document.createElement("div");
      elem.id = this.unique.id;
      return elem;
    }
  },

  Popup: class extends Component {
    static get parent()  { return UI.Container; }
    static get unique()  { return { selector: ".popup" }; }
    static get prepend() { return true; }
    static get options() { return ["all", "hide", "x", "y", "width", "height", "tabId"]; }
    static create(operation, options) {
      const popup = document.createElement("div");
      const mask = document.createElement("div");
      const draggable = document.createElement("div");
      const iframe = document.createElement("iframe");
      const popupURL = browser.runtime.getURL("/popup.html");
      const popupQueryString = options.tabId ? `?tabId=${options.tabId}` : "";
      popup.classList.add("popup");
      mask.classList.add("draggable-mask");
      draggable.classList.add("draggable");
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
      iframe.src = `${popupURL}${popupQueryString}`;
      popup.appendChild(draggable);
      popup.appendChild(iframe);
      popup.appendChild(mask);
      Draggable.moveTo(popup, options.x, options.y);
      new Draggable(popup).start((x, y) => {
        browser.runtime.sendMessage({ method:"setTabPopupPosition", tabId:options.tabId, x, y });
      });
      return popup;
    }
    static isReady(elem) { return elem.style.display !== "none"; }
    static onUpdate(popup, operation, options) {
      popup.style.display = "";
      if (!options) { return; }
      if (options.width) {
        const width = options.width;
        const height = options.height || 400;
        popup.style.width = `${width}px`;
        popup.querySelector("iframe").style.height = `${height}px`;
      }
      if (options.x && options.y) {
        Draggable.moveTo(popup, options.x, options.y);
      }
    }
  },

  Recording: class extends Component {
    static get parent()  { return UI.Container; }
    static get unique()  { return { selector: ".recording" }; }
    static get prepend() { return true; }
    static async create(operation) {
      const elem = await UI.Message.create(operation, {
        title: "Recording",
        text: "Sites will be automatically added to this container as you browse in this tab",
        component: this
      });
      elem.classList.add("recording");
      return elem;
    }
    static isReady(elem)             { return Animator.isShown(elem); }
    static onAdd(elem, operation)    { return new Animator(operation).toggle(elem, true); }
    static onRemove(elem, operation) { return new Animator(operation).toggle(elem, false); }
  },

  Message: class extends Component {
    static get parent()  { return UI.Container; }
    static get all()     { return { selector: ".message" }; }
    static get options() { return ["all", "title", "text"]; }
    static async create(operation, options) {
      // Ideally we would use https://bugzilla.mozilla.org/show_bug.cgi?id=1340930 when this is available

      // Message
      const msgElem = document.createElement("div");

      // Icon
      const imageElem = document.createElement("div");
      const imagePath = browser.extension.getURL("/img/container-site-d-24.png");
      imageElem.style.background = `url("${imagePath}") no-repeat center center / cover`;
      imageElem.classList.add("logo");
      msgElem.appendChild(imageElem);

      // Title
      if (options.title) {
        const titleElem = document.createElement("div");
        titleElem.classList.add("title");
        titleElem.innerText = options.title;
        msgElem.appendChild(titleElem);
      }

      // Text
      const textElem = document.createElement("div");
      textElem.classList.add("text");
      textElem.innerText = options.text;
      msgElem.appendChild(textElem);

      // Close
      const closeElem = document.createElement("div");
      closeElem.classList.add("close");
      msgElem.appendChild(closeElem);

      // Real/dummy wrappers (required for stacking & sliding animations)
      const dummyElem = document.createElement("div");
      dummyElem.appendChild(msgElem);
      const realElem = document.importNode(dummyElem, true); // Clone
      dummyElem.classList.add("dummy"); // For sizing
      realElem.classList.add("real");   // For display

      // Close listener
      const finishedAnimating = operation.resolve;
      realElem.querySelector(".close").addEventListener("click", (e) => {
        finishedAnimating();
        e.target.closest(".message").classList.remove("show");
      });

      // Outer container
      const elem = document.createElement("div");
      elem.classList.add("message");
      elem.appendChild(dummyElem);
      elem.appendChild(realElem);

      return elem;
    }
    static async onAdd(elem, operation) {
      const animator = new Animator(operation);
      await animator.toggle(elem, true);
      await animator.delay(3000);
      await animator.toggle(elem, false);
      elem.remove();
    }
    static onRemove(elem, operation) { return new Animator(operation).toggle(elem, false); }
  }
};

class Message extends Operation {
  constructor(message) { super(); this.message = message; }

  async handleMessage() {
    if (!UI.initialised) {
      UI.initialised = true;
      await Promise.all([UI.Popup.toggle(false, {all:true}), UI.Message.toggle(false, {all:true})]);
    }

    const message = this.message;
    let animatePopup, animateRecording, animateMessage;
    if ("popup"     in message) { animatePopup     = UI.Popup.toggle(message.popup, message.popupOptions); }
    if ("recording" in message) { animateRecording = UI.Recording.toggle(message.recording); }
    if ("text"      in message) { animateMessage   = UI.Message.toggle(true, message); }
    return Promise.all([animatePopup, animateRecording, animateMessage]);
  }
  toString() { return `Message: ${JSON.stringify(this.message)}`; }

  static async add(message) {
    await new Operator(new Message(message))
      .onEvent(window, "unload", operation => operation.reject("window unload"))
      .onEvent(window, "DOMContentLoaded", operation => operation.resolve(operation.handleMessage()))
      .operation;
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message.to === "tab") {
    return Message.add(message.content);
  }
});
