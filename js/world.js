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
    // Resolve biome overrides once and keep them as this.cfg, so carve() and the
    // scanner read the same veinRichCut / mineralValue the terrain was built with.
    this.cfg = G.biomeCfg ? G.biomeCfg() : this.cfg;
    const w = this.cfg,
      P = this.P,
      R = this.radius;
    const bias = w.densityBias != null ? w.densityBias : 0.62;
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
        let d = bias + (n - 0.5) * 0.95;
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
        // only mineral veins pay; bare rock below the vein cut yields nothing
        // (vein-only mode). Veins are rarer now but much richer (mineralValue).
        if (G.DEV.veinOnly) {
          if (rich >= w.veinRichCut) minerals += take * w.massPerCell * rich * rich * w.mineralValue;
        } else {
          minerals += take * w.massPerCell * (0.015 + rich * rich * w.mineralValue);
        }
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
  World.prototype.render = function (ctx, cam, vw, vh, time, scan) {
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
    // The inner-glow clip is costly over a wide view, so only do it when zoomed in.
    const nearZoom = across <= 80;
    // Anchor the sample lattice to fixed step multiples so the terrain doesn't
    // shimmer / re-fragment as the camera pans. Fill and contour share this same
    // lattice so the dark fill and the glowing edge always trace the same cells
    // (otherwise the fill drifts out of sync with the outline on wide screens).
    const ci0 = Math.floor(i0 / step) * step,
      cj0 = Math.floor(j0 / step) * step;
    const COL = G.CFG.COL;
    const camx = cam.x,
      camy = cam.y,
      scale = cam.scale,
      hw = vw * 0.5,
      hh = vh * 0.5;

    // Build the rock fill AND the marching-squares contour in ONE pass over the
    // cell lattice, sharing the cell reads + edge crossings so the dark fill and
    // the glowing outline trace the same boundary (in sync at any zoom).
    //   - Fully-solid cells always merge into run-length rects (cheap).
    //   - Boundary cells: when the view is light enough (zoomed in / narrow
    //     screen) we fill the exact solid sub-polygon so the dark body fits the
    //     outline perfectly and thin nubs stay thin. On heavy views (wide /
    //     whole-core) that costs too much to build+rasterize, so we fall back to
    //     fast over-fill rects — the slight over-reach is invisible when each
    //     cell is only a few pixels.
    const aCells = Math.ceil((i1 - ci0) / step),
      dCells = Math.ceil((j1 - cj0) / step);
    const usePoly = aCells * dCells <= 6000;
    const rockPath = new Path2D();
    const cont = new Path2D();
    for (let j = cj0; j < j1; j += step) {
      const jj = Math.min(j + step, this.NY);
      const sj0 = hh + (this.worldY(j) - camy) * scale;
      const sj1 = hh + (this.worldY(jj) - camy) * scale;
      const rowH = sj1 - sj0;
      let runX0 = -1,
        runX1 = -1; // horizontal run of filled cells -> one merged rect
      for (let i = ci0; i < i1; i += step) {
        const ii = Math.min(i + step, this.NX);
        const va = d[j * P + i],
          vb = d[j * P + ii],
          vc = d[jj * P + ii],
          vd = d[jj * P + i];
        const c0 = va > T,
          c1 = vb > T,
          c2 = vc > T,
          c3 = vd > T;
        const mask = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0);
        const si0 = hw + (this.worldX(i) - camx) * scale;
        const si1 = hw + (this.worldX(ii) - camx) * scale;
        // fully-solid interior: extend the merged run, no edge to draw here
        if (mask === 15) {
          if (runX0 < 0) runX0 = si0;
          runX1 = si1;
          continue;
        }
        if (!usePoly) {
          // over-fill: any rock-touching cell joins the run; empty cells flush it
          if (mask !== 0) {
            if (runX0 < 0) runX0 = si0;
            runX1 = si1;
          } else if (runX0 >= 0) {
            rockPath.rect(runX0, sj0, runX1 - runX0, rowH);
            runX0 = -1;
          }
        } else if (runX0 >= 0) {
          // poly: any non-full cell ends the run (boundary cells get a polygon)
          rockPath.rect(runX0, sj0, runX1 - runX0, rowH);
          runX0 = -1;
        }
        if (mask === 0) continue;
        // boundary cell: edge crossings shared by the fill polygon and the outline
        const tX = si0 + (si1 - si0) * ((T - va) / (vb - va));
        const rY = sj0 + (sj1 - sj0) * ((T - vb) / (vc - vb));
        const bX = si1 + (si0 - si1) * ((T - vc) / (vd - vc));
        const lY = sj1 + (sj0 - sj1) * ((T - vd) / (va - vd));
        // exact fill: walk the solid corners + crossings clockwise around the cell
        if (usePoly) {
          let st = false;
          if (c0) {
            rockPath.moveTo(si0, sj0);
            st = true;
          }
          if (c0 !== c1) {
            if (st) rockPath.lineTo(tX, sj0);
            else ((rockPath.moveTo(tX, sj0)), (st = true));
          }
          if (c1) {
            if (st) rockPath.lineTo(si1, sj0);
            else ((rockPath.moveTo(si1, sj0)), (st = true));
          }
          if (c1 !== c2) {
            if (st) rockPath.lineTo(si1, rY);
            else ((rockPath.moveTo(si1, rY)), (st = true));
          }
          if (c2) {
            if (st) rockPath.lineTo(si1, sj1);
            else ((rockPath.moveTo(si1, sj1)), (st = true));
          }
          if (c2 !== c3) {
            if (st) rockPath.lineTo(bX, sj1);
            else ((rockPath.moveTo(bX, sj1)), (st = true));
          }
          if (c3) {
            if (st) rockPath.lineTo(si0, sj1);
            else ((rockPath.moveTo(si0, sj1)), (st = true));
          }
          if (c3 !== c0) {
            if (st) rockPath.lineTo(si0, lY);
            else ((rockPath.moveTo(si0, lY)), (st = true));
          }
          if (st) rockPath.closePath();
        }
        // outline line(s) through this cell
        const crossed = [];
        if (c0 !== c1) crossed.push(tX, sj0);
        if (c1 !== c2) crossed.push(si1, rY);
        if (c2 !== c3) crossed.push(bX, sj1);
        if (c3 !== c0) crossed.push(si0, lY);
        if (crossed.length === 4) {
          cont.moveTo(crossed[0], crossed[1]);
          cont.lineTo(crossed[2], crossed[3]);
        } else if (crossed.length === 8) {
          const center = (va + vb + vc + vd) / 4 > T;
          if (center === c0) {
            cont.moveTo(tX, sj0);
            cont.lineTo(si1, rY);
            cont.moveTo(bX, sj1);
            cont.lineTo(si0, lY);
          } else {
            cont.moveTo(tX, sj0);
            cont.lineTo(si0, lY);
            cont.moveTo(si1, rY);
            cont.lineTo(bX, sj1);
          }
        }
      }
      if (runX0 >= 0) rockPath.rect(runX0, sj0, runX1 - runX0, rowH);
    }

    // 1) rock fill (dark) — under everything; path is reused to clip the glow
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = G.DEV.invertTerrain ? COL.rockAlt : COL.rock;
    ctx.fill(rockPath);
    ctx.restore();

    // 1b) vein scanner overlay (researched augment, or dev force): mark veins
    if (scan) this._scanner(ctx, scan, cam, vw, vh, time);
    // Additional scanner reveals from try-it Scanner Array structures (drawn on
    // top so they layer cleanly with the player's own scope).
    if (this._extraScans) for (const s of this._extraScans) this._scanner(ctx, s, cam, vw, vh, time);

    // 2) textured dots (open caverns only)
    this._renderDots(ctx, cam, vw, vh, minWX, maxWX, minWY, maxWY, time);

    // 3) stroke the contour. When zoomed in, clip the glow to the rock so it only
    // bleeds INWARD (inner glow), then lay a crisp edge line on top. Far out, one pass.
    const blur = (G.CFG.render.glow ? (G.DEV.bloom ? 9 : 5) : 0) * G.DEV.glow;
    ctx.lineWidth = 1;
    if (blur > 0.1 && nearZoom) {
      ctx.save();
      ctx.clip(rockPath);
      ctx.strokeStyle = COL.bright;
      ctx.shadowColor = COL.bright;
      ctx.shadowBlur = blur;
      ctx.stroke(cont);
      ctx.restore();
      ctx.strokeStyle = COL.line;
      ctx.shadowBlur = 0;
      ctx.stroke(cont);
    } else {
      ctx.strokeStyle = COL.line;
      ctx.shadowColor = COL.bright;
      ctx.shadowBlur = blur;
      ctx.stroke(cont);
      ctx.shadowBlur = 0;
    }
  };

  // Vein scanner: mark each vein cell within scan range around the ship with a
  // type-distinct glyph — gold diamond (minerals), pale shard (crystal), white
  // sparkle (catalyst). The sample step targets a fixed on-screen spacing, so the
  // dot density stays consistent on any screen width (it tracks zoom, not pixels).
  // scan = { px, py, range } in world units (range Infinity = whole view).
  World.prototype._scanner = function (ctx, scan, cam, vw, vh, time) {
    const P = this.P,
      d = this.density,
      th = this.cfg.threshold,
      cell = this.cell,
      R = this.radius,
      cut = this.cfg.veinRichCut;
    const COL = G.CFG.COL;
    const camx = cam.x,
      camy = cam.y,
      scale = cam.scale,
      hw = vw * 0.5,
      hh = vh * 0.5;
    const tl = cam.screenToWorld(0, 0, vw, vh),
      br = cam.screenToWorld(vw, vh, vw, vh);
    let i0 = U.clamp(Math.floor((Math.min(tl.x, br.x) + R) / cell), 0, this.NX);
    const i1 = U.clamp(Math.ceil((Math.max(tl.x, br.x) + R) / cell), 0, this.NX);
    let j0 = U.clamp(Math.floor((Math.min(tl.y, br.y) + R) / cell), 0, this.NY);
    const j1 = U.clamp(Math.ceil((Math.max(tl.y, br.y) + R) / cell), 0, this.NY);
    const sStep = Math.max(1, Math.round(G.CFG.scanner.samplepx / (cell * scale)));
    i0 = Math.floor(i0 / sStep) * sStep; // snap lattice -> stable while panning
    j0 = Math.floor(j0 / sStep) * sStep;
    const rng = scan.range,
      rng2 = rng === Infinity ? Infinity : rng * rng,
      px = scan.px,
      py = scan.py;
    ctx.save();
    ctx.shadowBlur = 0;
    for (let j = j0; j < j1; j += sStep) {
      const wy = this.worldY(j);
      const sy = (hh + (wy - camy) * scale) | 0;
      if (sy < -4 || sy > vh + 4) continue;
      for (let i = i0; i < i1; i += sStep) {
        const id = j * P + i;
        if (d[id] <= th) continue;
        const rich = this.richness[id];
        const isCry = this.crystal[id],
          isCat = this.special[id];
        if (rich < cut && !isCry && !isCat) continue;
        const wx = this.worldX(i);
        // Soft edge: solid near the ship, then thin out (spotty) and dim toward
        // the rim, like the scan struggles to read deeper rock farther out.
        let fade = 1;
        if (rng2 !== Infinity) {
          const dx = wx - px,
            dy = wy - py;
          const dd2 = dx * dx + dy * dy;
          if (dd2 > rng2) continue;
          const t = Math.sqrt(dd2) / rng; // 0 at ship .. 1 at the rim
          if (t > 0.45) {
            fade = 1 - (t - 0.45) / 0.55; // 1 -> 0 across the outer band
            // drop more dots the closer to the rim (per-cell stable -> no flicker)
            if (U.hash2(i, j, this.seed + 23) > 0.12 + 0.88 * fade) continue;
          }
        }
        const dim = 0.3 + 0.7 * fade;
        const sx = (hw + (wx - camx) * scale) | 0;
        if (sx < -4 || sx > vw + 4) continue;
        if (isCat) {
          // catalyst: bright white sparkle that twinkles
          const tw = 0.55 + 0.45 * Math.sin(time * 5 + i * 2.3 + j * 1.7);
          ctx.globalAlpha = (0.4 + 0.6 * tw) * dim;
          ctx.fillStyle = COL.catalystDot;
          ctx.fillRect(sx, sy - 1, 1, 3);
          ctx.fillRect(sx - 1, sy, 3, 1);
          if (tw > 0.45) {
            ctx.fillRect(sx - 1, sy - 1, 1, 1);
            ctx.fillRect(sx + 1, sy - 1, 1, 1);
            ctx.fillRect(sx - 1, sy + 1, 1, 1);
            ctx.fillRect(sx + 1, sy + 1, 1, 1);
          }
        } else if (isCry) {
          // crystal: pale vertical shard
          ctx.globalAlpha = (0.5 + 0.4 * Math.min(1, rich + 0.3)) * dim;
          ctx.fillStyle = COL.crystalDot;
          ctx.fillRect(sx, sy - 2, 1, 5);
          ctx.fillRect(sx - 1, sy, 1, 1);
          ctx.fillRect(sx + 1, sy, 1, 1);
        } else {
          // mineral: gold diamond, brighter with richness
          ctx.globalAlpha = Math.min(0.9, 0.32 + rich * rich * 0.9) * dim;
          ctx.fillStyle = COL.mineralDot;
          ctx.fillRect(sx, sy - 1, 1, 1);
          ctx.fillRect(sx - 1, sy, 3, 1);
          ctx.fillRect(sx, sy + 1, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
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
        // Only the open caverns are textured: faint drifting dust + a few stars.
        // What's buried in the rock is hidden unless the Vein Scanner reveals it.
        if (dens <= T) {
          if (h < 0.06) {
            ctx.fillStyle = COL.bright;
            ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 1.3 + ax * 3.1 + ay);
            ctx.fillRect(sx, sy, 1, 1);
            ctx.globalAlpha = 1;
          } else if (h < 0.28) {
            ctx.fillStyle = COL.dim;
            ctx.fillRect(sx, sy, 1, 1);
          }
        }
      }
    }
  };

  G.World = World;
})(window.G);
