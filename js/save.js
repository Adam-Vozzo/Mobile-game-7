// localStorage persistence (including the carved terrain) + offline income.
(function (G) {
  "use strict";

  function b64encode(u8) {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
  }
  function b64decode(str) {
    const bin = atob(str);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  const Save = {};

  Save.save = function (game) {
    try {
      const g = game;
      const dens = g.world.density;
      const u8 = new Uint8Array(dens.length);
      for (let i = 0; i < dens.length; i++) u8[i] = Math.round(dens[i] * 255);
      const data = {
        v: 1,
        t: Date.now(),
        seed: g.world.seed,
        econ: g.state,
        removed: g.world.removedTotal,
        botIncome: g.botIncomeEMA || 0,
        player: { x: g.player.x, y: g.player.y, angle: g.player.angle },
        factories: g.factories.map((f) => ({ x: f.x, y: f.y, seed: f.seed, bots: f.bots.length })),
        density: b64encode(u8),
      };
      localStorage.setItem(G.CFG.save.key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  };

  Save.load = function () {
    try {
      const raw = localStorage.getItem(G.CFG.save.key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  Save.clear = function () {
    try {
      localStorage.removeItem(G.CFG.save.key);
    } catch (e) {}
  };

  // Restore the carved density grid into a freshly-generated world.
  Save.applyDensity = function (world, b64) {
    try {
      const u8 = b64decode(b64);
      if (u8.length !== world.density.length) return false;
      for (let i = 0; i < u8.length; i++) world.density[i] = u8[i] / 255;
      return true;
    } catch (e) {
      return false;
    }
  };

  Save.b64encode = b64encode;
  Save.b64decode = b64decode;
  G.Save = Save;
})(window.G);
