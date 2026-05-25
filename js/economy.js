// Resources, upgrade definitions, derived stats, and purchasing.
(function (G) {
  "use strict";
  const CFG = G.CFG;

  const Economy = {};

  Economy.defaultState = function () {
    return {
      minerals: 0,
      crystals: 0,
      levels: {
        laserPower: 0,
        laserRange: 0,
        laserEff: 0,
        influence: 0,
        factory: 0, // number of factories built (drives factory cost)
        botSpeed: 0,
        botPower: 0,
        botCapacity: 0,
        botBay: 0,
      },
    };
  };

  // Continuous influence value from its level (exponential growth).
  Economy.influenceValue = function (level) {
    return Math.pow(1.3, level);
  };

  // Recompute everything that depends on upgrade levels + influence.
  Economy.derive = function (state) {
    const L = state.levels;
    const I = Economy.influenceValue(L.influence);
    const sI = Math.sqrt(I);
    const inf = CFG.influence;
    return {
      influence: I,
      sqrtI: sI,
      playerRadius: CFG.player.radius0 * sI,
      accel: CFG.player.accel * sI,
      maxSpeed: CFG.player.maxSpeed * sI,
      turnRate: CFG.player.turnRate,
      laserPower: CFG.laser.power0 * (1 + 0.55 * L.laserPower),
      laserRange: CFG.laser.range0 * Math.pow(I, inf.rangeExp) * (1 + 0.35 * L.laserRange),
      carveR: CFG.laser.carveR0 * Math.pow(I, inf.carveExp),
      yield: CFG.laser.yield0 * (1 + 0.5 * L.laserEff),
      botSpeed: CFG.bot.speed0 * (1 + 0.4 * L.botSpeed) * sI,
      botCarveR: CFG.bot.carveR0 * Math.pow(I, inf.carveExp * 0.85),
      botPower: CFG.bot.power0 * (1 + 0.5 * L.botPower),
      botCapacity: CFG.bot.capacity0 * (1 + 0.6 * L.botCapacity) * sI,
      botBay: 1 + L.botBay,
    };
  };

  Economy.cost = function (state, id) {
    const c = CFG.cost[id];
    const lvl = state.levels[id] || 0;
    return {
      minerals: Math.ceil(c.minerals * Math.pow(c.growth, lvl)),
      crystals: c.crystals ? Math.ceil(c.crystals * Math.pow(c.crystalGrowth || c.growth, lvl)) : 0,
    };
  };

  Economy.canAfford = function (state, id) {
    const c = Economy.cost(state, id);
    return state.minerals >= c.minerals && state.crystals >= c.crystals;
  };

  // Deducts cost and bumps the level. Side effects (spawning a factory) are
  // handled by the caller. Returns true on success.
  Economy.purchase = function (state, id) {
    if (!Economy.canAfford(state, id)) return false;
    const c = Economy.cost(state, id);
    state.minerals -= c.minerals;
    state.crystals -= c.crystals;
    state.levels[id] = (state.levels[id] || 0) + 1;
    return true;
  };

  // UI metadata. `panel` = which menu the upgrade lives in.
  Economy.UPGRADES = {
    base: [
      { id: "laserPower", name: "Laser Power", desc: "Carve rock faster." },
      { id: "laserRange", name: "Laser Range", desc: "Reach deposits from farther away." },
      { id: "laserEff", name: "Refinement", desc: "Extract more minerals per carve." },
      { id: "influence", name: "Influence", desc: "Grow your scale. Mine larger regions; the core shrinks around you." },
      { id: "factory", name: "Build Factory", desc: "Deploy a factory that assembles autonomous mining bots." },
    ],
    factory: [
      { id: "botBay", name: "Expand Bay", desc: "House more bots per factory." },
      { id: "botSpeed", name: "Bot Thrusters", desc: "Bots travel faster." },
      { id: "botPower", name: "Bot Drills", desc: "Bots carve faster." },
      { id: "botCapacity", name: "Bot Hoppers", desc: "Bots carry more before returning." },
    ],
  };

  G.Economy = Economy;
})(window.G);
