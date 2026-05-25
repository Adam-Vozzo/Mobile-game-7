// Tunable constants: visuals + balance. Single source of truth.
(function (G) {
  "use strict";

  G.CFG = {
    // ----- palette (cyan on deep navy, matching the reference art) -----
    COL: {
      bg: "#0a1622",
      bgCenter: "#0e2233",
      vignette: "rgba(4,9,16,0.55)",
      dim: "#1f4a5e",
      line: "#3f9cba",
      bright: "#74e0ff",
      player: "#bdf4ff",
      crystal: "#e7fdff",
      bot: "#6fe0d6",
      mineralDot: "#2c6f86",
      crystalDot: "#bff6ff",
      beam: "#aef2ff",
      hud: "#7fe6ff",
      hudDim: "#3a7488",
      danger: "#ff8a8a",
    },

    // ----- renderer -----
    render: {
      targetInternalW: 230, // game-pixels across; pixel size derived from this
      minPixel: 2,
      maxPixel: 7,
      glow: true,
    },

    // ----- world (the planet core: a disc of rock) -----
    world: {
      radius: 1300, // world units
      cell: 8, // world units per density cell
      threshold: 0.5, // marching-squares isolevel (rock vs cavern)
      octaves: 4,
      noiseScale: 0.018, // multiplies cell coords for density noise
      richScale: 0.009, // noise scale for mineral richness
      veinScale: 0.05, // finer noise that defines crystal veins
      crystalVeinCut: 0.74, // veinNoise above this => crystal-bearing
      massPerCell: 4, // base minerals from carving a full-density cell
      crystalPerCell: 0.6, // base crystals from a full crystal-bearing cell
      startPocket: 68, // radius of the carved starting cavern (< laser range for instant feedback)
      maxRenderCells: 120, // LOD cap: sampled contour cells across the view
    },

    // ----- player ship (asteroids-style) -----
    player: {
      radius0: 6, // world-unit radius at influence 1
      accel: 520, // world units / s^2 (before influence scaling)
      maxSpeed: 360,
      turnRate: 4.6, // rad/s
      drag: 0.86, // velocity retained per ~16ms (applied frame-rate independent)
      rockDrag: 0.45, // extra slowdown when inside dense rock
    },

    // ----- mining laser -----
    laser: {
      range0: 74, // reach at influence 1 (world units)
      carveR0: 9, // carve radius at influence 1
      power0: 2.6, // density removed per second at beam center
      yield0: 1.0, // mineral yield multiplier
      step: 4, // raymarch step (world units) to find the rock surface
    },

    // ----- autonomous mining bots -----
    bot: {
      speed0: 130,
      carveR0: 7,
      power0: 3.2,
      capacity0: 16, // minerals carried before returning
      assembleTime: 6, // seconds for a factory to build one bot
      depositRange: 26, // distance to home to drop off
      searchSamples: 7, // candidate target points evaluated per re-target
      searchRing: 220, // how far bots look for rock (world units, * influence)
      retargetTime: 2.5,
    },

    // ----- camera -----
    camera: {
      baseView: 320, // world units across the viewport at influence 1
      follow: 6.5, // smoothing (higher = snappier)
      lead: 0.18, // velocity look-ahead
    },

    // ----- influence / scale progression -----
    influence: {
      start: 1,
      // player & laser radii scale with sqrt(influence); ranges/carve scale ~linear
      carveExp: 1.0,
      rangeExp: 0.65,
    },

    // ----- economy: upgrade costs (geometric) -----
    cost: {
      laserPower: { minerals: 18, crystals: 0, growth: 1.55 },
      laserRange: { minerals: 22, crystals: 0, growth: 1.5 },
      laserEff: { minerals: 30, crystals: 0, growth: 1.62 },
      influence: { minerals: 60, crystals: 4, growth: 1.85, crystalGrowth: 1.7 },
      factory: { minerals: 120, crystals: 2, growth: 2.0, crystalGrowth: 1.6 },
      botSpeed: { minerals: 40, crystals: 0, growth: 1.5 },
      botPower: { minerals: 45, crystals: 0, growth: 1.55 },
      botCapacity: { minerals: 50, crystals: 1, growth: 1.55, crystalGrowth: 1.5 },
      botBay: { minerals: 90, crystals: 3, growth: 1.9, crystalGrowth: 1.7 },
    },

    // ----- misc -----
    save: { key: "coreforge.save.v1", interval: 8 }, // autosave seconds
    interactRange: 70, // world units to interact with a building on foot
  };
})(window.G);
