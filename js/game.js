// Game orchestration: state, loop, low-res rendering, interaction, economy glue.
(function (G) {
  "use strict";
  const U = G.util;
  const CFG = G.CFG;
  const COL = CFG.COL;
  const Eco = G.Economy;

  function Game() {
    this.state = Eco.defaultState();
    this.state.yieldMult = 1;
    this.state.ascends = 0;
    this.stats = Eco.derive(this.state);
    this.factories = [];
    this.particles = [];
    this.botIncomeEMA = 0;
    this._botAccum = 0;
    this._secTimer = 0;
    this._saveTimer = 0;
    this.won = false;
    this.time = 0;
  }

  Game.prototype.init = function (canvas) {
    this.canvas = canvas;
    this.dctx = canvas.getContext("2d");
    this.icv = document.createElement("canvas");
    this.ictx = this.icv.getContext("2d");
    this.cam = new G.Camera();
    this.input = new G.Input();
    this.input.attach(canvas);
    G.UI.init(this);

    const data = G.Save.load();
    if (data && data.econ) this.loadFrom(data);
    else this.startNew();

    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) G.Save.save(this);
    });

    this.cam.snap(this.player.x, this.player.y, this.stats.influence, this.iw);
    G.UI.updateHUD(this);
    this._last = U.now();
    const self = this;
    requestAnimationFrame(function loop(t) {
      self.loop(t);
      requestAnimationFrame(loop);
    });
  };

  Game.prototype.startNew = function () {
    this.world = new G.World((Math.random() * 1e9) >>> 0);
    this.base = new G.Base();
    this.player = new G.Player(0, 0);
    this.factories = [];
    this.recomputeStats();
    G.UI.toast("Steer with the left side. Aim the laser at rock. Tap BASE to upgrade.", 6000);
  };

  Game.prototype.loadFrom = function (data) {
    this.state = data.econ;
    if (this.state.yieldMult == null) this.state.yieldMult = 1;
    if (this.state.ascends == null) this.state.ascends = 0;
    this.world = new G.World(data.seed >>> 0);
    if (data.density) G.Save.applyDensity(this.world, data.density);
    if (typeof data.removed === "number") this.world.removedTotal = data.removed;
    this.base = new G.Base();
    this.player = new G.Player(data.player ? data.player.x : 0, data.player ? data.player.y : 0);
    if (data.player) this.player.angle = data.player.angle;
    this.factories = [];
    this.recomputeStats();
    if (data.factories) {
      for (const f of data.factories) {
        const fac = new G.Factory(f.x, f.y, f.seed >>> 0);
        const n = Math.min(f.bots || 0, Math.floor(this.stats.botBay));
        for (let i = 0; i < n; i++) fac.bots.push(new G.Bot(fac.x, fac.y, fac, (fac.seed + i * 7919) >>> 0));
        this.factories.push(fac);
      }
    }
    this.botIncomeEMA = data.botIncome || 0;
    // Offline income.
    const elapsed = U.clamp((Date.now() - (data.t || Date.now())) / 1000, 0, 8 * 3600);
    if (elapsed > 5 && this.botIncomeEMA > 0) {
      const gained = this.botIncomeEMA * elapsed * 0.6;
      if (gained >= 1) {
        this.state.minerals += gained;
        this.state.crystals += gained * 0.015;
        const mins = Math.floor(elapsed / 60);
        G.UI.toast("Bots mined ◈" + U.formatNum(gained) + " while away (" + (mins > 0 ? mins + "m" : Math.floor(elapsed) + "s") + ")", 5000);
      }
    }
  };

  Game.prototype.recomputeStats = function () {
    this.stats = Eco.derive(this.state);
    this.stats.yield *= this.state.yieldMult || 1;
  };

  Game.prototype.addResources = function (m, c, fromBot) {
    this.state.minerals += m;
    this.state.crystals += c;
    if (fromBot) this._botAccum += m;
  };

  Game.prototype.buyUpgrade = function (id) {
    if (!Eco.canAfford(this.state, id)) return false;
    if (id === "factory") {
      Eco.purchase(this.state, id);
      this.spawnFactory(this.player.x, this.player.y);
    } else {
      Eco.purchase(this.state, id);
    }
    this.recomputeStats();
    if (id === "influence") G.UI.toast("Influence grown to x" + U.formatNum(this.stats.influence), 2500);
    G.UI.updateHUD(this);
    return true;
  };

  Game.prototype.spawnFactory = function (x, y) {
    const fac = new G.Factory(x, y, (Math.random() * 1e9) >>> 0);
    this.world.clearCircle(x, y, 22 * this.stats.sqrtI);
    this.factories.push(fac);
    G.UI.toast("Factory deployed. It will assemble mining bots.", 3000);
  };

  Game.prototype.ascend = function () {
    const bonus = 0.5;
    this.state.ascends = (this.state.ascends || 0) + 1;
    this.state.yieldMult = (this.state.yieldMult || 1) * (1 + bonus);
    this.state.minerals = 0;
    this.state.crystals = 0;
    this.state.levels = Eco.defaultState().levels;
    this.world = new G.World((Math.random() * 1e9) >>> 0);
    this.player = new G.Player(0, 0);
    this.factories = [];
    this.particles = [];
    this.won = false;
    this.recomputeStats();
    this.cam.snap(0, 0, this.stats.influence, this.iw);
    G.UI.close();
    G.UI.updateHUD(this);
    G.UI.toast("ASCENDED x" + this.state.ascends + " — permanent +" + Math.round(bonus * 100) + "% yield. New core seeded.", 6000);
  };

  // ---- particles ----
  Game.prototype.spawnSpark = function (x, y) {
    if (this.particles.length > 220) return;
    if (Math.random() > 0.45) return;
    const a = Math.random() * U.TAU;
    const s = 20 + Math.random() * 40;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, max: 0.7, c: COL.beam });
  };
  Game.prototype.spawnDeposit = function (x, y) {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5);
      this.particles.push({ x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.6, max: 0.6, c: COL.crystal });
    }
  };
  Game.prototype.updateParticles = function (dt) {
    const p = this.particles;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
      q.life -= dt;
      if (q.life <= 0) p.splice(i, 1);
    }
  };

  // ---- interaction ----
  Game.prototype.buildings = function () {
    return [this.base].concat(this.factories);
  };

  Game.prototype.handleInput = function () {
    // Interact key: open nearest building in range.
    if (this.input.consumeInteract()) {
      const near = this._nearestBuilding(this.player.x, this.player.y, CFG.interactRange * this.stats.sqrtI);
      if (near) {
        if (G.UI.open && G.UI.building === near) G.UI.close();
        else G.UI.openPanel(near.panel, near, this);
      } else {
        G.UI.toggleBase(this);
      }
    }
    // Taps: hit-test buildings in screen space.
    const taps = this.input.consumeTaps();
    for (const tap of taps) {
      const ix = (tap.x / this.cssW) * this.iw;
      const iy = (tap.y / this.cssH) * this.ih;
      let hit = null;
      for (const b of this.buildings()) {
        const sp = this.cam.worldToScreen(b.x, b.y, this.iw, this.ih);
        const rPix = Math.max(b.r * this.cam.scale, 10) + 12;
        if (U.dist(ix, iy, sp.x, sp.y) < rPix) {
          hit = b;
          break;
        }
      }
      if (hit) G.UI.openPanel(hit.panel, hit, this);
    }
  };

  Game.prototype._nearestBuilding = function (x, y, range) {
    let best = null,
      bd = range * range;
    for (const b of this.buildings()) {
      const d = U.dist2(x, y, b.x, b.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  };

  // ---- main update ----
  Game.prototype.simulate = function (dt, frozen) {
    this.time += dt;
    this.base.update(dt);
    for (const f of this.factories) f.update(dt, this.stats, this.world, this);
    if (!frozen) this.player.update(dt, this.input, this.stats, this.world, this);
    this.updateParticles(dt);
    const vx = frozen ? 0 : this.player.vx,
      vy = frozen ? 0 : this.player.vy;
    this.cam.update(dt, this.player.x, this.player.y, vx, vy, this.stats.influence, this.iw);

    // Bot income EMA (for offline calc) + autosave.
    this._secTimer += dt;
    if (this._secTimer >= 1) {
      this.botIncomeEMA = U.lerp(this.botIncomeEMA, this._botAccum / this._secTimer, 0.4);
      this._botAccum = 0;
      this._secTimer = 0;
      G.UI.updateHUD(this);
      if (G.UI.open) G.UI.refresh(this);
    }
    this._saveTimer += dt;
    if (this._saveTimer >= CFG.save.interval) {
      this._saveTimer = 0;
      G.Save.save(this);
    }

    // Proximity prompt + win check.
    if (!frozen) {
      const near = this._nearestBuilding(this.player.x, this.player.y, CFG.interactRange * this.stats.sqrtI);
      G.UI.setPrompt(near ? (near.panel === "base" ? "Tap base · or press E" : "Tap factory · or press E") : null);
    } else {
      G.UI.setPrompt(null);
    }

    if (!this.won && this.world.carvedFraction() > 0.9) {
      this.won = true;
      G.UI.toast("CORE ASSIMILATED — open BASE to Ascend", 7000);
    }
  };

  // ---- rendering ----
  Game.prototype.resize = function () {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = cssW;
    this.cssH = cssH;
    const backingW = Math.round(cssW * dpr);
    const backingH = Math.round(cssH * dpr);
    this.canvas.width = backingW;
    this.canvas.height = backingH;
    this.iw = Math.min(CFG.render.targetInternalW, backingW);
    this.ih = Math.max(1, Math.round(this.iw * (backingH / backingW)));
    this.icv.width = this.iw;
    this.icv.height = this.ih;
    this.backingW = backingW;
    this.backingH = backingH;
  };

  Game.prototype.render = function () {
    const ctx = this.ictx,
      iw = this.iw,
      ih = this.ih;
    // Background with a soft central glow.
    const g = ctx.createRadialGradient(iw / 2, ih / 2, 0, iw / 2, ih / 2, Math.max(iw, ih) * 0.7);
    g.addColorStop(0, COL.bgCenter);
    g.addColorStop(1, COL.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, iw, ih);

    this.world.render(ctx, this.cam, iw, ih);
    this.drawEntities(ctx, iw, ih);
    this.drawParticles(ctx, iw, ih);

    // Upscale to the display canvas (crisp chunky pixels).
    const d = this.dctx;
    d.imageSmoothingEnabled = false;
    d.clearRect(0, 0, this.backingW, this.backingH);
    d.drawImage(this.icv, 0, 0, iw, ih, 0, 0, this.backingW, this.backingH);
    this.drawOverlay(d);
  };

  Game.prototype.drawEntities = function (ctx, iw, ih) {
    const cam = this.cam;
    // Factories
    for (const f of this.factories) {
      const sp = cam.worldToScreen(f.x, f.y, iw, ih);
      this.drawFactory(ctx, sp.x, sp.y, Math.max(f.r * cam.scale, 6), f.spin);
      for (const b of f.bots) this.drawBot(ctx, b, iw, ih);
    }
    // Base
    const bp = cam.worldToScreen(this.base.x, this.base.y, iw, ih);
    this.drawBase(ctx, bp.x, bp.y, Math.max(this.base.r * cam.scale, 9), this.base.spin);
    // Player + beam
    this.drawBeam(ctx, iw, ih);
    this.drawShip(ctx, iw, ih);
  };

  Game.prototype.drawBeam = function (ctx, iw, ih) {
    const b = this.player.beam;
    if (!b.active) return;
    const cam = this.cam;
    const a = cam.worldToScreen(b.x1, b.y1, iw, ih);
    const c = cam.worldToScreen(b.x2, b.y2, iw, ih);
    ctx.save();
    ctx.strokeStyle = COL.beam;
    ctx.lineWidth = 1;
    ctx.shadowColor = COL.beam;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    // impact flare
    ctx.fillStyle = COL.player;
    const fr = 1 + Math.sin(this.time * 30) * 0.6 + 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, fr, 0, U.TAU);
    ctx.fill();
    ctx.restore();
  };

  Game.prototype.drawShip = function (ctx, iw, ih) {
    const p = this.player;
    const cam = this.cam;
    const sp = cam.worldToScreen(p.x, p.y, iw, ih);
    const r = Math.max(this.stats.playerRadius * cam.scale, 3.5);
    const a = p.angle;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(a);
    ctx.strokeStyle = COL.player;
    ctx.fillStyle = COL.bg;
    ctx.lineWidth = 1;
    if (CFG.render.glow) {
      ctx.shadowColor = COL.player;
      ctx.shadowBlur = 3;
    }
    ctx.beginPath();
    ctx.moveTo(r * 1.4, 0);
    ctx.lineTo(-r, r * 0.85);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, -r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // thrust flame
    if (p.thrusting > 0.05) {
      ctx.strokeStyle = COL.bright;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(-r - r * 1.3 * p.thrusting * (0.7 + Math.random() * 0.6), 0);
      ctx.stroke();
    }
    ctx.restore();
  };

  Game.prototype.drawBot = function (ctx, b, iw, ih) {
    const sp = this.cam.worldToScreen(b.x, b.y, iw, ih);
    const r = Math.max(this.stats.playerRadius * this.cam.scale * 0.6, 2);
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = COL.bot;
    if (CFG.render.glow) {
      ctx.shadowColor = COL.bot;
      ctx.shadowBlur = 2;
    }
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(-r, r * 0.8);
    ctx.lineTo(-r, -r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (b.mode === "mine") {
      ctx.fillStyle = COL.beam;
      ctx.fillRect(sp.x - 1, sp.y - 1, 2, 2);
    }
  };

  Game.prototype.drawBase = function (ctx, x, y, r, spin) {
    ctx.save();
    ctx.strokeStyle = COL.bright;
    ctx.lineWidth = 1;
    if (CFG.render.glow) {
      ctx.shadowColor = COL.bright;
      ctx.shadowBlur = 4;
    }
    // main ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, U.TAU);
    ctx.stroke();
    // pulsing inner core
    const pr = r * (0.32 + 0.06 * Math.sin(this.time * 2));
    ctx.fillStyle = COL.bright;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(pr, 1.5), 0, U.TAU);
    ctx.fill();
    // attached node (echoes the reference art)
    const nx = x - r * 1.5,
      ny = y - r * 0.15;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(nx + r * 0.4, ny);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nx, ny, r * 0.4, 0, U.TAU);
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype.drawFactory = function (ctx, x, y, r, spin) {
    ctx.save();
    ctx.strokeStyle = COL.line;
    ctx.fillStyle = COL.bright;
    ctx.lineWidth = 1;
    if (CFG.render.glow) {
      ctx.shadowColor = COL.bright;
      ctx.shadowBlur = 3;
    }
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, U.TAU);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * U.TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4);
      ctx.stroke();
    }
    ctx.rotate(-spin);
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
  };

  Game.prototype.drawParticles = function (ctx, iw, ih) {
    const cam = this.cam;
    for (const q of this.particles) {
      const sp = cam.worldToScreen(q.x, q.y, iw, ih);
      ctx.globalAlpha = U.clamp(q.life / q.max, 0, 1);
      ctx.fillStyle = q.c;
      ctx.fillRect(sp.x | 0, sp.y | 0, 1, 1);
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawOverlay = function (d) {
    // Virtual joystick (drawn in backing px; input coords are CSS px).
    const sx = this.backingW / this.cssW;
    if (this.input.joyActive) {
      const bx = this.input.joyBase.x * sx,
        by = this.input.joyBase.y * sx;
      const kx = this.input.joyKnob.x * sx,
        ky = this.input.joyKnob.y * sx;
      d.save();
      d.strokeStyle = "rgba(116,224,255,0.35)";
      d.lineWidth = 2 * sx;
      d.beginPath();
      d.arc(bx, by, this.input.maxRadius * sx, 0, U.TAU);
      d.stroke();
      d.fillStyle = "rgba(116,224,255,0.5)";
      d.beginPath();
      d.arc(kx, ky, 14 * sx, 0, U.TAU);
      d.fill();
      d.restore();
    }
  };

  Game.prototype.loop = function (t) {
    let dt = (t - this._last) / 1000;
    this._last = t;
    if (!isFinite(dt) || dt <= 0) {
      this.render();
      return;
    }
    if (dt > 0.1) dt = 0.1; // clamp after tab stalls
    this.handleInput();
    this.simulate(dt, G.UI.open); // world keeps running; ship freezes while menuing
    this.render();
  };

  G.Game = Game;
})(window.G);
