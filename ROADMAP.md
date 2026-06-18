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

**Current build: b31** (branch `claude/game-loop-improvements-1ia5ja`;
b30 and earlier shipped to `claude/eloquent-noether-S7BSg`). Cache-bust
query strings on every asset (`?v=bNN`) and a service worker keep the
live PWA up to date.

## Geometry (settled in b31): rim-start, dig INWARD

You start at a base on the **crust** (rim, ~0.86 R) and dig **inward**;
"depth" = closeness to the planet's heart (0 at the rim, 1 at the
center). Richer veins, crystal, catalyst, obsidian, and the darkness all
scale with depth, and the endgame expedition destination (the center)
is now an actual *destination*. This resolved a contradiction in the
earlier plan (zones named "Crust outer / Mantle inner" while the player
started at the center). Floodlight/depth-haze ramp with depth; save
format bumped to v3 (v2 center-start saves are not migrated).

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

These systems exist and are working as of b31. Most of them want to be
**repurposed**, not rebuilt, for the new direction.

New in b31 (the loop-structure pass):

| System | State |
|---|---|
| Rim base + dig-inward geometry | Done — base/start pocket at 0.86 R |
| Depth-graded ore (veins/crystal/catalyst denser + better-paying deeper) | Done — `world.depthOre`; vein mask baked at gen |
| **Gear gate: obsidian + Plasma Drill augment** (Crawl #2) | Done — deep noise patches + sealed shells around deep wrecks; laser bounces off, drill carves it; Phase Drive can't pass it |
| Deposit at BASE only (factories/beacons recharge but take no ore) | Done |
| Emergency tow (browned out + no recharge source: tap ship/E, −50% cargo) | Done — first real stake on energy |
| Range readout (`⌁ Ns charge · Ms to base`, red when the margin is thin) | Done — expedition planning |
| Wreck salvage scales with depth (0.6×–2.2×) | Done |
| Ascend + offline income + 90%-carve "win" | **Cut** (Crawl #10) |
| Trip clock (time-away-per-trip in the dev FPS readout) | Done — instrument before tuning Crawl #9 |

| System | State | Repurpose for the new direction |
|---|---|---|
| Destructible density field + marching-squares contours | Stable, perf-tuned | Spine of the whole game. Keep as-is. |
| Player ship + laser (forward/auto-target/twin/burst beams) | Working | Keep. Augments stack/synergize via the laser mod system. |
| Energy + brownout (50% speed, augments dark, screen flicker) | Working | Keep — already provides soft pressure. |
| Factory bots with cute "fly→standoff→fire/rotate volley→relocate" rhythm | Working | Bots become *helpers*, not the primary income engine. |
| Augment tree (Shipyard) with regular + salvaged-from-wreck specials | Working | Becomes the gear-gate tree. Augments should *unlock places*. |
| Wrecks with beacon pulses + salvage flow | Working; deep ones now obsidian-sealed, rewards scale with depth | Becomes the "dungeon" system. Each wreck wants a lore log. |
| Built structures: Factory, Shipyard, plus 4 dev try-it (Beacon Tower, Refinery, Ore Depot, Scanner Array) | Working | The 4 try-it structures should be promoted to default builds during Crawl. They're the seed of base building. |
| Vein Scanner (built-in weak scope + 3-level augment, fading reveal) | Working | Keep. Pairs naturally with biome reveal. |
| Floodlight augment (auto-lights deep-zone darkness) | Working | Keep — perfect for the depth-based zones plan. |
| Biome dev toggle (caverns/dense/rich/barren/catalystRush) re-rolls world | **Replace** | Should become *concentric zones in one world*, not toggle-replaced. |
| Ship Class scaling (Class I–V) | Descoped to dev slider | Keep parked. The new genre doesn't need it. |
| Ascend / prestige | **Cut in b31** | — |
| Idle / offline income approximation | **Cut in b31** | — |
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
| 2 | ~~**One gear gate** — obsidian + Plasma Drill~~ | — | **DONE b31** (sealed shells around deep wrecks + deep patches) | **Unlocks open places, not stats** |
| 10 | ~~**Cut Ascend + idle leftovers**~~ | — | **DONE b31** | No two games inside one |
| — | ~~Depth-graded ore + rim-start geometry~~ (foundation for #1) | — | **DONE b31** | Exploration has a direction |
| — | ~~Emergency tow (brownout stake) + range readout + trip clock~~ | — | **DONE b31** | Expeditions have risk & planning |
| 1 | **Two real biome zones** — concentric depth bands with distinct palette + hazard (Crust outer → deeper bands), layered on the b31 depth gradient | M | world.js, config, camera | Tiers gate *places* |
| 9 | **Adjust economy for expeditions** — tune against the trip clock (target ~3–5 min round trips); slower upgrade pace, tighter cargo | S | config, economy | The loop has rhythm |
| 3 | **Crafting bench at base** — raw ore → bars → upgrade components | M | new UI panel, economy | Going home pays off in *building* |
| 4 | **Storage vault at base** — banked resources shown as a visible hoard | S | UI panel | The base feels like *mine* |
| 5 | **Cargo as tiered slots** — per-resource holds (deferred from b31: needs the #9 economy pass first; b31 keeps one pool) | M | entities.js, UI | Every trip has a story |
| 6 | **One climax: wreck crisis event** — salvaging destabilizes wreck, 30s to extract | M | game.js, particles | Climaxes without combat work |
| 7 | **Map / minimap panel** — overview of core with zones, base, scanned veins | M | new UI, camera | I know where I am |
| 8 | **Audio: 8 essential SFX** — laser, ore-pop, deposit chime, brownout, beacon, salvage, craft, etc. | M | new audio system | The game has presence |

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

Crawl #2 (gear gate), #10 (cuts), and the geometry/gradient foundation
shipped in b31. **Next up: playtest the b31 loop**, then Crawl #1 (zones
as depth bands with palettes/hazards) and #9 (economy tune using the
trip clock — turn on Show FPS in Settings → Visual to see per-trip
times). After that, #3/#4 (bench + vault) make returning home pay off
in building.

Suggested next session prompt for a fresh agent:

> Read ROADMAP.md. b31 landed the rim-start geometry, depth gradient,
> and the obsidian/Plasma Drill gate. We're doing Crawl #1: turn the
> depth gradient into two named depth bands ("Crust", "Mantle") with
> distinct palettes and one hazard in the deeper band. Then retune the
> economy (#9) against the trip clock.

## Working notes for a new agent

- **Branch:** `claude/game-loop-improvements-1ia5ja` (b31+); earlier
  builds live on `claude/eloquent-noether-S7BSg`. Commit and push every
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
