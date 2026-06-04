// Player ship (asteroids-style + mining laser + energy), autonomous bots that
// chip rock from the edge, factories with their own upgrades, and the cable.
(function (G) {
  "use strict";
  const U = G.util;
  const CFG = G.CFG;
  const Eco = G.Economy;
  const T = CFG.world.threshold;

  // ---------------- Player ----------------
  function Player(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.beam = { active: false, x1: 0, y1: 0, x2: 0, y2: 0 };
    this.beams = []; // all active beam segments this frame (twin emitters -> 2)
    this._burstT = 0; // burst-fire phase clock
    this._aim0 = NaN; // eased auto-aim angles (primary, twin-secondary)
    this._aim1 = NaN;
    this._augDrain = 0; // current augment power draw (energy/s), for reference
    this._flashLit = 0; // floodlight lit fraction (0..1), set each update
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

  // Nearest direction (of 24) with rock in laser range. Optionally skip any
  // direction within `minSep` radians of `exceptAng` (so twin beams pick two
  // distinct veins). Returns the angle, or NaN if nothing is in range.
  Player.prototype._nearestRockDir = function (world, range, step, exceptAng, minSep) {
    let bd = Infinity,
      found = NaN;
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * U.TAU;
      if (exceptAng != null) {
        const diff = Math.abs(((ang - exceptAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff < minSep) continue;
      }
      const cx = Math.cos(ang),
        cy = Math.sin(ang);
      for (let dd = step; dd <= range; dd += step) {
        if (world.densityAt(this.x + cx * dd, this.y + cy * dd) > T) {
          if (dd < bd) {
            bd = dd;
            found = ang;
          }
          break;
        }
      }
    }
    return found;
  };

  // Cast one mining beam from (sx,sy) along ang; carve at the first rock hit and
  // bank the yield. Returns { x1,y1,x2,y2, hit }. Used once or twice (twin).
  Player.prototype._castBeam = function (sx, sy, ang, range, power, dt, stats, world, game, pm) {
    const step = CFG.laser.step;
    const cx = Math.cos(ang),
      cy = Math.sin(ang);
    let hit = false,
      hx = sx + cx * range,
      hy = sy + cy * range;
    for (let dd = 0; dd <= range; dd += step) {
      const px = sx + cx * dd,
        py = sy + cy * dd;
      if (world.densityAt(px, py) > T) {
        hit = true;
        hx = px;
        hy = py;
        break;
      }
    }
    if (hit) {
      const got = world.carve(hx, hy, stats.carveR, power * dt, { plasmaDrill: Eco.ownsAugment(game.state, "plasmaDrill") });
      if (got.obsidianHit) game._noteObsidianGlance(hx, hy);
      // Refinery (try-it structure): mining within its range gets a yield boost.
      let refMult = 1;
      const rf = CFG.structures && CFG.structures.refinery;
      if (rf && game.structures && game.structures.length) {
        const rr2 = (rf.range * stats.sqrtI) * (rf.range * stats.sqrtI);
        for (const st of game.structures) {
          if (st.kind !== "refinery") continue;
          const dx = st.x - hx,
            dy = st.y - hy;
          if (dx * dx + dy * dy <= rr2) {
            refMult = rf.yieldMult;
            break;
          }
        }
      }
      const gm = got.minerals * stats.yield * pm * refMult,
        gc = got.crystals * stats.yield * pm * refMult,
        gk = got.catalyst * stats.yield * pm * refMult;
      const tot = gm + gc + gk;
      if (tot > 0) {
        this._lastMine.x = hx;
        this._lastMine.y = hy;
        const room = Math.max(0, this.cargoRoom());
        const f = G.DEV.noCargoLimit ? 1 : tot > room ? room / tot : 1;
        this._pend.m += gm * f;
        this._pend.c += gc * f;
        this._pend.k += gk * f;
        const of = 1 - f;
        if (of > 0.0001) game.addPickup(hx, hy, gm * of, gc * of, gk * of);
        game.spawnSpark(hx, hy);
      } else {
        game.spawnDust(hx, hy);
      }
    }
    return { x1: sx, y1: sy, x2: hx, y2: hy, hit: hit };
  };

  Player.prototype.update = function (dt, input, stats, world, game) {
    const P = CFG.player;
    const DEV = G.DEV;
    const owns = (id) => Eco.ownsAugment(game.state, id);
    const base = game.base;
    this.maxEnergy = stats.energyMax;
    this.maxCargo = stats.cargoCapacity;
    if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
    // floodlight lit fraction (0..1), ramping in with distance from the core —
    // matches the render, and scales the floodlight's power draw. 0 if not owned.
    if (stats.flashlight) {
      const fc = CFG.flashlight;
      this._flashLit = U.clamp((Math.hypot(this.x, this.y) / world.radius - fc.startFrac) / (fc.fullFrac - fc.startFrac), 0, 1);
    } else {
      this._flashLit = 0;
    }

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
      // Beacon Tower: a built mini-recharge source (try-it structure)
      const bs = CFG.structures && CFG.structures.beaconTower;
      if (bs && game.structures && game.structures.length) {
        const br = bs.range * stats.sqrtI;
        let bbd = br,
          bbest = null;
        for (const st of game.structures) {
          if (st.kind !== "beaconTower") continue;
          const d = U.dist(this.x, this.y, st.x, st.y);
          if (d <= bbd) {
            bbd = d;
            bbest = st;
          }
        }
        // Prefer base/factory if already found; otherwise use the beacon
        if (bbest && !src) {
          src = bbest;
          rate = stats.recharge * bs.rechargeMult;
        }
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
    const rockMult = dens > T ? (owns("phaseDrive") ? 1 : owns("hullPlating") ? 0.35 : 0.1) : 1;
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

    // --- mining laser: forward by default; salvaged augments reshape it. Each
    // augment can also be forced on via a dev gameplay toggle (to explore combos).
    const pm = game.pulseMult ? game.pulseMult() : 1;
    const laserBlocked = brownout || (DEV.laserHeat && this.overheated);
    const fAuto = owns("autoTarget") || DEV.autoAim || DEV.laserAuto;
    const fTwin = owns("twinBeams") || DEV.laserTwin;
    const fBurst = owns("burstFire") || DEV.laserBurst;
    let firing = false;
    this.beams.length = 0;
    if (!laserBlocked) {
      const range = stats.laserRange,
        step = CFG.laser.step,
        spread = 0.23;
      // Pulse Driver: hard on/off rhythm, much stronger while pulsing
      let power = stats.laserPower,
        pulsing = true;
      if (fBurst) {
        this._burstT = (this._burstT + dt) % 0.72;
        pulsing = this._burstT < 0.5;
        power *= 2.2;
      }
      if (pulsing) {
        // decide aim angle(s): forward, auto-target nearest, twin spread, or —
        // the synergy — Targeting Array + Twin = lock the two nearest veins.
        const aims = [];
        if (fAuto) {
          // auto-aim eases toward the target instead of snapping, so the beam
          // swings smoothly between rocks. The eased angle is re-validated below.
          const ease = Math.min(1, CFG.laser.aimEase * dt);
          const t0 = this._nearestRockDir(world, range, step, null, 0);
          if (!Number.isNaN(t0)) {
            this._aim0 = Number.isNaN(this._aim0) ? t0 : U.lerpAngle(this._aim0, t0, ease);
            aims.push(this._aim0);
            if (fTwin) {
              const t1 = this._nearestRockDir(world, range, step, t0, 0.9);
              const tgt1 = Number.isNaN(t1) ? t0 + spread * 2 : t1;
              this._aim1 = Number.isNaN(this._aim1) ? tgt1 : U.lerpAngle(this._aim1, tgt1, ease);
              aims.push(this._aim1);
            }
          } else if (fTwin) {
            aims.push(this.angle - spread, this.angle + spread);
          } else {
            aims.push(this.angle);
          }
        } else if (fTwin) {
          aims.push(this.angle - spread, this.angle + spread);
        } else {
          aims.push(this.angle);
        }
        const per = (fTwin ? 0.6 : 1) * power; // twin = coverage, not pure DPS
        for (let k = 0; k < aims.length; k++) {
          const ang = aims[k];
          const sx = this.x + Math.cos(ang) * stats.playerRadius;
          const sy = this.y + Math.sin(ang) * stats.playerRadius;
          const res = this._castBeam(sx, sy, ang, range, per, dt, stats, world, game, pm);
          if (res.hit) {
            this.beams.push(res);
            firing = true;
          }
        }
      }
    }
    this.beam.active = firing;
    if (firing) {
      this.beam.x1 = this.beams[0].x1;
      this.beam.y1 = this.beams[0].y1;
      this.beam.x2 = this.beams[0].x2;
      this.beam.y2 = this.beams[0].y2;
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
      const take = Math.min(load, (this.maxCargo + 24) * (owns("tractor") ? 2 : 1) * dt); // ~1s (0.5s with Tractor)
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

    // augment power draw (energy/s): the more augments are active & in use, the
    // more they cost — but only away from a recharge source. Passive sensors
    // cost while owned; laser mods cost extra only while the laser is firing.
    const ad = CFG.augmentDrain;
    let augDrain = 0;
    augDrain += (stats.scannerLevel || 0) * ad.scanner;
    if (stats.flashlight) augDrain += ad.flashlight * this._flashLit;
    if (owns("compass")) augDrain += ad.compass;
    if (owns("resonance")) augDrain += ad.resonance;
    if (owns("siphon")) augDrain += ad.siphon;
    if (firing) {
      if (fTwin) augDrain += ad.twin;
      if (fBurst) augDrain += ad.burst;
      if (fAuto) augDrain += ad.auto;
      if (owns("plasmaDrill")) augDrain += ad.plasmaDrill;
    }
    this._augDrain = augDrain;

    // --- energy ---
    if (DEV.infiniteEnergy) {
      this.energy = this.maxEnergy;
    } else if (src) {
      this.energy += rate * DEV.recharge * dt;
    } else {
      if (owns("recharger")) this.energy += CFG.player.energyRecharge * P.rechargerFrac * DEV.recharge * dt; // passive recharge away from base
      if (thrust > 0.05) this.energy -= P.energyMove * thrust * dt;
      if (firing) this.energy -= P.energyLaser * dt;
      this.energy -= augDrain * dt;
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
    this.phase = "travel"; // travel -> mine (fire/rotate volley) -> back to travel
    this.pulseT = 0; // time until next zap while mining
    this.shots = 0; // zaps fired at the current spot
    this.shotGoal = 0; // zaps to fire here before relocating
    this.beamT = 0; // >0 while a pulse beam is visible
    this.mineX = x;
    this.mineY = y;
    this.beam = false;
  }

  // Sample nearby solid rock and pick the richest cell to dig toward (veins).
  Bot.prototype._findVein = function (world, bstats, hasDrill) {
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
      // Skip obsidian cells the player can't break — bots inherit the same gate.
      if (world.obsidian[id] && !hasDrill) continue;
      let v = world.richness[id];
      if (world.crystal[id]) v += 0.6;
      if (world.special[id]) v += 1.2;
      if (world.obsidian[id]) v += 0.9;
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
    const hasDrill = Eco.ownsAugment(game.state, "plasmaDrill");
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

    // DIG: find a vein, fly over, stop a little short of the rock, then fire /
    // rotate / fire a short volley before darting to another spot (cute rhythm).
    const bot = CFG.bot;
    const standoff = bot.standoff * bstats.sqrtI;
    const mineReach = bot.mineReach * bstats.sqrtI;
    this.retarget -= dt;
    if (!this.target || (this.phase === "travel" && this.retarget <= 0)) this._findVein(world, bstats, hasDrill);

    if (this.phase === "travel") {
      // head toward the target vein (or outward if none found)
      let tx, ty;
      if (this.target) {
        tx = this.target.x;
        ty = this.target.y;
      } else {
        const outA = Math.atan2(this.y - home.y, this.x - home.x);
        tx = this.x + Math.cos(outA) * 120;
        ty = this.y + Math.sin(outA) * 120;
      }
      const desired = Math.atan2(ty - this.y, tx - this.x);
      this.heading = U.lerpAngle(this.heading, desired, Math.min(1, 4 * dt));
      const hx = Math.cos(this.heading),
        hy = Math.sin(this.heading);
      const speed = bstats.botSpeed * 0.85;
      // probe the rock face ahead; stop once it's within standoff distance
      const faceDist = this._faceAhead(world, hx, hy, standoff + mineReach);
      if (faceDist >= 0 && faceDist <= standoff + 2) {
        // arrived at a face -> settle into a mining volley here
        this.vx *= Math.pow(0.0001, dt);
        this.vy *= Math.pow(0.0001, dt);
        this.phase = "mine";
        this.shots = 0;
        this.shotGoal = bot.shotsMin + Math.floor(this.rng() * (bot.shotsMax - bot.shotsMin + 1));
        this.pulseT = 0.12;
      } else {
        const nx = this.x + hx * speed * dt,
          ny = this.y + hy * speed * dt;
        if (world.densityAt(nx, ny) <= T) {
          this.x = nx;
          this.y = ny;
          this.vx = hx * speed;
          this.vy = hy * speed;
        } else {
          // bumped rock before reaching standoff -> mine from right here
          this.phase = "mine";
          this.shots = 0;
          this.shotGoal = bot.shotsMin + Math.floor(this.rng() * (bot.shotsMax - bot.shotsMin + 1));
          this.pulseT = 0.12;
        }
        // give up on an unreachable target after a while
        if (this.retarget <= -bot.retargetTime) this.target = null;
      }
      this.angle = this.heading;
    } else {
      // MINE: hold position, fire a zap, rotate a touch, fire again…
      this.vx *= Math.pow(0.0001, dt);
      this.vy *= Math.pow(0.0001, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = bot.shotGap;
        const hx = Math.cos(this.heading),
          hy = Math.sin(this.heading);
        // carve at the rock face along the heading (find first solid point)
        let cd = -1;
        for (let dd = bstats.botCarveR; dd <= standoff + mineReach; dd += 4) {
          if (world.densityAt(this.x + hx * dd, this.y + hy * dd) > T) {
            cd = dd;
            break;
          }
        }
        if (cd >= 0) {
          const ax = this.x + hx * cd,
            ay = this.y + hy * cd;
          const pm = game.pulseMult ? game.pulseMult() : 1;
          const got = world.carve(ax, ay, bstats.botCarveR, bstats.botPower, { plasmaDrill: hasDrill });
          this.carry.m += got.minerals * yieldMult * pm;
          this.carry.c += got.crystals * yieldMult * pm;
          this.carry.k += got.catalyst * yieldMult * pm;
          this.beamT = 0.18;
          this.mineX = ax;
          this.mineY = ay;
          game.spawnSpark(ax, ay);
          if (got.minerals + got.crystals + got.catalyst > 0.01) {
            game.spawnBotCollect(ax, ay, this);
            game.spawnBotCollect(ax, ay, this);
          }
        }
        this.shots++;
        // rotate a little to aim at a fresh bit of rock for the next zap
        this.heading += (this.rng() - 0.5) * 0.7;
        if (this.shots >= this.shotGoal) {
          // done here -> go find another spot
          this.phase = "travel";
          this.target = null;
          this.retarget = bot.retargetTime;
          this.heading += (this.rng() - 0.5) * 1.6; // peel away
        }
      }
      this.angle = this.heading;
    }
    this.beam = this.beamT > 0;

    // return when full or roamed too far
    const cap = bstats.botCapacity;
    const off = this.x * this.x + this.y * this.y > world.radius * world.radius;
    if (this.carry.m + this.carry.c + this.carry.k >= cap || U.dist(this.x, this.y, home.x, home.y) > bstats.botReach || off) {
      this.mode = "return";
      this.phase = "travel";
    }
  };

  // Distance to the first solid rock along (hx,hy), up to maxd; -1 if none.
  Bot.prototype._faceAhead = function (world, hx, hy, maxd) {
    for (let dd = 0; dd <= maxd; dd += 4) {
      if (world.densityAt(this.x + hx * dd, this.y + hy * dd) > T) return dd;
    }
    return -1;
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

  // ---------------- Buildable structure (try-it ideas behind dev toggles) ----
  // Lightweight: stores its kind + position; game.js applies the effect.
  function Structure(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind; // beaconTower | refinery | depot | scannerArray
    this.r = kind === "scannerArray" ? 13 : 12;
    this.panel = null; // not interactable yet
    this.spin = 0;
    this._t = 0; // local clock for pinging/ticking
  }
  Structure.prototype.update = function (dt) {
    this.spin += dt * 0.5;
    this._t += dt;
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
  G.Shipyard = Shipyard;
  G.Wreck = Wreck;
  G.Structure = Structure;
  G.Rope = Rope;
})(window.G);
