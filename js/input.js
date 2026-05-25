// Unified input: keyboard (rotate/thrust/interact) and touch (floating
// joystick for steering + thrust, taps for opening buildings).
(function (G) {
  "use strict";
  const U = G.util;

  function Input() {
    this.keyTurn = 0;
    this.keyThrust = 0;
    this.interactEdge = false;
    this.joyActive = false;
    this.joyDir = 0;
    this.joyMag = 0;
    this.joyBase = { x: 0, y: 0 }; // CSS px relative to canvas
    this.joyKnob = { x: 0, y: 0 };
    this._taps = [];
    this._keys = {};
    this._touch = null; // active joystick touch/pointer
    this._pending = null; // candidate tap pointer
    this.canvas = null;
    this.deadzone = 10;
    this.maxRadius = 56;
  }

  Input.prototype.attach = function (canvas) {
    this.canvas = canvas;
    const self = this;

    window.addEventListener("keydown", function (e) {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      self._keys[k] = true;
      if (k === "e" || k === "enter") self.interactEdge = true;
      self._syncKeys();
    });
    window.addEventListener("keyup", function (e) {
      self._keys[e.key.toLowerCase()] = false;
      self._syncKeys();
    });

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left), y: (t.clientY - r.top), w: r.width, h: r.height };
    };

    // Touch
    canvas.addEventListener("touchstart", function (e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const r = canvas.getBoundingClientRect();
        self._begin(t.identifier, t.clientX - r.left, t.clientY - r.top, r.width, r.height);
      }
    }, { passive: false });
    canvas.addEventListener("touchmove", function (e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        self._move(t.identifier, t.clientX - r.left, t.clientY - r.top);
      }
    }, { passive: false });
    const endTouch = function (e) {
      const r = canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        self._end(t.identifier, t.clientX - r.left, t.clientY - r.top);
      }
    };
    canvas.addEventListener("touchend", endTouch, { passive: false });
    canvas.addEventListener("touchcancel", endTouch, { passive: false });

    // Mouse (desktop / headless testing)
    canvas.addEventListener("mousedown", function (e) {
      const p = pos(e);
      self._begin("mouse", p.x, p.y, p.w, p.h);
    });
    window.addEventListener("mousemove", function (e) {
      if (self._touch === "mouse" || self._pending) {
        const r = canvas.getBoundingClientRect();
        self._move("mouse", e.clientX - r.left, e.clientY - r.top);
      }
    });
    window.addEventListener("mouseup", function (e) {
      const r = canvas.getBoundingClientRect();
      self._end("mouse", e.clientX - r.left, e.clientY - r.top);
    });
  };

  Input.prototype._syncKeys = function () {
    const k = this._keys;
    this.keyTurn = (k["arrowright"] || k["d"] ? 1 : 0) - (k["arrowleft"] || k["a"] ? 1 : 0);
    this.keyThrust = k["arrowup"] || k["w"] ? 1 : 0;
  };

  Input.prototype._begin = function (id, x, y, w, h) {
    const movementZone = x < w * 0.55; // left side steers
    const cand = { id, x0: x, y0: y, x, y, t0: U.now(), moved: false, isJoy: false, movementZone };
    if (movementZone) {
      this._touch = id;
      this.joyBase = { x, y };
      this.joyKnob = { x, y };
      this._cand = cand;
    }
    this._pending = cand; // every pointer is a tap candidate until it moves
  };

  Input.prototype._move = function (id, x, y) {
    const c = this._cand && this._cand.id === id ? this._cand : null;
    if (this._pending && this._pending.id === id) {
      this._pending.x = x;
      this._pending.y = y;
      if (U.dist(x, y, this._pending.x0, this._pending.y0) > this.deadzone) this._pending.moved = true;
    }
    if (c && this._touch === id) {
      let dx = x - c.x0,
        dy = y - c.y0;
      const len = Math.hypot(dx, dy);
      if (len > this.deadzone) c.isJoy = true;
      if (c.isJoy) {
        const r = Math.min(len, this.maxRadius);
        const ang = Math.atan2(dy, dx);
        this.joyActive = true;
        this.joyDir = ang;
        this.joyMag = r / this.maxRadius;
        this.joyKnob = { x: c.x0 + Math.cos(ang) * r, y: c.y0 + Math.sin(ang) * r };
      }
    }
  };

  Input.prototype._end = function (id, x, y) {
    const p = this._pending;
    if (p && p.id === id) {
      if (!p.moved && U.now() - p.t0 < 280) this._taps.push({ x, y });
      this._pending = null;
    }
    if (this._touch === id) {
      this._touch = null;
      this._cand = null;
      this.joyActive = false;
      this.joyMag = 0;
    }
  };

  // Game consumes taps (CSS px relative to canvas).
  Input.prototype.consumeTaps = function () {
    const t = this._taps;
    this._taps = [];
    return t;
  };
  Input.prototype.consumeInteract = function () {
    const v = this.interactEdge;
    this.interactEdge = false;
    return v;
  };

  G.Input = Input;
})(window.G);
