// The planet core: a destructible density field rendered as glowing contours
// via marching squares. Carving rock yields minerals, crystals, and (rarely)
// catalyst from special veins.
(function (G) {
  "use strict";
  const U = G.util;

  function World(seed) {
    const w = G.CFG.world;
    this.cfg = w;
    this.seed = seed >>> 0;
    this.radius = w.radius;
    this.cell = w.cell;
    this.NX = Math.round((2 * w.radius) / w.cell);
    this.NY = this.NX;
    this.P = this.NX + 1;
    this.density = new Float32Array(this.P * this.P);
    this.richness = new Float32Array(this.P * this.P);
    this.crystal = new Uint8Array(this.P * this.P);
    this.special = new Uint8Array(this.P * this.P);
    this.solidTotal = 0;
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
          this.density[id] = 1;
          this.richness[id] = 0;
          this.crystal[id] = 0;
          this.special[id] = 0;
          continue;
        }
        const n = U.fbm(wx * w.noiseScale, wy * w.noiseScale, this.seed, w.octaves);
        let d = 0.62 + (n - 0.5) * 0.95;
        const edge = r / R;
        if (edge > 0.82) d = U.lerp(d, 1, (edge - 0.82) / 0.18);
        d = U.clamp(d, 0, 1);
        this.density[id] = d;
        solid += d;
        const rn = U.fbm(wx * w.richScale + 99, wy * w.richScale - 33, this.seed + 7, 3);
        this.richness[id] = Math.pow(U.clamp(rn, 0, 1), 1.5);
        const vn = U.fbm(wx * w.veinScale, wy * w.veinScale, this.seed + 21, 2);
        this.crystal[id] = vn > w.crystalVeinCut ? 1 : 0;
        const sn = U.fbm(wx * w.specialScale + 7, wy * w.specialScale + 51, this.seed + 41, 2);
        this.special[id] = sn > w.specialVeinCut ? 1 : 0;
      }
    }
    this.solidTotal = solid;
    this.removedTotal = 0;
    this.clearCircle(0, 0, w.startPocket);
  };

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
        if (wx * wx + wy * wy > R * R) continue;
        if (U.dist2(wx, wy, cx, cy) <= r2) {
          const id = j * P + i;
          this.removedTotal += this.density[id];
          this.density[id] = 0;
        }
      }
    }
  };

  // Returns {minerals, crystals, catalyst} (base amounts; caller applies yield).
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
      crystals = 0,
      catalyst = 0;
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
        const falloff = 1 - Math.sqrt(dd) / r;
        const take = Math.min(cur, amount * (0.4 + 0.6 * falloff));
        if (take <= 0) continue;
        this.density[id] = cur - take;
        this.removedTotal += take;
        const rich = this.richness[id];
        minerals += take * w.massPerCell * (0.35 + rich);
        if (this.crystal[id]) crystals += take * w.crystalPerCell * (0.4 + rich);
        if (this.special[id]) catalyst += take * w.catalystPerCell * (0.5 + rich);
      }
    }
    return { minerals, crystals, catalyst };
  };

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

  // Cell richness at a world point (nearest cell).
  World.prototype.richnessAt = function (wx, wy) {
    const gi = U.clamp(Math.round((wx + this.radius) / this.cell), 0, this.NX);
    const gj = U.clamp(Math.round((wy + this.radius) / this.cell), 0, this.NY);
    return this.richness[gj * this.P + gi];
  };

  World.prototype.carvedFraction = function () {
    return this.solidTotal > 0 ? U.clamp(this.removedTotal / this.solidTotal, 0, 1) : 0;
  };

  // ---- rendering: marching-squares contours + textured dots ----
  World.prototype.render = function (ctx, cam, vw, vh, time) {
    const T = this.cfg.threshold,
      cell = this.cell,
      R = this.radius,
      P = this.P,
      d = this.density;
    const tl = cam.screenToWorld(0, 0, vw, vh);
    const br = cam.screenToWorld(vw, vh, vw, vh);
    const minWX = Math.min(tl.x, br.x),
      maxWX = Math.max(tl.x, br.x);
    const minWY = Math.min(tl.y, br.y),
      maxWY = Math.max(tl.y, br.y);
    let i0 = U.clamp(Math.floor((minWX + R) / cell) - 1, 0, this.NX);
    let i1 = U.clamp(Math.ceil((maxWX + R) / cell) + 1, 0, this.NX);
    let j0 = U.clamp(Math.floor((minWY + R) / cell) - 1, 0, this.NY);
    let j1 = U.clamp(Math.ceil((maxWY + R) / cell) + 1, 0, this.NY);
    const across = i1 - i0;
    const step = Math.max(1, Math.ceil(across / this.cfg.maxRenderCells));

    // Rock fill can be coarser than the contour without hurting the look,
    // which keeps the far-zoom (whole-core) view fast.
    const fillStep = Math.max(step, Math.ceil(across / 64));
    this._fillRock(ctx, cam, vw, vh, i0, i1, j0, j1, fillStep);
    this._renderDots(ctx, cam, vw, vh, minWX, maxWX, minWY, maxWY, time);

    const COL = G.CFG.COL;
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.line;
    if (G.CFG.render.glow) {
      ctx.shadowColor = COL.bright;
      ctx.shadowBlur = G.DEV.bloom ? 9 : 5; // bleeds onto the rock fill -> inner-glow edge
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

  // Fill solid terrain with a warm tint (distinct from the dark caverns). The
  // contour stroke's glow then bleeds onto this fill, reading as an edge glow.
  World.prototype._fillRock = function (ctx, cam, vw, vh, i0, i1, j0, j1, step) {
    const P = this.P,
      d = this.density,
      th = this.cfg.threshold;
    const camx = cam.x,
      camy = cam.y,
      scale = cam.scale,
      hw = vw * 0.5,
      hh = vh * 0.5;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = G.DEV.invertTerrain ? G.CFG.COL.rockAlt : G.CFG.COL.rock;
    ctx.beginPath();
    for (let j = j0; j < j1; j += step) {
      const jj = Math.min(j + step, this.NY);
      const sy0 = hh + (this.worldY(j) - camy) * scale;
      const syH = (this.worldY(jj) - this.worldY(j)) * scale;
      let runStart = -1,
        runEnd = -1; // run of fully-solid cells -> one wide rect
      for (let i = i0; i < i1; i += step) {
        const ii = Math.min(i + step, this.NX);
        const va = d[j * P + i],
          vb = d[j * P + ii],
          vc = d[jj * P + ii],
          vd = d[jj * P + i];
        const c0 = va > th,
          c1 = vb > th,
          c2 = vc > th,
          c3 = vd > th;
        const mask = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0);
        if (mask === 15) {
          if (runStart < 0) runStart = i;
          runEnd = ii;
          continue;
        }
        if (runStart >= 0) {
          const rx0 = hw + (this.worldX(runStart) - camx) * scale;
          ctx.rect(rx0, sy0, (this.worldX(runEnd) - this.worldX(runStart)) * scale, syH);
          runStart = -1;
        }
        if (mask === 0) continue;
        const wx0 = this.worldX(i),
          wx1 = this.worldX(ii),
          wy0 = this.worldY(j),
          wy1 = this.worldY(jj);
        const poly = [];
        if (c0) poly.push(wx0, wy0);
        if (c0 !== c1) poly.push(U.lerp(wx0, wx1, (th - va) / (vb - va)), wy0);
        if (c1) poly.push(wx1, wy0);
        if (c1 !== c2) poly.push(wx1, U.lerp(wy0, wy1, (th - vb) / (vc - vb)));
        if (c2) poly.push(wx1, wy1);
        if (c2 !== c3) poly.push(U.lerp(wx1, wx0, (th - vc) / (vd - vc)), wy1);
        if (c3) poly.push(wx0, wy1);
        if (c3 !== c0) poly.push(wx0, U.lerp(wy1, wy0, (th - vd) / (va - vd)));
        if (poly.length >= 6) {
          ctx.moveTo(hw + (poly[0] - camx) * scale, hh + (poly[1] - camy) * scale);
          for (let p = 2; p < poly.length; p += 2) ctx.lineTo(hw + (poly[p] - camx) * scale, hh + (poly[p + 1] - camy) * scale);
          ctx.closePath();
        }
      }
      if (runStart >= 0) {
        const rx0 = hw + (this.worldX(runStart) - camx) * scale;
        ctx.rect(rx0, sy0, (this.worldX(runEnd) - this.worldX(runStart)) * scale, syH);
      }
    }
    ctx.fill();
    ctx.restore();
  };

  // World-anchored dots (stable while panning): stars only in cleared caverns,
  // ore glints only on solid rock. Catalyst specks twinkle.
  World.prototype._renderDots = function (ctx, cam, vw, vh, minWX, maxWX, minWY, maxWY, time) {
    const sc = cam.scale;
    if (sc < 0.25) return; // zoomed too far out; dots would be clutter
    const COL = G.CFG.COL;
    const T = this.cfg.threshold;
    const sp = 14; // world-unit spacing between dot anchors
    const R2 = this.radius * this.radius;
    const seed = this.seed;
    const ax0 = Math.floor(minWX / sp) - 1,
      ax1 = Math.ceil(maxWX / sp) + 1;
    const ay0 = Math.floor(minWY / sp) - 1,
      ay1 = Math.ceil(maxWY / sp) + 1;
    for (let ay = ay0; ay <= ay1; ay++) {
      for (let ax = ax0; ax <= ax1; ax++) {
        const h = U.hash2(ax, ay, seed + 5);
        if (h > 0.5) continue;
        const wx = (ax + U.hash2(ax, ay, seed + 11)) * sp;
        const wy = (ay + U.hash2(ax, ay, seed + 13)) * sp;
        if (wx * wx + wy * wy > R2) continue;
        const dens = this.densityAt(wx, wy);
        const s = cam.worldToScreen(wx, wy, vw, vh);
        const sx = s.x | 0,
          sy = s.y | 0;
        if (sx < 0 || sy < 0 || sx >= vw || sy >= vh) continue;
        if (dens <= T) {
          // Open cavern: faint drifting dust, with a few brighter stars.
          if (h < 0.06) {
            ctx.fillStyle = COL.bright;
            ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 1.3 + ax * 3.1 + ay);
            ctx.fillRect(sx, sy, 1, 1);
            ctx.globalAlpha = 1;
          } else if (h < 0.28) {
            ctx.fillStyle = COL.dim;
            ctx.fillRect(sx, sy, 1, 1);
          }
        } else {
          // Solid rock: ore glints showing what's worth mining.
          const gi = U.clamp(Math.round((wx + this.radius) / this.cell), 0, this.NX);
          const gj = U.clamp(Math.round((wy + this.radius) / this.cell), 0, this.NY);
          const id = gj * this.P + gi;
          if (this.special[id]) {
            const tw = 0.45 + 0.55 * Math.sin(time * 4 + ax * 2.3 + ay * 1.7);
            ctx.fillStyle = COL.catalystDot;
            ctx.globalAlpha = 0.35 + 0.65 * tw;
            ctx.fillRect(sx, sy, tw > 0.7 ? 2 : 1, 1);
            ctx.globalAlpha = 1;
          } else if (this.crystal[id] && h < 0.32) {
            ctx.fillStyle = COL.crystalDot;
            ctx.fillRect(sx, sy, 1, 1);
          } else if (this.richness[id] > 0.5 && h < 0.42) {
            // ore: a small diamond (not a square) so it reads as a gem, not a star
            ctx.fillStyle = COL.mineralDot;
            ctx.fillRect(sx, sy - 1, 1, 1);
            ctx.fillRect(sx - 1, sy, 3, 1);
            ctx.fillRect(sx, sy + 1, 1, 1);
            if (h < 0.14) {
              // occasional bigger cluster nearby
              ctx.fillRect(sx + 2, sy + 1, 1, 1);
              ctx.fillRect(sx + 3, sy + 1, 1, 1);
            }
          }
        }
      }
    }
  };

  G.World = World;
})(window.G);
