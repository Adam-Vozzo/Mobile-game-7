# CORE — Roadmap

> One-file context for picking up development of CORE in a fresh session.
> If you're a new agent: read this whole file before doing anything, then
> ask which row from "The plan" to tackle.

## What this is

**CORE** is a mobile-first browser game (vanilla JS + HTML5 Canvas, no build
step, PWA-installable). You fly a small ship through the destructible core
of a planet, mining ore veins, automating with factory bots, salvaging
buried wrecks for augments, and managing energy so you don't brown out in
the dark. Rendered in a Flipper-Zero-style amber line-art aesthetic.

**Current build: b30.** All features so far ship to the branch
`claude/eloquent-noether-S7BSg`. Cache-bust query strings on every asset
(`?v=bNN`) and a service worker keep the live PWA up to date.

## The chosen design direction (genre pivot, settled in conversation)

CORE is becoming a **crafting-based exploration game** in the lineage of
**SteamWorld Dig** and **Terraria's loop**. The verbs are leave → explore
→ gather → upgrade → repeat, but the *thing that makes it work* is:

- **Tiered progression that gates places, not just numbers.** Upgrading
  unlocks *new terrain you can mine*, not just bigger payouts. This is
  the single most important design rule.
- **A base you genuinely build and return to.** Crafting bench, vault,
  placed structures. Going home pays off in *building something*, not
  just clicking +1.
- **Layered concentric biome zones**, each with distinct palette, ore
  mix, hazard, and at least one climactic moment that gates the next.
- **Climaxes without combat (mostly).** Lead with crisis events
  (escape-the-collapse), environmental boss-puzzles (mine the giant
  thing correctly), and discovery moments (named landmarks, lore logs).
  One mid-game **catastrophe** event splits the game into halves.
  Endgame is a single authored expedition to the planet's core.

What CORE is **not** becoming: a roguelite (the world persists), an idle
game (offline approximations should be cut, not grown), a survival-
crafting game (scope explosion), or multiplayer (tech mismatch). The
**Ascend** prestige loop is the wrong instinct for this genre and is
already descoped.

## Current state — what's already built

These systems exist and are working as of b30. Most of them want to be
**repurposed**, not rebuilt, for the new direction.

| System | State | Repurpose for the new direction |
|---|---|---|
| Destructible density field + marching-squares contours | Stable, perf-tuned | Spine of the whole game. Keep as-is. |
| Player ship + laser (forward/auto-target/twin/burst beams) | Working | Keep. Augments stack/synergize via the laser mod system. |
| Energy + brownout (50% speed, augments dark, screen flicker) | Working | Keep — already provides soft pressure. |
| Factory bots with cute "fly→standoff→fire/rotate volley→relocate" rhythm | Working | Bots become *helpers*, not the primary income engine. |
| Augment tree (Shipyard) with regular + salvaged-from-wreck specials | Working | Becomes the gear-gate tree. Augments should *unlock places*. |
| Wrecks with beacon pulses + salvage flow | Working | Becomes the "dungeon" system. Each wreck wants a lore log. |
| Built structures: Factory, Shipyard, plus 4 dev try-it (Beacon Tower, Refinery, Ore Depot, Scanner Array) | Working | The 4 try-it structures should be promoted to default builds during Crawl. They're the seed of base building. |
| Vein Scanner (built-in weak scope + 3-level augment, fading reveal) | Working | Keep. Pairs naturally with biome reveal. |
| Floodlight augment (auto-lights deep-zone darkness) | Working | Keep — perfect for the depth-based zones plan. |
| Biome dev toggle (caverns/dense/rich/barren/catalystRush) re-rolls world | **Replace** | Should become *concentric zones in one world*, not toggle-replaced. |
| Ship Class scaling (Class I–V) | Descoped to dev slider | Keep parked. The new genre doesn't need it. |
| Ascend / prestige | Implemented but **wrong genre fit** | Cut during Crawl. |
| Idle / offline income approximation | Implemented but **wrong genre fit** | Cut during Crawl. |
| PWA (manifest, icons, service worker, offline play) | Working | Keep — mobile-first is the whole point. |
| Dev menu: gameplay sliders, biome picker, cheats, "Unlock All Augments" | Working | Keep. Add new dev toggles as Walk/Run features arrive. |

## Climax design (settled in conversation)

The game needs *peaks*. They don't have to be combat. Use this mix:

| Position in arc | Type | Example |
|---|---|---|
| Early (~30 min in) | **Discovery** | First salvaged wreck has a lore log fragment |
| Per zone (each tier) | **Environmental boss-puzzle** OR **crisis event** | "Heart Vein" you mine in sequence; or wreck destabilizes, 30s to extract |
| Per-zone bonus | **Gauntlet** | A sealed deep-run shaft that closes behind you |
| Mid game | **Catastrophe** (one-time, transforms world) | The Awakening: new ore appears, deeper layers open |
| Endgame | **Discovery + boss-puzzle** | The First Ship — authored expedition to the planet's center |

Combat with HP/enemies is *optional* and should not be built before
Crawl + Walk are proven fun. Try the no-combat climax shapes first.

## The plan (Crawl / Walk / Run)

Each row tagged with **size** (S/M/L) and **what it validates** (the
question this feature is the answer to). Earlier rows unblock later rows;
do them in order within a phase.

### Crawl — the minimum viable pivot (~10 features)

Goal: prove the genre pivot is *fun*. ~2 weeks of work. If Crawl doesn't
feel right, you've learned cheaply.

| # | Feature | Size | Touches | Validates |
|---|---|---|---|---|
| 1 | **Two real biome zones** — concentric rings around the core, distinct palette + ore mix (e.g. "Crust" outer, "Mantle" inner) | M | world.js, config, camera | Exploration has a direction |
| 2 | **One gear gate** — an ore type ("obsidian") that can't be mined without a specific upgrade | **S** | world.js (carve), economy | **Unlocks open places, not stats** — single most important feature in the plan |
| 3 | **Crafting bench at base** — raw ore → bars → upgrade components | M | new UI panel, economy | Going home pays off in *building* |
| 4 | **Storage vault at base** — banked resources shown as a visible hoard | S | UI panel | The base feels like *mine* |
| 5 | **Cargo as tiered slots** — minerals/crystals/catalyst compete for limited space | M | entities.js, UI | Every trip has a story |
| 6 | **One climax: wreck crisis event** — salvaging destabilizes wreck, 30s to extract | M | game.js, particles | Climaxes without combat work |
| 7 | **Map / minimap panel** — overview of core with zones, base, scanned veins | M | new UI, camera | I know where I am |
| 8 | **Audio: 8 essential SFX** — laser, ore-pop, deposit chime, brownout, beacon, salvage, craft, etc. | M | new audio system | The game has presence |
| 9 | **Adjust economy for expeditions** — slower upgrade pace, lower per-vein pay, tighter cargo | S | config, economy | The loop has rhythm |
| 10 | **Cut Ascend + idle leftovers** | S | game.js, ui.js | No two games inside one |

### Walk — the real game (~14 features)

Goal: complete game with real progression, climaxes, and meta. ~6 weeks.

| # | Feature | Size | Touches | Validates |
|---|---|---|---|---|
| 11 | **Third + fourth biome zones** — Deep + Core, each distinct | M | world.js, config | Tiers aren't just "numbers go up" |
| 12 | **3–4 more gear gates** | M | world.js, economy | Every upgrade has a destination |
| 13 | **Crafting tree** — bars → components → augments, multi-step | L | economy, UI | The base is a system |
| 14 | **Salvage upgrade tree** — wreck rewards branch | M | game.js, economy | Wrecks are dungeons |
| 15 | **Environmental boss-puzzle per zone** | L | world.js, new puzzle entity | Climaxes can be smart, not violent |
| 16 | **Wreck logs** — paragraph of lore in a Codex panel | S | data, UI panel | There's a story here |
| 17 | **Codex at base** — wrecks found, landmarks named, biomes mapped | M | UI, save | Persistent meta-progression |
| 18 | **3 named landmarks per world** | S | world gen, data | This world is mine |
| 19 | **Base building (light)** — drop structures anywhere, snap-to-grid | L | entities, UI, save | My base is a place I made |
| 20 | **Soft threats** — cave-ins, energy parasites | M | world.js, entities | The world has stakes |
| 21 | **Daily seed** — one shared world per day, optional | S | game.js | I'll come back tomorrow |
| 22 | **Augment slots + loadouts** — cap to 4 + 1 special, save presets | M | economy, UI, save | What I bring matters |
| 23 | **QoL pass** — waypoints, energy budget readout, segmented cargo bar | M | UI | Everything legible |
| 24 | **More music** — ambient drone per biome, intensifies on climax | M | audio | Each place has a voice |

### Run — the polish layer (~14 features)

Goal: turn a real game into a *good* one. Don't start until Walk is fun.

| # | Feature | Size | Touches | Validates |
|---|---|---|---|---|
| 25 | **Catastrophe event** — clearing 50% of core triggers "Awakening" | L | world.js, save, balance | Game has a before and after |
| 26 | **Endgame expedition: The First Ship** | L | new content, scripting | An ending I'll remember |
| 27 | **Sub-biomes within zones** — crystal caves, magma rivers | M ea. | world.js | Fresh things to find for hours |
| 28 | **Hostile fauna (optional)** — start with one creature | L | new combat system | Should combat exist at all? |
| 29 | **Bot specializations** — Scout / Hauler / Miner | M | entities, economy | Factories evolve |
| 30 | **Bot personalities + names** | S | entities | I have favorites |
| 31 | **Run objectives** — 3 procedural goals per session | M | UI, game.js | Always know what to do next |
| 32 | **Cosmetic palette swaps** (e.g. unlock cyan retro) | M | styles, save | Look what I unlocked |
| 33 | **Haptics + camera kick** | S | input, render | The game feels like a tool |
| 34 | **Achievements / discovery log** | M | UI, save | Always one more thing |
| 35 | **Procedurally-named ships/wrecks/bots** | S | data | Everything has a story |
| 36 | **Difficulty options** — Easy / Standard / Brutal | M | config, economy | Right intensity for me |
| 37 | **Visual polish pass** — particle work, transitions, cinematics | L | render | This game looks alive |
| 38 | **New Game+ / replay value** | L | save, game.js | Still playing months later |

## Where to start

**Crawl #2 (one gear gate)** is the highest-leverage row in the entire
plan. It's small (a few hours), touches almost nothing, and is the
litmus test for whether the genre pivot is the right call. If a single
"this ore needs that upgrade to mine" interaction isn't satisfying,
nothing else in the plan will be — and you'll find out fast.

Suggested first session prompt for a fresh agent:

> Read ROADMAP.md. We're starting Crawl #2: one gear gate. Add an ore
> type "obsidian" that requires a new "Plasma Drill" augment to mine.
> Place a small patch of it deliberately so I can find it. Don't build
> the rest of the biome zones yet — just prove the unlock loop.

## Working notes for a new agent

- **Branch:** `claude/eloquent-noether-S7BSg`. Commit and push every
  verified feature with a build-stamp bump (`G.BUILD`, `sw.js` cache
  name, asset `?v=bNN`). Hard-refresh the live PWA to pick up changes.
- **Testing:** Playwright at `/opt/node22/lib/node_modules/playwright`,
  local server `python3 -m http.server 8123`. Headless tests in `/tmp/`
  have been the working pattern.
- **Game instance:** `window.G.game` is the live game; `window.G.CFG` is
  config, `window.G.DEV` is dev toggles, `window.G.Economy` is the
  upgrade/augment system.
- **Single source of truth** for tuning is `js/config.js`. Don't sprinkle
  magic numbers across the engine.
- **Don't auto-push** any GitHub PR/issue changes without asking, but
  committing+pushing to the working branch is the established norm.
