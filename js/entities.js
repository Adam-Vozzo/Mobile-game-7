// Player ship (asteroids-style + mining laser + energy), autonomous bots that
// chip rock from the edge, factories with their own upgrades, and the cable.
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
    this.energy = 1e9; // clamped to max on first update -> starts full
    this.maxEnergy = 1;
    this.inBase = true;
    this.nearBase = true;
    this.rechargeSource = null;
    this.cargo = { m: 0, c: 0, k: 0 }; // credited (arrived) ore
    this.incoming = { m: 0, c: 0, k: 0 }; // ore in motes en route to the ship
    this._pend = { m: 0, c: 0, k: 0 }; // mined this tick, awaiting a mote
    this._pendT = 0;
    this._lastMine = { x: 0, y: 0 };
    this.cargoLoad = 0;
    this.maxCargo = 1;
    this._trail = [];
    this.heat = 0;
    this.overheated = false;
    this.brownout = false; // out of charge -> laser dead, augments dark, limp speed
  }

  // Free capacity, counting ore already credited + in flight + pending.
  Player.prototype.cargoRoom = function () {
    return this.maxCargo - (this.cargo.m + this.cargo.c + this.cargo.k + this.incoming.m + this.incoming.c + this.incoming.k + this._pend.m + this._pend.c + this._pend.k);
  };

  Player.prototype.update = function (dt, input, stats, world, game) {
    const P = CFG.player;
    const DEV = G.DEV;
    const aug = game.state.augments || {};
    const base = game.base;
    this.maxEnergy = stats.energyMax;
    this.maxCargo = stats.cargoCapacity;
    if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;

    // --- recharge / deposit source: base (fast) or nearest factory (slow) ---
    const dB = U.dist(this.x, this.y, base.x, base.y);
    let src = null,
      rate = 0;
    if (dB <= stats.baseRange) {
      src = base;
      rate = stats.recharge;
    } else {
      const fr = CFG.factory.range0 * stats.sqrtI;
      let bd = fr,
        bf = null;
      for (const f of game.factories) {
        const d = U.dist(this.x, this.y, f.x, f.y);
        if (d <= bd) {
          bd = d;
          bf = f;
        }
      }
      if (bf) {
        src = bf;
        rate = stats.recharge * CFG.factory.rechargeMult;
      }
    }
    this.nearBase = dB <= stats.baseRange;
    this.inBase = this.nearBase;
    this.rechargeSource = src;

    // Power brownout: at 0 energy the ship browns out and stays that way until
    // it recharges "a little" (hysteresis), so the laser/augments don't strobe
    // right at empty. The Recharger augment still works, so you can't soft-lock.
    if (DEV.infiniteEnergy) this.brownout = false;
    else if (this.energy <= 0) this.brownout = true;
    else if (this.brownout && this.energy >= stats.energyMax * P.brownoutRecover) this.brownout = false;
    const brownout = this.brownout;
    const moveMult = brownout ? P.depletedSpeed : 1;

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
    const dens = world.densityAt(this.x, this.y);
    // center in solid terrain => slow, unless Hull Plating / Phase Drive
    const rockMult = dens > T ? (aug.phaseDrive ? 1 : aug.hullPlating ? 0.35 : 0.1) : 1;
    this.vx += nx * stats.accel * moveMult * rockMult * thrust * dt;
    this.vy += ny * stats.accel * moveMult * rockMult * thrust * dt;

    let keep = Math.pow(DEV.glide, dt * 60);
    if (dens > T) keep *= Math.pow(0.5, dt * 60);
    this.vx *= keep;
    this.vy *= keep;

    const sp = Math.hypot(this.vx, this.vy);
    const lim = stats.maxSpeed * moveMult * rockMult;
    if (sp > lim) {
      this.vx = (this.vx / sp) * lim;
      this.vy = (this.vy / sp) * lim;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const r = Math.hypot(this.x, this.y);
    const maxR = world.radius - stats.playerRadius;
    if (r > maxR) {
      const k = maxR / r;
      this.x *= k;
      this.y *= k;
      this.vx *= 0.3;
      this.vy *= 0.3;
    }

    // --- mining laser (forward, or auto-aim to nearest rock) ---
    const pm = game.pulseMult ? game.pulseMult() : 1;
    const laserBlocked = brownout || (DEV.laserHeat && this.overheated);
    let firing = false;
    if (!laserBlocked) {
      const range = stats.laserRange;
      const step = CFG.laser.step;
      let sx, sy, hit = false, hx = 0, hy = 0;
      if (DEV.autoAim) {
        sx = this.x;
        sy = this.y;
        let best = Infinity;
        for (let a = 0; a < 18; a++) {
          const ang = (a / 18) * U.TAU,
            cx = Math.cos(ang),
            cy = Math.sin(ang);
          for (let dd = step; dd <= range; dd += step) {
            if (world.densityAt(sx + cx * dd, sy + cy * dd) > T) {
              if (dd < best) {
                best = dd;
                hx = sx + cx * dd;
                hy = sy + cy * dd;
                hit = true;
              }
              break;
            }
          }
        }
      } else {
        sx = this.x + nx * stats.playerRadius;
        sy = this.y + ny * stats.playerRadius;
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
      }
      this.beam.active = hit;
      this.beam.x1 = sx;
      this.beam.y1 = sy;
      if (hit) {
        firing = true;
        this.beam.x2 = hx;
        this.beam.y2 = hy;
        const got = world.carve(hx, hy, stats.carveR, stats.laserPower * dt);
        const gm = got.minerals * stats.yield * pm,
          gc = got.crystals * stats.yield * pm,
          gk = got.catalyst * stats.yield * pm;
        const tot = gm + gc + gk;
        if (tot > 0) {
          this._lastMine.x = hx;
          this._lastMine.y = hy;
          const f = DEV.noCargoLimit ? 1 : tot > Math.max(0, this.cargoRoom()) ? Math.max(0, this.cargoRoom()) / tot : 1;
          this._pend.m += gm * f;
          this._pend.c += gc * f;
          this._pend.k += gk * f;
          const of = 1 - f;
          // overflow becomes loose ore that floats until you have room
          if (of > 0.0001) game.addPickup(hx, hy, gm * of, gc * of, gk * of);
        }
        // veins flash + send ore to the ship; bare rock just throws dissipating dust
        if (tot > 0) game.spawnSpark(hx, hy);
        else game.spawnDust(hx, hy);
      } else {
        this.beam.x2 = sx + nx * range;
        this.beam.y2 = sy + ny * range;
      }
    } else {
      this.beam.active = false;
    }

    // laser heat (overheat experiment)
    if (DEV.laserHeat) {
      this.heat += (firing ? 0.5 : -0.62) * dt;
      if (this.heat < 0) this.heat = 0;
      if (this.heat >= 1) {
        this.heat = 1;
        this.overheated = true;
      } else if (this.overheated && this.heat <= 0.4) {
        this.overheated = false;
      }
    } else {
      this.heat = 0;
      this.overheated = false;
    }

    // flush mined ore toward the ship as a bundled mote (credited on arrival)
    this._pendT += dt;
    if (this._pendT >= 0.08 && this._pend.m + this._pend.c + this._pend.k > 0) {
      this._pendT = 0;
      this.incoming.m += this._pend.m;
      this.incoming.c += this._pend.c;
      this.incoming.k += this._pend.k;
      game.spawnCargoMote(this._lastMine.x, this._lastMine.y, this._pend.m, this._pend.c, this._pend.k);
      this._pend = { m: 0, c: 0, k: 0 };
    }

    // --- deposit cargo gradually at base/factory (motes flow ship -> source) ---
    const load = this.cargo.m + this.cargo.c + this.cargo.k;
    if (src && load > 0) {
      const take = Math.min(load, (this.maxCargo + 24) * (aug.tractor ? 2 : 1) * dt); // ~1s (0.5s with Tractor)
      const f = take / load;
      const dm = this.cargo.m * f,
        dc = this.cargo.c * f,
        dk = this.cargo.k * f;
      this.cargo.m -= dm;
      this.cargo.c -= dc;
      this.cargo.k -= dk;
      game.addResources(dm, dc, dk, false);
      game.spawnDepositMote(this.x, this.y, src.x, src.y);
    } else if (DEV.magnet && load > 0) {
      game.addResources(this.cargo.m, this.cargo.c, this.cargo.k, false);
      this.cargo.m = this.cargo.c = this.cargo.k = 0;
    }
    this.cargoLoad = this.cargo.m + this.cargo.c + this.cargo.k;

    // --- energy ---
    if (DEV.infiniteEnergy) {
      this.energy = this.maxEnergy;
    } else if (src) {
      this.energy += rate * DEV.recharge * dt;
    } else {
      if (aug.recharger) this.energy += stats.recharge * 0.22 * dt; // passive recharge away from base
      if (thrust > 0.05) this.energy -= P.energyMove * thrust * dt;
      if (firing) this.energy -= P.energyLaser * dt;
    }
    if (this.energy < 0) this.energy = 0;
    if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;

    // motion trail (drawn only when the toggle is on)
    this._trail.push({ x: this.x, y: this.y });
    if (this._trail.length > 22) this._trail.shift();
  };

  // ---------------- Bot (digs outward toward veins with a close-range laser) --
  function Bot(x, y, factory, seed) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.rng = U.mulberry32(seed);
    this.factory = factory;
    this.mode = "dig";
    this.heading = this.rng() * U.TAU;
    this.angle = this.heading;
    this.carry = { m: 0, c: 0, k: 0 };
    this.target = null; // a rich cell to dig toward
    this.retarget = this.rng() * CFG.bot.retargetTime;
    this.pulseT = this.rng() * 0.26;
    this.beamT = 0; // >0 while a pulse beam is visible
    this.mineX = x;
    this.mineY = y;
    this.beam = false;
  }

  // Sample nearby solid rock and pick the richest cell to dig toward (veins).
  Bot.prototype._findVein = function (world, bstats) {
    this.retarget = CFG.bot.retargetTime;
    const reach = bstats.botReach,
      R2 = world.radius * world.radius;
    let best = null,
      bestScore = -1;
    for (let s = 0; s < 14; s++) {
      const a = this.rng() * U.TAU;
      const r = 20 + this.rng() * reach;
      const px = this.x + Math.cos(a) * r,
        py = this.y + Math.sin(a) * r;
      if (px * px + py * py > R2) continue;
      if (world.densityAt(px, py) <= T) continue;
      const gi = U.clamp(Math.round((px + world.radius) / world.cell), 0, world.NX);
      const gj = U.clamp(Math.round((py + world.radius) / world.cell), 0, world.NY);
      const id = gj * world.P + gi;
      let v = world.richness[id];
      if (world.crystal[id]) v += 0.6;
      if (world.special[id]) v += 1.2;
      const score = v - r / (reach * 3);
      if (score > bestScore) {
        bestScore = score;
        best = { x: px, y: py };
      }
    }
    this.target = best;
  };

  // Smooth steer toward a point; ignoreRock lets returning bots phase home.
  Bot.prototype._steerTo = function (tx, ty, dt, bstats, world, ignoreRock) {
    const dir = Math.atan2(ty - this.y, tx - this.x);
    const speed = bstats.botSpeed;
    const k = Math.min(1, 5 * dt);
    this.vx += (Math.cos(dir) * speed - this.vx) * k;
    this.vy += (Math.sin(dir) * speed - this.vy) * k;
    const nx = this.x + this.vx * dt,
      ny = this.y + this.vy * dt;
    if (ignoreRock || world.densityAt(nx, ny) <= T) {
      this.x = nx;
      this.y = ny;
    } else if (world.densityAt(this.x + this.vx * dt, this.y) <= T) {
      this.x += this.vx * dt;
    } else if (world.densityAt(this.x, this.y + this.vy * dt) <= T) {
      this.y += this.vy * dt;
    }
    if (this.vx || this.vy) this.angle = Math.atan2(this.vy, this.vx);
  };

  Bot.prototype.update = function (dt, bstats, yieldMult, world, game) {
    const home = this.factory;
    if (this.beamT > 0) this.beamT -= dt;

    if (this.mode === "return") {
      this._steerTo(home.x, home.y, dt, bstats, world, true);
      if (U.dist(this.x, this.y, home.x, home.y) < CFG.bot.depositRange * bstats.sqrtI) {
        game.addResources(this.carry.m, this.carry.c, this.carry.k, true);
        game.spawnDeposit(home.x, home.y);
        this.carry.m = this.carry.c = this.carry.k = 0;
        this.mode = "dig";
        this.target = null;
        this.heading = this.rng() * U.TAU;
      }
      this.beam = this.beamT > 0;
      return;
    }

    // DIG: travel to a rich vein (or out to the rock edge), then sit at the face
    // and chip with a slow tap…turn…tap rhythm (deliberate, a little cute).
    this.retarget -= dt;
    if (!this.target || this.retarget <= 0) this._findVein(world, bstats);
    let desired;
    if (this.target) desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    else desired = Math.atan2(this.y - home.y, this.x - home.x); // out, away from home
    this.heading = U.lerpAngle(this.heading, desired, Math.min(1, 2.5 * dt));
    const hx = Math.cos(this.heading),
      hy = Math.sin(this.heading);

    // rock right in front of us to chip at?
    const reach = bstats.botCarveR * 1.1;
    const ax = this.x + hx * reach,
      ay = this.y + hy * reach;
    const rockAhead = world.densityAt(ax, ay) > T;
    this.pulseT -= dt;

    if (rockAhead) {
      // sit at the face: ease to a stop, then tap on a slow timer
      this.vx *= Math.pow(0.015, dt);
      this.vy *= Math.pow(0.015, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.pulseT <= 0) {
        this.pulseT = 0.42 + this.rng() * 0.3; // tap … pause … tap
        const pm = game.pulseMult ? game.pulseMult() : 1;
        const got = world.carve(ax, ay, bstats.botCarveR, bstats.botPower);
        this.carry.m += got.minerals * yieldMult * pm;
        this.carry.c += got.crystals * yieldMult * pm;
        this.carry.k += got.catalyst * yieldMult * pm;
        this.beamT = 0.16;
        this.mineX = ax;
        this.mineY = ay;
        game.spawnSpark(ax, ay);
        // veins: minerals visibly get sucked into the bot
        if (got.minerals + got.crystals + got.catalyst > 0.01) {
          game.spawnBotCollect(ax, ay, this);
          game.spawnBotCollect(ax, ay, this);
        }
        // recoil kick + a little turn to face a fresh bit of rock
        this.vx -= hx * bstats.botSpeed * 0.45;
        this.vy -= hy * bstats.botSpeed * 0.45;
        this.heading += (this.rng() - 0.5) * 0.9;
      }
    } else {
      // travelling toward the vein / out to the edge
      const speed = bstats.botSpeed * 0.6;
      this.vx = hx * speed;
      this.vy = hy * speed;
      const nx = this.x + this.vx * dt,
        ny = this.y + this.vy * dt;
      if (world.densityAt(nx, ny) <= T) {
        this.x = nx;
        this.y = ny;
      } else if (this.pulseT > 0.1) {
        this.pulseT = 0.1; // nosed into a wall — chip it shortly
      }
    }
    this.angle = this.heading;
    this.beam = this.beamT > 0;

    // return when full or roamed too far
    const cap = bstats.botCapacity;
    const off = this.x * this.x + this.y * this.y > world.radius * world.radius;
    if (this.carry.m + this.carry.c + this.carry.k >= cap || U.dist(this.x, this.y, home.x, home.y) > bstats.botReach || off) {
      this.mode = "return";
    }
  };

  // ---------------- Factory (each upgrades its own bots) ----------------
  function Factory(x, y, seed) {
    this.x = x;
    this.y = y;
    this.seed = seed >>> 0;
    this.levels = G.Economy.factoryDefaultLevels();
    this.botStats = G.Economy.deriveBotStats(this.levels, 1);
    this.bots = [];
    this.assemble = 0;
    this.panel = "factory";
    this.r = 14;
    this.spin = 0;
  }

  Factory.prototype.recompute = function (influence) {
    this.botStats = G.Economy.deriveBotStats(this.levels, influence);
  };

  Factory.prototype.update = function (dt, game) {
    this.spin += dt * 0.6;
    this.recompute(game.stats.influence);
    const bay = Math.floor(this.botStats.botBay);
    if (this.bots.length < bay) {
      this.assemble += dt;
      if (this.assemble >= (G.DEV.instantBots ? 0.15 : CFG.bot.assembleTime)) {
        this.assemble = 0;
        this.bots.push(new Bot(this.x, this.y, this, (this.seed + this.bots.length * 7919) >>> 0));
      }
    }
    for (let i = 0; i < this.bots.length; i++) this.bots[i].update(dt, this.botStats, game.stats.yield, game.world, game);
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

  // ---------------- Shipyard (built structure; hosts augment research) -------
  function Shipyard(x, y) {
    this.x = x;
    this.y = y;
    this.panel = "shipyard";
    this.r = 16;
    this.spin = 0;
  }
  Shipyard.prototype.update = function (dt) {
    this.spin -= dt * 0.5;
  };

  // ---------------- Wreck (buried ship; dig free + tap to salvage) ----------
  function Wreck(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // -> special augment
    this.salvaged = false;
  }

  // ---------------- Rope (recharge cable; verlet, looks dragged) ----------------
  function Rope(segs) {
    this.segs = segs || 16;
    this.pts = [];
    this.prev = [];
    for (let i = 0; i < this.segs; i++) {
      this.pts.push({ x: 0, y: 0 });
      this.prev.push({ x: 0, y: 0 });
    }
    this.active = false;
  }
  Rope.prototype.reset = function (ax, ay, tx, ty) {
    for (let i = 0; i < this.segs; i++) {
      const t = i / (this.segs - 1);
      const x = U.lerp(ax, tx, t),
        y = U.lerp(ay, ty, t);
      this.pts[i].x = x;
      this.pts[i].y = y;
      this.prev[i].x = x;
      this.prev[i].y = y;
    }
    this.active = true;
  };
  Rope.prototype.update = function (ax, ay, tx, ty, dt) {
    const last = this.segs - 1;
    const dist = U.dist(ax, ay, tx, ty);
    const sag = dist * 0.9; // longer cable droops more
    for (let i = 1; i < last; i++) {
      const p = this.pts[i],
        pr = this.prev[i];
      const vx = (p.x - pr.x) * 0.94,
        vy = (p.y - pr.y) * 0.94;
      pr.x = p.x;
      pr.y = p.y;
      p.x += vx;
      p.y += vy + sag * dt * dt;
    }
    this.pts[0].x = ax;
    this.pts[0].y = ay;
    this.pts[last].x = tx;
    this.pts[last].y = ty;
    const rest = (dist / (this.segs - 1)) * 1.12 + 1; // slack => loose curve
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < last; i++) {
        const a = this.pts[i],
          b = this.pts[i + 1];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = ((d - rest) / d) * 0.5;
        const ox = dx * diff,
          oy = dy * diff;
        if (i !== 0) {
          a.x += ox;
          a.y += oy;
        }
        if (i + 1 !== last) {
          b.x -= ox;
          b.y -= oy;
        }
      }
      this.pts[0].x = ax;
      this.pts[0].y = ay;
      this.pts[last].x = tx;
      this.pts[last].y = ty;
    }
  };

  G.Player = Player;
  G.Bot = Bot;
  G.Factory = Factory;
  G.Base = Base;
  G.Shipyard = Shipyard;
  G.Wreck = Wreck;
  G.Rope = Rope;
})(window.G);
