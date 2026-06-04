// Core namespace + math / noise / formatting helpers.
window.G = window.G || {};

(function (G) {
  "use strict";

  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Shortest angular interpolation.
  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % TAU) - Math.PI;
    if (d < -Math.PI) d += TAU;
    return a + d * t;
  }

  // Normalize to [-PI, PI].
  function wrapAngle(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx,
      dy = ay - by;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.sqrt(dist2(ax, ay, bx, by));
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  // Deterministic seeded PRNG (mulberry32) -> function returning [0,1).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Integer hash -> [0,1).
  function hash2(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 1442695040) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // 2D value noise in [0,1].
  function noise2(x, y, seed) {
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const fx = smoothstep(x - x0),
      fy = smoothstep(y - y0);
    const n00 = hash2(x0, y0, seed),
      n10 = hash2(x0 + 1, y0, seed),
      n01 = hash2(x0, y0 + 1, seed),
      n11 = hash2(x0 + 1, y0 + 1, seed);
    const nx0 = lerp(n00, n10, fx),
      nx1 = lerp(n01, n11, fx);
    return lerp(nx0, nx1, fy);
  }

  // Fractal Brownian motion of value noise -> [0,1].
  function fbm(x, y, seed, octaves) {
    let amp = 0.5,
      freq = 1,
      sum = 0,
      norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise2(x * freq, y * freq, seed + i * 1013);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  // Compact number formatting: 1.2K, 3.4M, 5.6B...
  const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp"];
  function formatNum(n) {
    if (!isFinite(n)) return "0";
    if (n < 0) return "-" + formatNum(-n);
    if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
    let tier = 0;
    while (n >= 1000 && tier < SUFFIX.length - 1) {
      n /= 1000;
      tier++;
    }
    return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString()) + SUFFIX[tier];
  }

  G.util = {
    TAU,
    clamp,
    lerp,
    lerpAngle,
    wrapAngle,
    dist,
    dist2,
    smoothstep,
    mulberry32,
    hash2,
    noise2,
    fbm,
    formatNum,
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  };
})(window.G);
