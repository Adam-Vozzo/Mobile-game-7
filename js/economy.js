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
      augments: {},
      levels: {
        laserPower: 0,
        laserRange: 0,
        laserEff: 0,
        cargo: 0,
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
    const D = G.DEV;
    const aug = state.augments || {};
    const I = Economy.influenceValue(L.influence);
    const sI = Math.sqrt(I);
    const inf = CFG.influence;
    return {
      influence: I,
      sqrtI: sI,
      playerRadius: CFG.player.radius0 * sI,
      accel: CFG.player.accel * sI * D.shipSpeed,
      maxSpeed: CFG.player.maxSpeed * sI * D.shipSpeed,
      turnRate: CFG.player.turnRate * D.turn,
      laserPower: CFG.laser.power0 * (1 + 0.55 * L.laserPower) * D.mining,
      laserRange: CFG.laser.range0 * Math.pow(I, inf.rangeExp) * (1 + 0.35 * L.laserRange),
      carveR: CFG.laser.carveR0 * Math.pow(I, inf.carveExp),
      yield: CFG.laser.yield0 * (1 + 0.5 * L.laserEff) * (state.yieldMult || 1),
      cargoCapacity: CFG.player.cargo0 * sI * (1 + 0.6 * L.cargo),
      baseRange: CFG.base.range0 * sI * (1 + 0.3 * L.baseRange),
      energyMax: CFG.player.maxEnergy0 * sI * (1 + 0.35 * L.baseRange) * (aug.reserveCells ? 1.4 : 1),
    };
  };

  // Per-factory bot stats.
  Economy.deriveBotStats = function (levels, influence) {
    const I = influence;
    const sI = Math.sqrt(I);
    const inf = CFG.influence;
    return {
      botSpeed: CFG.bot.speed0 * (1 + 0.4 * levels.botSpeed) * sI * G.DEV.botSpeed,
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

  // One-time, non-scaling augments (bought once, fixed cost).
  Economy.AUGMENTS = [
    { id: "compass", name: "Compass", desc: "A subtle arc on your hull with a needle pointing back to base, wherever you roam.", cost: { minerals: 120, crystals: 4 } },
    { id: "resonance", name: "Resonance Scanner", desc: "A second needle that points toward the nearest Catalyst vein.", cost: { minerals: 300, crystals: 10, catalyst: 3 } },
    { id: "reserveCells", name: "Reserve Cells", desc: "+40% energy capacity.", cost: { minerals: 220, crystals: 8 } },
    { id: "hullPlating", name: "Hull Plating", desc: "Bore through solid rock far faster (less slowdown inside terrain).", cost: { minerals: 260, crystals: 6 } },
    { id: "tractor", name: "Tractor Beam", desc: "Deposit cargo into a base or factory twice as fast.", cost: { minerals: 180, crystals: 5 } },
  ];

  Economy.ownsAugment = function (state, id) {
    return !!(state.augments && state.augments[id]);
  };
  Economy.augmentDef = function (id) {
    return Economy.AUGMENTS.find((a) => a.id === id);
  };

  // Dev slider metadata (gameplay tab). Multipliers stored on G.DEV.
  Economy.DEV_SLIDERS = [
    { key: "shipSpeed", name: "Ship Speed", min: 0.3, max: 2.5, step: 0.05 },
    { key: "turn", name: "Turn Rate", min: 0.4, max: 2.5, step: 0.05 },
    { key: "mining", name: "Mining Power", min: 0.3, max: 4, step: 0.1 },
    { key: "botSpeed", name: "Bot Speed", min: 0.3, max: 3, step: 0.05 },
    { key: "recharge", name: "Recharge Rate", min: 0.3, max: 3, step: 0.05 },
    { key: "glow", name: "Glow Intensity", min: 0, max: 2.5, step: 0.1 },
  ];

  Economy.UPGRADES = {
    base: [
      { id: "laserPower", name: "Laser Power", desc: "Carve rock faster." },
      { id: "laserRange", name: "Laser Range", desc: "Reach deposits from farther away." },
      { id: "laserEff", name: "Refinement", desc: "Extract more minerals per carve." },
      { id: "cargo", name: "Cargo Hold", desc: "Carry more ore before you must return to deposit it." },
      { id: "baseRange", name: "Base Range", desc: "Widen the recharge & control field and raise your energy capacity." },
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
    { glyph: "▮", cls: "c-en", name: "Energy", desc: "The white bar right of your ship. Drains when acting outside recharge range; refill at a base (fast) or factory (slow)." },
    { glyph: "▤", cls: "c-cargo", name: "Cargo", desc: "The amber bar left of your ship. Mined ore loads here; return to a base or factory to deposit it." },
  ];

  // Developer experiment toggles (Settings menu). kind: style | play.
  Economy.DEV_DEFS = [
    { key: "sweep", name: "Light Sweep", desc: "Slow top-to-bottom light band.", kind: "visual" },
    { key: "grid", name: "Grid", desc: "Fixed world grid the ship flies over.", kind: "visual" },
    { key: "bloom", name: "Extra Bloom", desc: "Stronger glow on everything.", kind: "visual" },
    { key: "scanlines", name: "CRT Scanlines", desc: "Horizontal scanline overlay.", kind: "visual" },
    { key: "vignette", name: "Vignette", desc: "Darken the screen edges.", kind: "visual" },
    { key: "invertTerrain", name: "Invert Terrain Shade", desc: "Flip to light rock / dark space.", kind: "visual" },
    { key: "infiniteEnergy", name: "Infinite Energy", desc: "Never run out of energy.", kind: "cheat" },
    { key: "magnet", name: "Ore Magnet", desc: "Deposit mined ore instantly, anywhere.", kind: "cheat" },
    { key: "autoAim", name: "Auto-Aim Laser", desc: "Laser targets the nearest rock automatically.", kind: "cheat" },
    { key: "instantBots", name: "Instant Bots", desc: "Factories assemble bots almost instantly.", kind: "cheat" },
    { key: "noCargoLimit", name: "No Cargo Limit", desc: "Carry unlimited ore.", kind: "cheat" },
  ];

  G.Economy = Economy;
})(window.G);
