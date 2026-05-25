// Resources, upgrade definitions, derived stats, and purchasing.
// Global upgrades live on state.levels; bot upgrades live per-factory.
(function (G) {
  "use strict";
  const CFG = G.CFG;

  const Economy = {};

  Economy.defaultState = function () {
    return {
      minerals: 0,
      crystals: 0,
      catalyst: 0,
      yieldMult: 1,
      ascends: 0,
      levels: {
        laserPower: 0,
        laserRange: 0,
        laserEff: 0,
        baseRange: 0,
        influence: 0,
        factory: 0, // number of factories built (drives factory build cost)
      },
    };
  };

  Economy.factoryDefaultLevels = function () {
    return { botBay: 0, botSpeed: 0, botPower: 0, botCapacity: 0 };
  };

  Economy.influenceValue = function (level) {
    return Math.pow(1.3, level);
  };

  // Global stats: player, laser, influence, base, energy.
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
      yield: CFG.laser.yield0 * (1 + 0.5 * L.laserEff) * (state.yieldMult || 1),
      baseRange: CFG.base.range0 * sI * (1 + 0.3 * L.baseRange),
      energyMax: CFG.player.maxEnergy0 * sI,
    };
  };

  // Per-factory bot stats.
  Economy.deriveBotStats = function (levels, influence) {
    const I = influence;
    const sI = Math.sqrt(I);
    const inf = CFG.influence;
    return {
      botSpeed: CFG.bot.speed0 * (1 + 0.4 * levels.botSpeed) * sI,
      botCarveR: CFG.bot.carveR0 * Math.pow(I, inf.carveExp * 0.85),
      botPower: CFG.bot.power0 * (1 + 0.5 * levels.botPower),
      botCapacity: CFG.bot.capacity0 * (1 + 0.6 * levels.botCapacity) * sI,
      botBay: 1 + levels.botBay,
      sqrtI: sI,
    };
  };

  Economy.cost = function (id, level) {
    const c = CFG.cost[id];
    return {
      minerals: c.minerals ? Math.ceil(c.minerals * Math.pow(c.growth, level)) : 0,
      crystals: c.crystals ? Math.ceil(c.crystals * Math.pow(c.crystalGrowth || c.growth, level)) : 0,
      catalyst: c.catalyst ? Math.ceil(c.catalyst * Math.pow(c.catalystGrowth || c.growth, level)) : 0,
    };
  };

  Economy.canPay = function (state, cost) {
    return state.minerals >= cost.minerals && state.crystals >= cost.crystals && state.catalyst >= (cost.catalyst || 0);
  };

  Economy.pay = function (state, cost) {
    state.minerals -= cost.minerals;
    state.crystals -= cost.crystals;
    state.catalyst -= cost.catalyst || 0;
  };

  Economy.FACTORY_UPGRADES = ["botBay", "botSpeed", "botPower", "botCapacity"];

  Economy.UPGRADES = {
    base: [
      { id: "laserPower", name: "Laser Power", desc: "Carve rock faster." },
      { id: "laserRange", name: "Laser Range", desc: "Reach deposits from farther away." },
      { id: "laserEff", name: "Refinement", desc: "Extract more minerals per carve." },
      { id: "baseRange", name: "Base Range", desc: "Widen the recharge & control field around your base." },
      { id: "influence", name: "Influence", desc: "Grow your scale. Mine larger regions; the core shrinks around you. Needs Catalyst." },
      { id: "factory", name: "Build Factory", desc: "Deploy a factory here that assembles autonomous mining bots." },
    ],
    factory: [
      { id: "botBay", name: "Expand Bay", desc: "House more bots at this factory." },
      { id: "botSpeed", name: "Bot Thrusters", desc: "Bots at this factory travel faster." },
      { id: "botPower", name: "Bot Drills", desc: "Bots at this factory carve faster." },
      { id: "botCapacity", name: "Bot Hoppers", desc: "Bots at this factory carry more before returning." },
    ],
  };

  // HUD glossary entries.
  Economy.GLOSSARY = [
    { glyph: "◈", cls: "c-min", name: "Minerals", desc: "Primary resource from carving any rock. Funds most upgrades." },
    { glyph: "✦", cls: "c-cry", name: "Crystals", desc: "Mined from glittering crystal veins. Needed for advanced upgrades." },
    { glyph: "✷", cls: "c-cat", name: "Catalyst", desc: "Rare shiny material from special veins. Required to grow Influence." },
    { glyph: "▴", cls: "c-bot", name: "Bots", desc: "Active mining bots / total bay capacity across all factories." },
    { glyph: "⬡", cls: "c-fac", name: "Factories", desc: "Deployed factories. Each assembles and upgrades its own bots." },
    { glyph: "◎", cls: "c-inf", name: "Influence", desc: "Your scale. Higher influence zooms the view out and extends your reach." },
    { glyph: "◌", cls: "c-core", name: "Core", desc: "Percent of the planet core you have assimilated. Reach ~90% to Ascend." },
    { glyph: "▮", cls: "c-en", name: "Energy", desc: "The white bar by your ship. Drains when acting outside base range; recharge inside it." },
  ];

  G.Economy = Economy;
})(window.G);
