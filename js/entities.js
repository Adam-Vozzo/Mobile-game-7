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
    this.cargo = { m: 0, c: 0, k: 0 };
    this.cargoLoad = 0;
    this.maxCargo = 1;
  }

  Player.prototype.update = function (dt, input, stats, world, game) {
    const P = CFG.player;
    const DEV = G.DEV;
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
      rate = P.energyRecharge;
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
        rate = P.energyRecharge * CFG.factory.rechargeMult;
      }
    }
    this.nearBase = dB <= stats.baseRange;
    this.inBase = this.nearBase;
    this.rechargeSource = src;

    const depleted = !DEV.infiniteEnergy && this.energy <= 0;
    const moveMult = depleted ? P.depletedSpeed : 1;

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
    const rockMult = dens > T ? 0.1 : 1; // center in solid terrain => 90% slower
    this.vx += nx * stats.accel * moveMult * rockMult * thrust * dt;
    this.vy += ny * stats.accel * moveMult * rockMult * thrust * dt;

    let keep = Math.pow(P.drag, dt * 60);
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
    let firing = false;
    if (!depleted) {
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
        let gm = got.minerals * stats.yield,
          gc = got.crystals * stats.yield,
          gk = got.catalyst * stats.yield;
        if (!DEV.noCargoLimit) {
          const room = Math.max(0, this.maxCargo - (this.cargo.m + this.cargo.c + this.cargo.k));
          const tot = gm + gc + gk;
          if (tot > room) {
            const s = room / tot;
            gm *= s;
            gc *= s;
            gk *= s;
          }
        }
        this.cargo.m += gm;
        this.cargo.c += gc;
        this.cargo.k += gk;
        if (gm + gc + gk > 0) game.spawnCollect(hx, hy);
        game.spawnSpark(hx, hy);
      } else {
        this.beam.x2 = sx + nx * range;
        this.beam.y2 = sy + ny * range;
      }
    } else {
      this.beam.active = false;
    }

    // --- deposit cargo gradually at base/factory (motes flow ship -> source) ---
    const load = this.cargo.m + this.cargo.c + this.cargo.k;
    if (src && load > 0) {
      const take = Math.min(load, (this.maxCargo + 24) * dt); // empties a full hold in ~1s
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
      this.energy = Math.min(this.maxEnergy, this.energy + rate * dt);
    } else {
      if (thrust > 0.05) this.energy -= P.energyMove * thrust * dt;
      if (firing) this.energy -= P.energyLaser * dt;
      if (this.energy < 0) this.energy = 0;
    }
  };

  // ---------------- Bot (chips rock from the reachable edge) ----------------
  function Bot(x, y, factory, seed) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.mode = "seek";
    this.hasTarget = false;
    this.mineX = 0;
    this.mineY = 0;
    this.apprX = x;
    this.apprY = y;
    this.mineDir = 0;
    this.advanced = 0;
    this.carry = { m: 0, c: 0, k: 0 };
    this.retarget = 0;
    this.factory = factory;
    this.rng = U.mulberry32(seed);
    this.beam = false;
  }

  // Cast rays from the bot through cleared space to the nearest rock face.
  Bot.prototype._seek = function (world, bstats) {
    this.retarget = CFG.bot.retargetTime;
    const rays = CFG.bot.reachRays;
    const len = CFG.bot.reachLen * bstats.sqrtI;
    const stepw = world.cell * Math.max(1, bstats.sqrtI);
    const R2 = world.radius * world.radius;
    let best = null,
      bestScore = -1;
    const base = this.rng() * U.TAU;
    for (let k = 0; k < rays; k++) {
      const ang = base + (k / rays) * U.TAU;
      const cx = Math.cos(ang),
        cy = Math.sin(ang);
      let prevX = this.x,
        prevY = this.y;
      for (let t = stepw; t <= len; t += stepw) {
        const px = this.x + cx * t,
          py = this.y + cy * t;
        if (px * px + py * py > R2) break;
        if (world.densityAt(px, py) > T) {
          const rich = world.richnessAt(px, py);
          const score = 0.4 + rich - t / (len * 2);
          if (score > bestScore) {
            bestScore = score;
            best = { mineX: px, mineY: py, apprX: prevX, apprY: prevY, dir: ang };
          }
          break;
        }
        prevX = px;
        prevY = py;
      }
    }
    if (best) {
      this.mineX = best.mineX;
      this.mineY = best.mineY;
      this.apprX = best.apprX;
      this.apprY = best.apprY;
      this.mineDir = best.dir;
      this.advanced = 0;
      this.hasTarget = true;
    } else {
      const a = this.rng() * U.TAU;
      this.apprX = this.x + Math.cos(a) * len * 0.7;
      this.apprY = this.y + Math.sin(a) * len * 0.7;
      this.hasTarget = false;
    }
  };

  Bot.prototype._steerTo = function (tx, ty, dt, bstats, world, ignoreRock) {
    const dir = Math.atan2(ty - this.y, tx - this.x);
    const speed = bstats.botSpeed;
    const dvx = Math.cos(dir) * speed,
      dvy = Math.sin(dir) * speed;
    const k = Math.min(1, 5 * dt);
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    const nx = this.x + this.vx * dt,
      ny = this.y + this.vy * dt;
    if (ignoreRock) {
      // returning bots phase home so they never get stuck on terrain
      this.x = nx;
      this.y = ny;
      if (this.vx || this.vy) this.angle = Math.atan2(this.vy, this.vx);
      return;
    }
    // soft collision: chip along walls instead of ghosting through rock
    if (world.densityAt(nx, ny) <= T) {
      this.x = nx;
      this.y = ny;
    } else if (world.densityAt(this.x + this.vx * dt, this.y) <= T) {
      this.x += this.vx * dt;
      this.vy *= 0.3;
    } else if (world.densityAt(this.x, this.y + this.vy * dt) <= T) {
      this.y += this.vy * dt;
      this.vx *= 0.3;
    } else {
      this.vx *= 0.25;
      this.vy *= 0.25;
    }
    if (this.vx || this.vy) this.angle = Math.atan2(this.vy, this.vx);
  };

  Bot.prototype.update = function (dt, bstats, yieldMult, world, game) {
    const home = this.factory;
    const cap = bstats.botCapacity;
    const maxTunnel = CFG.bot.reachLen * bstats.sqrtI * 1.4;
    if (this.mode === "seek") {
      this.retarget -= dt;
      if (!this.hasTarget || this.retarget <= 0) this._seek(world, bstats);
      this._steerTo(this.apprX, this.apprY, dt, bstats, world);
      if (this.hasTarget && U.dist(this.x, this.y, this.apprX, this.apprY) < bstats.botCarveR * 1.4) {
        this.mode = "mine";
      } else if (!this.hasTarget && U.dist(this.x, this.y, this.apprX, this.apprY) < bstats.botCarveR * 1.4) {
        this._seek(world, bstats);
      }
    } else if (this.mode === "mine") {
      this.beam = true;
      const got = world.carve(this.mineX, this.mineY, bstats.botCarveR, bstats.botPower * dt);
      this.carry.m += got.minerals * yieldMult;
      this.carry.c += got.crystals * yieldMult;
      this.carry.k += got.catalyst * yieldMult;
      game.spawnSpark(this.mineX, this.mineY);
      game.spawnBotCollect(this.mineX, this.mineY, this);
      // sit just outside the face and follow it inward as it recedes
      const bx = this.mineX - Math.cos(this.mineDir) * bstats.botCarveR;
      const by = this.mineY - Math.sin(this.mineDir) * bstats.botCarveR;
      this._steerTo(bx, by, dt, bstats, world);
      if (world.densityAt(this.mineX, this.mineY) <= T) {
        this.mineX += Math.cos(this.mineDir) * world.cell * 1.5;
        this.mineY += Math.sin(this.mineDir) * world.cell * 1.5;
        this.advanced += world.cell * 1.5;
        const off = this.mineX * this.mineX + this.mineY * this.mineY > world.radius * world.radius;
        if (this.advanced > maxTunnel || off) {
          this.mode = "return";
          this.beam = false;
          this.hasTarget = false;
        }
      }
      if (this.carry.m >= cap) {
        this.mode = "return";
        this.beam = false;
        this.hasTarget = false;
      }
    } else {
      this._steerTo(home.x, home.y, dt, bstats, world, true);
      if (U.dist(this.x, this.y, home.x, home.y) < CFG.bot.depositRange * bstats.sqrtI) {
        game.addResources(this.carry.m, this.carry.c, this.carry.k, true);
        game.spawnDeposit(home.x, home.y);
        this.carry.m = this.carry.c = this.carry.k = 0;
        this.advanced = 0;
        this.mode = "seek";
        this.hasTarget = false;
      }
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
  G.Rope = Rope;
})(window.G);
