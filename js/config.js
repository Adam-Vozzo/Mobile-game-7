// Tunable constants: visuals + balance. Single source of truth.
(function (G) {
  "use strict";

  G.CFG = {
    // ----- palette (Flipper Zero amber/orange) -----
    // Default: open/flyable space is lighter, solid rock is darker.
    COL: {
      bg: "#0e0a05",
      bgCenter: "#191107",
      rock: "#2a1809", // terrain interior: dark brown/orange (not black)
      bgAlt: "#241608", // inverted scheme (dev toggle): light space
      bgCenterAlt: "#311e0c",
      rockAlt: "#090603", // inverted scheme: dark rock
      vignette: "rgba(2,1,0,0.6)",
      dim: "#7a4a1e",
      line: "#d2701f",
      bright: "#ff9a36",
      player: "#ffd9a0",
      crystal: "#ffe2a6",
      catalyst: "#fffdf2",
      bot: "#e88a34",
      mineralDot: "#ff9a2e",
      crystalDot: "#ffe2a6",
      catalystDot: "#fffdf2",
      beam: "#ffcf9a",
      hud: "#ff9a36",
      hudDim: "#8a5526",
      danger: "#ff4338",
      grid: "#ff8200",
      sweep: "#ffa64d",
      cable: "#d2701f",
      charge: "#ffe6b0",
      energy: "#ffffff",
    },

    // ----- renderer -----
    render: {
      pixelCss: 1.625, // CSS px per game pixel (chunkiness); internal res scales with the screen
      minInternalW: 200,
      maxInternalW: 900,
      glow: true,
      grid: { world: 44, alpha: 0.055 }, // world-anchored line grid (base spacing in world units)
      sweep: { period: 9, alpha: 0.07, band: 0.42 }, // slow top->bottom light sweep
      vignette: 0.5,
    },

    // ----- world (the planet core: a disc of rock) -----
    world: {
      radius: 2600, // world units (2x the original core)
      cell: 8,
      threshold: 0.5,
      octaves: 4,
      noiseScale: 0.018,
      richScale: 0.009,
      veinScale: 0.05,
      crystalVeinCut: 0.74, // crystal-bearing rock
      specialScale: 0.07,
      specialVeinCut: 0.86, // rarer: catalyst-bearing rock
      massPerCell: 4,
      crystalPerCell: 0.6,
      catalystPerCell: 0.25,
      veinRichCut: 0.35, // richness at/above this = a paying mineral vein (also what the scanner reveals)
      startPocket: 68,
      maxRenderCells: 160,
    },

    // ----- player ship (asteroids-style) -----
    player: {
      radius0: 6,
      accel: 250,
      maxSpeed: 180,
      turnRate: 4.4,
      drag: 0.92, // higher = more glide / momentum
      rockDrag: 0.45,
      // energy
      maxEnergy0: 150, // scales with sqrt(influence)
      energyMove: 9, // /s at full thrust, outside base range
      energyLaser: 7, // /s while firing, outside base range
      energyRecharge: 40, // /s inside base range
      depletedSpeed: 0.5, // movement multiplier while browned-out (slowed 50%)
      brownoutRecover: 0.15, // exit brownout once energy climbs back to this fraction of max
      energyLow: 0.1, // <=10% -> bar pulses red
      cargo0: 300, // carrying capacity at influence 1 (scales with sqrtI)
    },

    // ----- mining laser (slightly less effective than before) -----
    laser: {
      range0: 74,
      carveR0: 9,
      power0: 1.9,
      yield0: 0.9,
      step: 4,
    },

    // ----- autonomous mining bots (chip rock from the edge) -----
    bot: {
      speed0: 130,
      carveR0: 7,
      power0: 3.2,
      capacity0: 16,
      assembleTime: 6,
      depositRange: 26,
      reachRays: 9, // rays cast to find a reachable rock face
      reachLen: 240, // ray length (world units, * sqrtI)
      retargetTime: 1.4,
    },

    // ----- camera -----
    camera: { baseScale: 0.75, follow: 6.5, lead: 0.18 }, // baseScale = game-px per world unit at Ship Class I

    // ----- influence / scale -----
    influence: { start: 1, carveExp: 1.0, rangeExp: 0.65 },

    // ----- base / factory recharge -----
    base: { range0: 150 }, // recharge + interaction radius at influence 1 (* sqrtI)
    factory: { range0: 80, rechargeMult: 0.25 }, // factories recharge slower, shorter range

    // ----- vein scanner augment (3 levels): reveal radius around the ship -----
    scanner: { range0: 150, rangePerLevel: 175, samplepx: 6.5 }, // world units * sqrtI; samplepx = dot spacing target (screen px)

    // ----- floodlight augment: auto-lit pool when far from the core -----
    flashlight: { range0: 120, startFrac: 0.42, fullFrac: 0.7 }, // light radius (world * sqrtI); ramps in between these fractions of core radius

    // ----- economy: upgrade costs (geometric). catalyst gates Influence. -----
    cost: {
      laserPower: { minerals: 18, growth: 1.55 },
      cargo: { minerals: 28, growth: 1.5 },
      energyCap: { minerals: 32, growth: 1.5 },
      // Ship Class: capped at 4, paid in rare Catalyst (+ crystals)
      influence: { crystals: 30, catalyst: 5, growth: 2.0, crystalGrowth: 2.0, catalystGrowth: 2.0 },
      factory: { minerals: 120, crystals: 2, growth: 2.0, crystalGrowth: 1.6 },
      shipyard: { minerals: 250, crystals: 8, growth: 1 },
      // per-factory bot upgrades
      botBay: { minerals: 90, crystals: 3, growth: 1.9, crystalGrowth: 1.7 },
      botRange: { minerals: 40, growth: 1.5 },
      botPower: { minerals: 45, growth: 1.55 },
      botCapacity: { minerals: 50, crystals: 1, growth: 1.55, crystalGrowth: 1.5 },
    },

    // ----- loose ore pickups (spawned when cargo is full) -----
    pickup: { pullRange: 95, mergeRange: 16, maxCount: 90, chunk: 0.22 },

    // ----- buried wrecks to salvage (unlock special augments) -----
    wreck: { count: 12, salvageRange: 60, reward: { minerals: 400, crystals: 30, catalyst: 6 } },

    // ----- misc -----
    save: { key: "coreforge.save.v2", interval: 8 },
    interactRange: 70, // factory interaction radius (* sqrtI)
  };

  // Developer toggles + slider multipliers (experiments). Persisted; edited
  // live from Settings.
  G.DEV = {
    // visual toggles
    sweep: true,
    grid: true,
    bloom: false,
    scanlines: false,
    vignette: false,
    invertTerrain: false,
    veinScanner: false,
    parallaxStars: false,
    showFps: false,
    botTargets: false,
    thickBeam: false,
    depthHaze: false,
    // gameplay toggles
    veinOnly: true,
    laserAuto: false,
    laserTwin: false,
    laserBurst: false,
    laserHeat: false,
    corePulse: false,
    shipTrail: false,
    screenShake: false,
    // cheat toggles
    infiniteEnergy: false,
    magnet: false,
    autoAim: false,
    instantBots: false,
    noCargoLimit: false,
    allAugments: false,
    // slider multipliers (1 = default)
    shipSpeed: 1,
    turn: 1,
    mining: 1,
    botSpeed: 1,
    recharge: 1,
    glow: 1,
    gameSpeed: 1,
    pickupRange: 1,
    glide: 0.92,
    // ship class is descoped from normal play (perf); dev-only override 0..4
    shipClass: 0,
  };

  // Build stamp (shown faintly bottom-left) to verify which build is live.
  G.BUILD = "2026-05-28 · b26";
})(window.G);
