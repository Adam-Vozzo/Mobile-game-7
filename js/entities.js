// Player ship (asteroids-style + mining laser), autonomous bots, factories.
(function (G) {
  "use strict";
  const U = G.util;
  const CFG = G.CFG;
  const T = CFG.world.threshold;

  // ---------------- Player ----------------
  function Player(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.beam = { active: false, x1: 0, y1: 0, x2: 0, y2: 0 };
    this.thrusting = 0;
  }

  Player.prototype.update = function (dt, input, stats, world, game) {
    // --- steering ---
    let thrust = 0;
    if (input.joyActive) {
      this.angle = U.lerpAngle(this.angle, input.joyDir, Math.min(1, stats.turnRate * dt));
      thrust = input.joyMag;
    } else {
      this.angle += input.keyTurn * stats.turnRate * dt;
      thrust = input.keyThrust;
    }
    this.thrusting = thrust;
    const nx = Math.cos(this.angle),
      ny = Math.sin(this.angle);
    this.vx += nx * stats.accel * thrust * dt;
    this.vy += ny * stats.accel * thrust * dt;

    // --- drag (heavier inside dense rock) ---
    const dens = world.densityAt(this.x, this.y);
    let keep = Math.pow(CFG.player.drag, dt * 60);
    if (dens > T) keep *= Math.pow(0.62, dt * 60 * ((dens - T) / (1 - T)));
    this.vx *= keep;
    this.vy *= keep;

    // --- speed clamp ---
    const sp = Math.hypot(this.vx, this.vy);
    const lim = stats.maxSpeed * (dens > T ? 0.55 : 1);
    if (sp > lim) {
      this.vx = (this.vx / sp) * lim;
      this.vy = (this.vy / sp) * lim;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Keep inside the core.
    const r = Math.hypot(this.x, this.y);
    const maxR = world.radius - stats.playerRadius;
    if (r > maxR) {
      const k = maxR / r;
      this.x *= k;
      this.y *= k;
      this.vx *= 0.3;
      this.vy *= 0.3;
    }

    // --- mining laser: raymarch forward to the rock surface, carve it ---
    const range = stats.laserRange;
    const step = CFG.laser.step;
    const sx = this.x + nx * stats.playerRadius;
    const sy = this.y + ny * stats.playerRadius;
    let hit = false,
      hx = 0,
      hy = 0;
    for (let dd = 0; dd <= range; dd += step) {
      const px = sx + nx * dd,
        py = sy + ny * dd;
      if (world.densityAt(px, py) > T) {
        hit = true;
        hx = px;
        hy = py;
        break;
      }
    }
    this.beam.active = hit;
    this.beam.x1 = sx;
    this.beam.y1 = sy;
    if (hit) {
      this.beam.x2 = hx;
      this.beam.y2 = hy;
      const got = world.carve(hx, hy, stats.carveR, stats.laserPower * dt);
      game.addResources(got.minerals * stats.yield, got.crystals * stats.yield);
      game.spawnSpark(hx, hy);
    } else {
      this.beam.x2 = sx + nx * range;
      this.beam.y2 = sy + ny * range;
    }
  };

  // ---------------- Bot ----------------
  function Bot(x, y, factory, seed) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.mode = "seek";
    this.target = null;
    this.carry = 0;
    this.carryC = 0;
    this.retarget = 0;
    this.factory = factory;
    this.rng = U.mulberry32(seed);
    this.beam = false;
  }

  Bot.prototype.update = function (dt, stats, world, game) {
    const home = this.factory;
    if (this.mode === "seek") {
      this.retarget -= dt;
      if (!this.target || this.retarget <= 0) {
        this.retarget = CFG.bot.retargetTime;
        this.target = world.findRockNear(this.x, this.y, CFG.bot.searchRing * stats.sqrtI, this.rng);
        if (!this.target) {
          // Drift around home until rock appears.
          const a = this.rng() * U.TAU;
          this.target = { x: home.x + Math.cos(a) * 60 * stats.sqrtI, y: home.y + Math.sin(a) * 60 * stats.sqrtI };
        }
      }
      this._steer(dt, this.target.x, this.target.y, stats);
      if (U.dist(this.x, this.y, this.target.x, this.target.y) < stats.botCarveR * 1.3) {
        if (world.densityAt(this.x, this.y) > T) this.mode = "mine";
        else this.target = null;
      }
    } else if (this.mode === "mine") {
      this.beam = true;
      const got = world.carve(this.x, this.y, stats.botCarveR, stats.botPower * dt);
      this.carry += got.minerals * stats.yield;
      this.carryC += got.crystals * stats.yield;
      game.spawnSpark(this.x, this.y);
      if (this.carry >= stats.botCapacity || world.densityAt(this.x, this.y) <= T) {
        this.beam = false;
        this.mode = "return";
        this.target = null;
      }
    } else {
      // return
      this._steer(dt, home.x, home.y, stats);
      if (U.dist(this.x, this.y, home.x, home.y) < CFG.bot.depositRange * stats.sqrtI) {
        game.addResources(this.carry, this.carryC, true);
        game.spawnDeposit(home.x, home.y);
        this.carry = 0;
        this.carryC = 0;
        this.mode = "seek";
      }
    }
  };

  Bot.prototype._steer = function (dt, tx, ty, stats) {
    const dir = Math.atan2(ty - this.y, tx - this.x);
    const speed = stats.botSpeed;
    const dvx = Math.cos(dir) * speed,
      dvy = Math.sin(dir) * speed;
    const k = Math.min(1, 5 * dt);
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.vx || this.vy) this.angle = Math.atan2(this.vy, this.vx);
  };

  // ---------------- Factory ----------------
  function Factory(x, y, seed) {
    this.x = x;
    this.y = y;
    this.seed = seed >>> 0;
    this.bots = [];
    this.assemble = 0;
    this.panel = "factory";
    this.r = 14;
    this.spin = 0;
  }

  Factory.prototype.update = function (dt, stats, world, game) {
    this.spin += dt * 0.6;
    if (this.bots.length < Math.floor(stats.botBay)) {
      this.assemble += dt;
      if (this.assemble >= CFG.bot.assembleTime) {
        this.assemble = 0;
        this.bots.push(new Bot(this.x, this.y, this, (this.seed + this.bots.length * 7919) >>> 0));
      }
    }
    for (let i = 0; i < this.bots.length; i++) this.bots[i].update(dt, stats, world, game);
  };

  // ---------------- Base ----------------
  function Base() {
    this.x = 0;
    this.y = 0;
    this.panel = "base";
    this.r = 18;
    this.spin = 0;
  }
  Base.prototype.update = function (dt) {
    this.spin += dt * 0.4;
  };

  G.Player = Player;
  G.Bot = Bot;
  G.Factory = Factory;
  G.Base = Base;
})(window.G);
