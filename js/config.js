// Tunable constants: visuals + balance. Single source of truth.
(function (G) {
  "use strict";

  G.CFG = {
    // ----- palette (Flipper Zero amber/orange on warm near-black) -----
    COL: {
      bg: "#0c0905",
      bgCenter: "#1d1206",
      rock: "#23180b", // tint filling solid terrain (distinct from caverns)
      vignette: "rgba(3,2,0,0.55)",
      dim: "#5e3712",
      line: "#c2611a",
      bright: "#ff9a36",
      player: "#ffd9a0",
      crystal: "#ffce7a",
      catalyst: "#fff3cf",
      bot: "#e88a34",
      mineralDot: "#d2922f",
      crystalDot: "#ffce7a",
      catalystDot: "#fff3cf",
      beam: "#ffcf9a",
      hud: "#ff9a36",
      hudDim: "#8a5526",
      danger: "#ff4338",
      grid: "#ff8200",
      sweep: "#ffa64d",
      cable: "#c2611a",
      charge: "#ffe6b0",
      energy: "#ffffff",
    },

    // ----- renderer -----
    render: {
      targetInternalW: 240,
      glow: true,
      grid: { spacing: 13, alpha: 0.11 }, // subtle screen-space dot grid
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
      startPocket: 68,
      maxRenderCells: 120,
    },

    // ----- player ship (asteroids-style) -----
    player: {
      radius0: 6,
      accel: 470,
      maxSpeed: 340,
      turnRate: 4.4,
      drag: 0.92, // higher = more glide / momentum
      rockDrag: 0.45,
      // energy
      maxEnergy0: 150, // scales with sqrt(influence)
      energyMove: 9, // /s at full thrust, outside base range
      energyLaser: 7, // /s while firing, outside base range
      energyRecharge: 75, // /s inside base range
      depletedSpeed: 0.16, // movement multiplier at 0 energy
      energyLow: 0.1, // <=10% -> bar pulses red
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
    camera: { baseView: 320, follow: 6.5, lead: 0.18 },

    // ----- influence / scale -----
    influence: { start: 1, carveExp: 1.0, rangeExp: 0.65 },

    // ----- base -----
    base: { range0: 150 }, // recharge + interaction radius at influence 1 (* sqrtI)

    // ----- economy: upgrade costs (geometric). catalyst gates Influence. -----
    cost: {
      laserPower: { minerals: 18, growth: 1.55 },
      laserRange: { minerals: 22, growth: 1.5 },
      laserEff: { minerals: 30, growth: 1.62 },
      baseRange: { minerals: 35, crystals: 1, growth: 1.55, crystalGrowth: 1.5 },
      influence: { minerals: 60, crystals: 4, catalyst: 1, growth: 1.85, crystalGrowth: 1.7, catalystGrowth: 1.55 },
      factory: { minerals: 120, crystals: 2, growth: 2.0, crystalGrowth: 1.6 },
      // per-factory bot upgrades
      botBay: { minerals: 90, crystals: 3, growth: 1.9, crystalGrowth: 1.7 },
      botSpeed: { minerals: 40, growth: 1.5 },
      botPower: { minerals: 45, growth: 1.55 },
      botCapacity: { minerals: 50, crystals: 1, growth: 1.55, crystalGrowth: 1.5 },
    },

    // ----- misc -----
    save: { key: "coreforge.save.v2", interval: 8 },
    interactRange: 70, // factory interaction radius (* sqrtI)
  };
})(window.G);
