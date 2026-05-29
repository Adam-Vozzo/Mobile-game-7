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
      unlocked: {}, // special augments discovered by salvaging wrecks
      levels: {
        laserPower: 0,
        cargo: 0,
        energyCap: 0,
        influence: 0,
        factory: 0, // number of factories built (drives factory build cost)
        shipyard: 0, // 0 or 1
      },
    };
  };

  Economy.factoryDefaultLevels = function () {
    return { botBay: 0, botRange: 0, botPower: 0, botCapacity: 0 };
  };

  // Ship Class scale: capped at 4 upgrades, scale 1.0 -> 4.0.
  Economy.influenceValue = function (level) {
    return 1 + 0.75 * Math.min(level, 4);
  };

  // Highest purchasable level for an upgrade id (Infinity if uncapped).
  Economy.maxLevel = function (id) {
    for (const panel in Economy.UPGRADES) {
      const d = Economy.UPGRADES[panel].find((u) => u.id === id);
      if (d && d.max != null) return d.max;
    }
    return Infinity;
  };

  // Global stats: player, laser, influence, base, energy.
  Economy.derive = function (state) {
    const L = state.levels;
    const D = G.DEV;
    const owns = (id) => Economy.ownsAugment(state, id);
    // Ship Class is descoped from normal play; a dev-only override drives it.
    const I = Economy.influenceValue(D.shipClass | 0);
    const sI = Math.sqrt(I);
    const inf = CFG.influence;
    const spd = owns("speed") ? 1.3 : 1;
    let laserPower = CFG.laser.power0 * (1 + 0.14 * L.laserPower) * D.mining;
    if (owns("laserStrength")) laserPower *= 1.5;
    if (owns("overdrive")) laserPower *= 2;
    const scanLvl = Economy.augmentLevel(state, "veinScanner");
    return {
      influence: I,
      sqrtI: sI,
      playerRadius: CFG.player.radius0 * sI,
      accel: CFG.player.accel * sI * D.shipSpeed * spd,
      maxSpeed: CFG.player.maxSpeed * sI * D.shipSpeed * spd,
      turnRate: CFG.player.turnRate * D.turn,
      laserPower: laserPower,
      laserRange: CFG.laser.range0 * Math.pow(I, inf.rangeExp),
      carveR: CFG.laser.carveR0 * Math.pow(I, inf.carveExp),
      yield: CFG.laser.yield0 * (state.yieldMult || 1),
      cargoCapacity: CFG.player.cargo0 * sI * (1 + 0.6 * L.cargo),
      baseRange: CFG.base.range0 * sI,
      energyMax: CFG.player.maxEnergy0 * sI * (1 + 0.25 * L.energyCap) * (owns("reserveCells") ? 1.4 : 1),
      recharge: CFG.player.energyRecharge * (1 + 0.35 * L.energyCap),
      scannerLevel: scanLvl,
      scannerRange: scanLvl > 0 ? (CFG.scanner.range0 + CFG.scanner.rangePerLevel * (scanLvl - 1)) * sI : 0,
      flashlight: owns("flashlight"),
      flashRange: CFG.flashlight.range0 * sI,
    };
  };

  // Per-factory bot stats.
  Economy.deriveBotStats = function (levels, influence) {
    const I = influence;
    const sI = Math.sqrt(I);
    const inf = CFG.influence;
    return {
      botSpeed: CFG.bot.speed0 * sI * G.DEV.botSpeed,
      botReach: CFG.bot.reachLen * (1 + 0.5 * (levels.botRange || 0)) * sI,
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

  Economy.FACTORY_UPGRADES = ["botBay", "botRange", "botPower", "botCapacity"];

  // One-time, non-scaling augments researched & installed at the Shipyard.
  // `special` augments stay hidden until their wreck is salvaged (unlocked).
  Economy.AUGMENTS = [
    { id: "compass", name: "Compass", desc: "A subtle arc on your hull with a needle pointing back to base, wherever you roam.", cost: { minerals: 120, crystals: 4 } },
    { id: "resonance", name: "Resonance Scanner", desc: "A second needle that points toward the nearest Catalyst vein.", cost: { minerals: 300, crystals: 10, catalyst: 3 } },
    { id: "reserveCells", name: "Reserve Cells", desc: "+40% energy capacity.", cost: { minerals: 220, crystals: 8 } },
    { id: "hullPlating", name: "Hull Plating", desc: "Bore through solid rock far faster (less slowdown inside terrain).", cost: { minerals: 260, crystals: 6 } },
    { id: "tractor", name: "Tractor Beam", desc: "Deposit cargo into a base or factory twice as fast.", cost: { minerals: 180, crystals: 5 } },
    { id: "recharger", name: "Recharger", desc: "Slowly recharges your energy even away from base.", cost: { minerals: 280, crystals: 8 } },
    { id: "speed", name: "Afterburners", desc: "+30% ship speed and acceleration.", cost: { minerals: 200, crystals: 6 } },
    { id: "laserStrength", name: "Beam Amplifier", desc: "A thicker, stronger mining beam (+50% laser power).", cost: { minerals: 240, crystals: 7 } },
    {
      id: "veinScanner",
      name: "Vein Scanner",
      desc: "Reveals nearby ore on your scope — minerals, crystal, and catalyst veins. Each level widens the scan range.",
      leveled: 3,
      tiers: [{ cost: { minerals: 150, crystals: 4 } }, { cost: { minerals: 320, crystals: 9 } }, { cost: { minerals: 560, crystals: 16 } }],
    },
    { id: "flashlight", name: "Floodlight", desc: "A hull lamp that lights the dark automatically as you roam far from the core.", cost: { minerals: 200, crystals: 6 } },
    // special — recovered from wrecks
    { id: "phaseDrive", name: "Phase Drive", desc: "Fly through solid rock at full speed.", cost: { minerals: 600, crystals: 20, catalyst: 5 }, special: true },
    { id: "siphon", name: "Siphon Array", desc: "Pull loose ore to your ship from anywhere.", cost: { minerals: 500, crystals: 18, catalyst: 4 }, special: true },
    { id: "overdrive", name: "Overdrive Core", desc: "+100% mining power.", cost: { minerals: 700, crystals: 24, catalyst: 6 }, special: true },
    // special laser mods — stack & combine (e.g. Targeting Array + Twin locks two veins)
    { id: "autoTarget", name: "Targeting Array", desc: "Your mining laser locks the nearest rock automatically — no aiming.", cost: { minerals: 520, crystals: 18, catalyst: 4 }, special: true },
    { id: "twinBeams", name: "Twin Emitters", desc: "Fire two mining beams at once — wider clears, or two veins together.", cost: { minerals: 620, crystals: 20, catalyst: 5 }, special: true },
    { id: "burstFire", name: "Pulse Driver", desc: "Fire in hard rhythmic bursts — far stronger while pulsing, and easy on energy.", cost: { minerals: 680, crystals: 22, catalyst: 6 }, special: true },
  ];
  // Special augment ids in wreck-type order (each wreck unlocks one).
  Economy.SPECIAL_AUGMENTS = ["phaseDrive", "siphon", "overdrive", "autoTarget", "twinBeams", "burstFire"];

  Economy.ownsAugment = function (state, id) {
    return G.DEV.allAugments || !!(state.augments && state.augments[id]);
  };
  Economy.augmentDef = function (id) {
    return Economy.AUGMENTS.find((a) => a.id === id);
  };
  Economy.augmentUnlocked = function (state, a) {
    return G.DEV.allAugments || !a.special || !!(state.unlocked && state.unlocked[a.id]);
  };
  // Owned level of an augment (0 = none). Boolean augments read as 0/1; leveled
  // augments store a count (old `true` saves coerce to level 1). The Unlock-All
  // cheat reads every augment at its max level.
  Economy.augmentLevel = function (state, id) {
    if (G.DEV.allAugments) {
      const a = Economy.augmentDef(id);
      return a ? Economy.augmentMax(a) : 1;
    }
    const v = state.augments && state.augments[id];
    if (!v) return 0;
    return v === true ? 1 : v | 0;
  };
  Economy.augmentMax = function (a) {
    return a.leveled || 1;
  };
  // Cost to buy the next level given the currently-owned level.
  Economy.augmentTierCost = function (a, level) {
    if (a.tiers) return a.tiers[Math.min(level, a.tiers.length - 1)].cost;
    return a.cost;
  };

  // Dev slider metadata (gameplay tab). Multipliers stored on G.DEV.
  Economy.DEV_SLIDERS = [
    { key: "shipClass", name: "Ship Class (descoped)", min: 0, max: 4, step: 1, suffix: "" },
    { key: "gameSpeed", name: "Game Speed", min: 0.25, max: 4, step: 0.25, suffix: "x" },
    { key: "shipSpeed", name: "Ship Speed", min: 0.3, max: 2.5, step: 0.05 },
    { key: "turn", name: "Turn Rate", min: 0.4, max: 2.5, step: 0.05 },
    { key: "mining", name: "Mining Power", min: 0.3, max: 4, step: 0.1 },
    { key: "botSpeed", name: "Bot Speed", min: 0.3, max: 3, step: 0.05 },
    { key: "recharge", name: "Recharge Rate", min: 0.3, max: 3, step: 0.05 },
    { key: "pickupRange", name: "Pickup Range", min: 0.5, max: 4, step: 0.1 },
    { key: "glide", name: "Glide / Momentum", min: 0.8, max: 0.985, step: 0.005, suffix: "" },
    { key: "glow", name: "Glow Intensity", min: 0, max: 2.5, step: 0.1 },
  ];

  Economy.UPGRADES = {
    ship: [
      { id: "laserPower", name: "Laser Power", desc: "Carve veins faster." },
      { id: "cargo", name: "Cargo Hold", desc: "Carry more ore before you must return to deposit it." },
      { id: "energyCap", name: "Energy Capacity", desc: "More energy and a faster recharge." },
    ],
    structures: [
      { id: "factory", name: "Build Factory", desc: "Deploy a factory here that assembles autonomous mining bots." },
      { id: "shipyard", name: "Build Shipyard", desc: "Construct a shipyard to research & install ship augments. Build one, then tap it.", max: 1 },
    ],
    factory: [
      { id: "botBay", name: "Expand Bay", desc: "House more bots at this factory." },
      { id: "botRange", name: "Bot Travel Range", desc: "Bots at this factory roam farther to find and mine rock." },
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
    { glyph: "◎", cls: "c-inf", name: "Ship Class", desc: "Your hull class (max V). Higher class scales you up and extends your reach." },
    { glyph: "◌", cls: "c-core", name: "Core", desc: "Percent of the planet core you have assimilated." },
    { glyph: "▮", cls: "c-en", name: "Energy", desc: "The white bar right of your ship. Drains when acting outside recharge range; refill at a base (fast) or factory (slow)." },
    { glyph: "▤", cls: "c-cargo", name: "Cargo", desc: "The amber bar left of your ship. Mined ore loads here; return to a base or factory to deposit it." },
    { glyph: "⌖", cls: "c-cry", name: "Wreck", desc: "Ships buried in the rock. Dig one free, then tap it to salvage — unlocks a special augment at your Shipyard." },
  ];

  // Developer experiment toggles (Settings menu). kind: style | play.
  Economy.DEV_DEFS = [
    { key: "sweep", name: "Light Sweep", desc: "Slow top-to-bottom light band.", kind: "visual" },
    { key: "grid", name: "Grid", desc: "Fixed world grid the ship flies over.", kind: "visual" },
    { key: "bloom", name: "Extra Bloom", desc: "Stronger glow on everything.", kind: "visual" },
    { key: "scanlines", name: "CRT Scanlines", desc: "Horizontal scanline overlay.", kind: "visual" },
    { key: "vignette", name: "Vignette", desc: "Darken the screen edges.", kind: "visual" },
    { key: "invertTerrain", name: "Invert Terrain Shade", desc: "Flip to light rock / dark space.", kind: "visual" },
    { key: "veinScanner", name: "Vein Scanner (force)", desc: "Force the vein scanner on at full range, even without the augment.", kind: "visual" },
    { key: "parallaxStars", name: "Parallax Stars", desc: "Drifting parallax starfield behind the core.", kind: "visual" },
    { key: "showFps", name: "Show FPS", desc: "Frame-time / FPS readout, top-left of the canvas.", kind: "visual" },
    { key: "botTargets", name: "Bot Targets", desc: "Draw a line from each bot to what it's mining.", kind: "visual" },
    { key: "thickBeam", name: "Thick Beam", desc: "Chunkier, brighter mining laser.", kind: "visual" },
    { key: "depthHaze", name: "Depth Haze", desc: "Darken toward the crust so the core reads as deep.", kind: "visual" },
    { key: "veinOnly", name: "Vein-Only Mining", desc: "Regular rock yields nothing — only veins pay.", kind: "gameplay" },
    { key: "laserAuto", name: "Laser: Targeting Array", desc: "Force auto-targeting on (try it with the other laser mods).", kind: "gameplay" },
    { key: "laserTwin", name: "Laser: Twin Emitters", desc: "Force twin beams on. With Targeting Array, locks two veins at once.", kind: "gameplay" },
    { key: "laserBurst", name: "Laser: Pulse Driver", desc: "Force burst fire on — punchy rhythmic pulses, stronger per hit.", kind: "gameplay" },
    { key: "laserHeat", name: "Laser Heat", desc: "Sustained firing overheats the laser; it cools down before firing again.", kind: "gameplay" },
    { key: "corePulse", name: "Core Pulses", desc: "Periodic core pulses that briefly double all yield.", kind: "gameplay" },
    { key: "shipTrail", name: "Ship Trail", desc: "The ship leaves a fading motion trail.", kind: "gameplay" },
    { key: "screenShake", name: "Screen Shake", desc: "Subtle camera shake while mining.", kind: "gameplay" },
    { key: "infiniteEnergy", name: "Infinite Energy", desc: "Never run out of energy.", kind: "cheat" },
    { key: "magnet", name: "Ore Magnet", desc: "Deposit mined ore instantly, anywhere.", kind: "cheat" },
    { key: "autoAim", name: "Auto-Aim Laser", desc: "Laser targets the nearest rock automatically.", kind: "cheat" },
    { key: "instantBots", name: "Instant Bots", desc: "Factories assemble bots almost instantly.", kind: "cheat" },
    { key: "noCargoLimit", name: "No Cargo Limit", desc: "Carry unlimited ore.", kind: "cheat" },
    { key: "allAugments", name: "Unlock All Augments", desc: "Every augment (including salvaged laser mods) reads as installed — effects on, shipyard shows them owned. Turn off to revert to what you've really earned.", kind: "cheat" },
  ];

  G.Economy = Economy;
})(window.G);
