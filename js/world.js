// The planet core: a destructible density field rendered as glowing contours
// via marching squares. Carving rock yields minerals (and crystals from veins).
(function (G) {
  "use strict";

  const U = G.util;

  function World(seed) {
    const w = G.CFG.world;
    this.cfg = w;
    this.seed = seed >>> 0;
    this.radius = w.radius;
    this.cell = w.cell;
    this.NX = Math.round((2 * w.radius) / w.cell); // cells across
    this.NY = this.NX;
    this.P = this.NX + 1; // lattice points across
    this.density = new Float32Array(this.P * this.P);
    this.richness = new Float32Array(this.P * this.P);
    this.crystal = new Uint8Array(this.P * this.P);
    this.solidTotal = 0; // initial total density (for carved fraction)
    this.removedTotal = 0;
    this.generate();
  }

  World.prototype.idx = function (i, j) {
    return j * this.P + i;
  };
  World.prototype.worldX = function (i) {
    return i * this.cell - this.radius;
  };
  World.prototype.worldY = function (j) {
    return j * this.cell - this.radius;
  };

  World.prototype.generate = function () {
    const w = this.cfg,
      P = this.P,
      R = this.radius;
    let solid = 0;
    for (let j = 0; j < P; j++) {
      const wy = this.worldY(j);
      for (let i = 0; i < P; i++) {
        const wx = this.worldX(i);
        const id = j * P + i;
        const r = Math.hypot(wx, wy);
        if (r > R) {
          // Outside the core: permanent crust.
          this.density[id] = 1;
          this.richness[id] = 0;
          this.crystal[id] = 0;
          continue;
        }
        // Mostly-solid rock with winding natural caverns.
        const n = U.fbm(wx * w.noiseScale, wy * w.noiseScale, this.seed, w.octaves);
        let d = 0.62 + (n - 0.5) * 0.95;
        // Thicken toward the crust so there's a clear outer wall.
        const edge = r / R;
        if (edge > 0.82) d = U.lerp(d, 1, (edge - 0.82) / 0.18);
        d = U.clamp(d, 0, 1);
        this.density[id] = d;
        solid += d;
        // Mineral richness (denser veins look brighter and pay more).
        const rn = U.fbm(wx * w.richScale + 99, wy * w.richScale - 33, this.seed + 7, 3);
        this.richness[id] = Math.pow(U.clamp(rn, 0, 1), 1.5);
        // Crystal-bearing veins.
        const vn = U.fbm(wx * w.veinScale, wy * w.veinScale, this.seed + 21, 2);
        this.crystal[id] = vn > w.crystalVeinCut ? 1 : 0;
      }
    }
    this.solidTotal = solid;
    this.removedTotal = 0;
    this.clearCircle(0, 0, w.startPocket); // open the spawn cavern (no payout)
  };

  // Remove rock without crediting resources (spawn pocket, prestige).
  World.prototype.clearCircle = function (cx, cy, r) {
    const P = this.P,
      cell = this.cell,
      R = this.radius;
    const gi0 = Math.max(0, Math.floor((cx - r + R) / cell));
    const gi1 = Math.min(this.NX, Math.ceil((cx + r + R) / cell));
    const gj0 = Math.max(0, Math.floor((cy - r + R) / cell));
    const gj1 = Math.min(this.NY, Math.ceil((cy + r + R) / cell));
    const r2 = r * r;
    for (let j = gj0; j <= gj1; j++) {
      const wy = this.worldY(j);
      for (let i = gi0; i <= gi1; i++) {
        const wx = this.worldX(i);
        if (wx * wx + wy * wy > R * R) continue; // never touch crust
        if (U.dist2(wx, wy, cx, cy) <= r2) {
          const id = j * P + i;
          this.removedTotal += this.density[id];
          this.density[id] = 0;
        }
      }
    }
  };

  // Carve rock at (cx,cy). Returns {minerals, crystals} (base amounts; caller
  // applies efficiency multipliers). amount = density removed at the center.
  World.prototype.carve = function (cx, cy, r, amount) {
    const w = this.cfg,
      P = this.P,
      cell = this.cell,
      R = this.radius;
    const gi0 = Math.max(0, Math.floor((cx - r + R) / cell));
    const gi1 = Math.min(this.NX, Math.ceil((cx + r + R) / cell));
    const gj0 = Math.max(0, Math.floor((cy - r + R) / cell));
    const gj1 = Math.min(this.NY, Math.ceil((cy + r + R) / cell));
    const r2 = r * r;
    let minerals = 0,
      crystals = 0;
    for (let j = gj0; j <= gj1; j++) {
      const wy = this.worldY(j);
      for (let i = gi0; i <= gi1; i++) {
        const wx = this.worldX(i);
        if (wx * wx + wy * wy > R * R) continue;
        const dd = U.dist2(wx, wy, cx, cy);
        if (dd > r2) continue;
        const id = j * P + i;
        const cur = this.density[id];
        if (cur <= 0) continue;
        const falloff = 1 - Math.sqrt(dd) / r; // 1 at center -> 0 at edge
        const take = Math.min(cur, amount * (0.4 + 0.6 * falloff));
        if (take <= 0) continue;
        this.density[id] = cur - take;
        this.removedTotal += take;
        const rich = this.richness[id];
        minerals += take * w.massPerCell * (0.35 + rich);
        if (this.crystal[id]) crystals += take * w.crystalPerCell * (0.4 + rich);
      }
    }
    return { minerals, crystals };
  };

  // Bilinear density sample at a world point.
  World.prototype.densityAt = function (wx, wy) {
    if (wx * wx + wy * wy > this.radius * this.radius) return 1;
    const cell = this.cell,
      R = this.radius,
      P = this.P;
    const gx = (wx + R) / cell,
      gy = (wy + R) / cell;
    let i0 = Math.floor(gx),
      j0 = Math.floor(gy);
    if (i0 < 0 || j0 < 0 || i0 >= this.NX || j0 >= this.NY) return 1;
    const fx = gx - i0,
      fy = gy - j0;
    const d = this.density;
    const a = d[j0 * P + i0],
      b = d[j0 * P + i0 + 1];
    const c = d[(j0 + 1) * P + i0],
      e = d[(j0 + 1) * P + i0 + 1];
    return U.lerp(U.lerp(a, b, fx), U.lerp(c, e, fx), fy);
  };

  // Find a solid, mineral-rich point near (x,y) for a bot to mine.
  World.prototype.findRockNear = function (x, y, ring, rng) {
    const w = this.cfg;
    let best = null,
      bestScore = 0;
    const samples = G.CFG.bot.searchSamples;
    for (let s = 0; s < samples; s++) {
      const ang = rng() * U.TAU;
      const rad = 30 + rng() * ring;
      const px = x + Math.cos(ang) * rad;
      const py = y + Math.sin(ang) * rad;
      if (px * px + py * py > this.radius * this.radius) continue;
      const d = this.densityAt(px, py);
      if (d <= w.threshold) continue;
      // Score prefers dense, rich rock.
      const gi = U.clamp(Math.round((px + this.radius) / this.cell), 0, this.NX);
      const gj = U.clamp(Math.round((py + this.radius) / this.cell), 0, this.NY);
      const rich = this.richness[gj * this.P + gi];
      const score = d * (0.5 + rich) - rad / (ring * 4);
      if (score > bestScore) {
        bestScore = score;
        best = { x: px, y: py };
      }
    }
    return best;
  };

  World.prototype.carvedFraction = function () {
    return this.solidTotal > 0 ? U.clamp(this.removedTotal / this.solidTotal, 0, 1) : 0;
  };

  // ---- rendering: marching-squares contours + textured dots ----
  World.prototype.render = function (ctx, cam, vw, vh) {
    const T = this.cfg.threshold,
      cell = this.cell,
      R = this.radius,
      P = this.P,
      d = this.density;
    // Visible world rect (with margin).
    const tl = cam.screenToWorld(0, 0, vw, vh);
    const br = cam.screenToWorld(vw, vh, vw, vh);
    const minWX = Math.min(tl.x, br.x),
      maxWX = Math.max(tl.x, br.x);
    const minWY = Math.min(tl.y, br.y),
      maxWY = Math.max(tl.y, br.y);
    let i0 = Math.floor((minWX + R) / cell) - 1;
    let i1 = Math.ceil((maxWX + R) / cell) + 1;
    let j0 = Math.floor((minWY + R) / cell) - 1;
    let j1 = Math.ceil((maxWY + R) / cell) + 1;
    i0 = U.clamp(i0, 0, this.NX);
    i1 = U.clamp(i1, 0, this.NX);
    j0 = U.clamp(j0, 0, this.NY);
    j1 = U.clamp(j1, 0, this.NY);
    const across = i1 - i0;
    const step = Math.max(1, Math.ceil(across / this.cfg.maxRenderCells));

    this._renderDots(ctx, cam, vw, vh, minWX, maxWX, minWY, maxWY, step);

    // Contour pass (batched into a single stroke for speed).
    const COL = G.CFG.COL;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.line;
    if (G.CFG.render.glow) {
      ctx.shadowColor = COL.bright;
      ctx.shadowBlur = 2;
    }
    ctx.beginPath();
    const seg = (ax, ay, bx, by) => {
      const a = cam.worldToScreen(ax, ay, vw, vh);
      const b = cam.worldToScreen(bx, by, vw, vh);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    };
    for (let j = j0; j < j1; j += step) {
      const jj = Math.min(j + step, this.NY);
      const wy0 = this.worldY(j),
        wy1 = this.worldY(jj);
      for (let i = i0; i < i1; i += step) {
        const ii = Math.min(i + step, this.NX);
        const va = d[j * P + i],
          vb = d[j * P + ii];
        const vc = d[jj * P + ii],
          vd = d[jj * P + i];
        const c0 = va > T,
          c1 = vb > T,
          c2 = vc > T,
          c3 = vd > T;
        const mask = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0);
        if (mask === 0 || mask === 15) continue;
        const wx0 = this.worldX(i),
          wx1 = this.worldX(ii);
        // Edge crossing points (top,right,bottom,left).
        const top = () => [U.lerp(wx0, wx1, (T - va) / (vb - va)), wy0];
        const right = () => [wx1, U.lerp(wy0, wy1, (T - vb) / (vc - vb))];
        const bot = () => [U.lerp(wx1, wx0, (T - vc) / (vd - vc)), wy1];
        const left = () => [wx0, U.lerp(wy1, wy0, (T - vd) / (va - vd))];
        const crossed = [];
        if (c0 !== c1) crossed.push(top);
        if (c1 !== c2) crossed.push(right);
        if (c2 !== c3) crossed.push(bot);
        if (c3 !== c0) crossed.push(left);
        if (crossed.length === 2) {
          const a = crossed[0](),
            b = crossed[1]();
          seg(a[0], a[1], b[0], b[1]);
        } else if (crossed.length === 4) {
          // Saddle: resolve with the center average.
          const center = (va + vb + vc + vd) / 4 > T;
          const t = top(),
            r = right(),
            b = bot(),
            l = left();
          if (center === c0) {
            seg(t[0], t[1], r[0], r[1]);
            seg(b[0], b[1], l[0], l[1]);
          } else {
            seg(t[0], t[1], l[0], l[1]);
            seg(r[0], r[1], b[0], b[1]);
          }
        }
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  // Textured dots: ambient dust + brighter specks over rich/crystal rock.
  World.prototype._renderDots = function (ctx, cam, vw, vh, minWX, maxWX, minWY, maxWY, step) {
    if (step > 3) return; // too far zoomed out; dots would be noise
    const COL = G.CFG.COL;
    const stride = 7; // screen-pixel spacing between dot samples
    const T = this.cfg.threshold;
    for (let sy = 0; sy < vh; sy += stride) {
      for (let sx = 0; sx < vw; sx += stride) {
        const wpt = cam.screenToWorld(sx, sy, vw, vh);
        const wx = wpt.x,
          wy = wpt.y;
        if (wx * wx + wy * wy > this.radius * this.radius) continue;
        // Stable per-world-cell jitter so dots don't shimmer.
        const cx = Math.floor(wx / 6),
          cy = Math.floor(wy / 6);
        const h = U.hash2(cx, cy, this.seed + 5);
        if (h > 0.5) continue; // ~half the cells get a dot
        const dens = this.densityAt(wx, wy);
        if (dens > T) {
          const gi = U.clamp(Math.round((wx + this.radius) / this.cell), 0, this.NX);
          const gj = U.clamp(Math.round((wy + this.radius) / this.cell), 0, this.NY);
          const id = gj * this.P + gi;
          if (this.crystal[id] && h < 0.12) {
            ctx.fillStyle = COL.crystalDot;
            ctx.fillRect(sx | 0, sy | 0, 1, 1);
          } else if (this.richness[id] > 0.45 && h < 0.34) {
            ctx.fillStyle = COL.mineralDot;
            ctx.fillRect(sx | 0, sy | 0, 1, 1);
          }
        } else if (h < 0.06) {
          // Faint dust drifting in the open caverns.
          ctx.fillStyle = COL.dim;
          ctx.fillRect(sx | 0, sy | 0, 1, 1);
        }
      }
    }
  };

  G.World = World;
})(window.G);
