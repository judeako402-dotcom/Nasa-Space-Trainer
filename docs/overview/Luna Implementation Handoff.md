# SPUDNAUT — implementation handoff for Luna

**Purpose:** Continue the existing Phaser + TypeScript game from its actual current state. Work through the priorities below, keep the build runnable after each slice, and update this document as items land. This is a systems, content, UX, and optimization handoff; character art, cutscenes, and character animation are being handled separately.

## Implementation status — 2 November 2026

This pass implemented the following parts of the handoff:

- Added a destination-specific science briefing using NASA references for lunar gravity/regolith, Mars gravity/day/atmosphere/dust, Artemis, Apollo lunar geology, Perseverance sample work, and ISS life support. The screen explicitly distinguishes NASA facts from invented gauge values and simplified game effects.
- Renamed the mission rooms and assignments around habitat operations; added a reorganized 15-room surface outpost, connected walkable EVA worksite, visible airlock, destination-specific exterior props and hazard events, and three exterior assignments. Corridor clearance and every assignment route are covered by tests. Moon/Mars still share the same base geometry; destination differences are currently palette, props, facts, and event pools rather than distinct playable terrain layouts.
- Made the actual daily format consistent: a timed shift, five offers, three selected tasks. Removed the unused action-point and penalty-slot settings. Added daily game-unit upkeep, assignment effect/walk-time previews, three-day assignment cooldown, three-event cooldown, and player choices for solar-flare and Mars dust-storm responses.
- Made the first mission day reliably start with the oxygen scenario. Added mission-log snapshots with event response, metrics, and completed/missed task names.
- Re-themed several tasks and mechanics for station/EVA operations, added two hydroponics assignments so the Farmer role has relevant work, made specialist recovery bonuses explicit, and added a results panel with metric changes after each task. Task status is announced to assistive technology and the task panel is a labeled dialog.
- Added a menu route to replay training without clearing the active trial; a confirmed reset-save action; malformed-JSON backup recovery; and persisted remaining shift time when a player saves/exits or backgrounds the page.
- Replaced the Phaser splash with a lightweight CSS opening animation and made Phaser/game scenes load on demand. The main bundle is now about 118 kB minified, but the separately loaded Phaser chunk is still about 1.48 MB minified (about 340 kB gzip).
- Added tests for destination-filtered events, daily upkeep, the EVA route, and reachability of all assignment stations. Current automated suite: 26 tests passing. Production build succeeds.

Still open and should be handled in the next implementation pass:

1. The reorganized outpost is still rendered with procedural geometry and placeholder props. Replace the greybox presentation with authored tile/atlas art and make Moon/Mars exterior routes and obstacles mechanically distinct while preserving tested reachability.
2. The minigames are still shared generic mechanics with thematic labels. Build at least six task-specific interactions (scrubber diagnosis, water-flow routing, grow-light tuning, battery load balancing, rover route planning, suit/airlock checks, geology logging) with quality/error scoring and clear task-result panels.
3. Only two event types have interactive responses. Add balanced choices to more hazards/opportunities, then playtest whether responses are understandable and neither choice is an obvious always-best answer.
4. Verify the full game in browser at phone/tablet/desktop sizes, with keyboard-only and touch, screen-reader status, focus return/trap for every modal, reduced motion, audio blocking, and background/refresh behavior. Unit tests do not establish these UX outcomes.
5. Profile Phaser and rendering on a low-end device. The large Phaser chunk is lazy-loaded but has not been optimized internally; no atlas/texture budget or measured FPS target exists yet.
6. `src/main.ts` remains a large flow controller. Continue extracting screen controllers and mission-flow logic without broad rewrites. Add save schema migrations for changed task IDs and optional JSON export/import if future content requires it.
7. Add playable end-to-end/browser tests for training through final evaluation, new event choices, save/resume in each phase, and the penalty extension. The current suite is simulation-focused.

### Science reference boundary

Use NASA sources as educational evidence and mission inspiration, not as a claim that the fictional Spudnaut habitat, hazards, 0–100 gauges, resource drain, event odds, or action effects are real NASA specifications. NASA’s [Moon facts](https://science.nasa.gov/moon/facts/), [lunar regolith hazard overview](https://science.nasa.gov/biological-physical/what-hazards-are-caused-by-lunar-regolith/), [Mars facts](https://science.nasa.gov/mars/facts/), [Artemis program](https://www.nasa.gov/humans-in-space/artemis/), [history of lunar exploration](https://science.nasa.gov/solar-system/moon/history-of-lunar-exploration/), [Perseverance mission](https://science.nasa.gov/mission/mars-2020-perseverance/), and [ISS ECLSS overview](https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/) are linked in the game credits. Recheck time-sensitive mission status before adding dated claims. Treat Artemis as a campaign, Apollo as completed surface missions, and Perseverance as a robotic Mars rover; Spudnaut’s crewed surface base is fictional.

## Current baseline

- Phaser 3.90, TypeScript, and Vite. `src/main.ts` owns most screen flow, mission orchestration, and DOM overlay rendering; `src/game/scene.ts` renders the Phaser world; `src/sim/` contains movement, navigation, visibility, mission rules, and deterministic RNG.
- The opening and launch sequences exist. The menu, story panels, training deck, exam, specialist/destination lobby, 30-day mission loop, daily event/assignment cards, reports, options, credits, and local save/resume flow are present.
- The Phaser mission scene has one surface map definition. `src/model.ts` now lays out a connected 15-room outpost with an exterior route; `src/data/surfaceHabitat.ts` supplies habitat props and Moon/Mars palette variations. Geometry, walls, and much of the decor are procedural/vector greybox art, and Moon/Mars do not yet have different walkable exterior layouts.
- There are 23 mission task locations and 8 active task mechanics in `src/minigames.ts`. The mission offers 5 assignments, chooses 3, and runs a timed shift. Daily upkeep is a simplified game-unit drain; two environmental hazards have player response choices. Specialist perks and destination facts exist.
- The daily loop is explicitly a timed shift with 3 selected assignments; unused action-point settings were removed. The timer is not intended to represent real crew shift lengths or NASA procedure.
- Offer cards and event cards already appear in the DOM UI. Treat the card artwork as placeholder UI styling; improve the information and choices before adding a separate card-combat system.
- `npm run build` succeeds. The initial game bundle is about 118 kB minified; Phaser is lazy-loaded in a separate roughly 1.48 MB minified chunk (about 340 kB gzip), which still triggers Vite's chunk-size warning. The 26 tests cover simulation and map reachability more than complete player flows.

## P0 — fix the core mission loop and world identity

### 1. Make the surface habitat read as a planetary outpost

**Files:** `src/data/surfaceHabitat.ts`, `src/data/mapTypes.ts`, `src/game/scene.ts`, `src/model.ts`, `src/main.ts`.

- Replace the inherited spaceship-room silhouette/names with a comprehensible surface habitat layout: airlock, pressure corridor, command/lab, life support, greenhouse, power, med bay, storage, comms, and exterior work zone. Keep stable room/task IDs where saves depend on them, or version and migrate saves if IDs change.
- Give Moon and Mars distinct environmental presentation and gameplay modifiers. Moon: vacuum, abrasive regolith, thermal exposure, low gravity. Mars: dust storm/solar loss, thin-CO2 exterior exposure, cold, longer outdoor risk. Validate each event and task consequence against the selected destination rather than using one shared generic hazard deck.
- Add a genuine exterior/crater map area and return path through an airlock; make going outside a deliberate risk/reward choice. The current destination setting mostly changes descriptive copy and planet imagery.
- Establish a readable map legend and visual hierarchy for walls, doors, task stations, NPCs, hazards, and walkable paths. Make sure task markers cannot overlap doorways or spawn points and every offered task can be reached.
- Use authored tilemap/atlas layers when appropriate, with props such as airlocks, solar panels, antennae, rover bays, greenhouse beds, pressure doors, dust collectors, storage, cables, and readable room signage. Keep procedural geometry for debug/greybox use.

**Done when:** Moon and Mars are visibly distinct and have at least one destination-specific hazard/task each; the player can enter and exit the exterior safely; all selected assignments are reachable and clearly signposted.

### 2. Resolve the day-loop rules and make planning meaningful

**Files:** `src/data/balance.ts`, `src/sim/mission.ts`, `src/main.ts`, `src/app/state.ts`, mission help/brief UI.

- Choose and document one core format: (A) turn-based/action-point days with a small number of actions and explicit movement/task costs, or (B) real-time shifts with three selected assignments. The current constants and player-facing language imply both.
- Ensure every tuning value has a consumer. Remove dead `actionPoints` or implement it; reconcile `assignmentsPerDay` vs `penaltyAssignmentsPerDay`; make difficulty timer and penalty behavior understandable and consistent.
- Make planning cards show expected system impact, travel distance/time, task difficulty, risk, specialist bonus, and any event interaction before a choice is locked. Surface the reason for failure and what was lost at report time.
- Add choices with tradeoffs: repair now vs research, stay indoors vs surface samples, conserve power vs greenhouse output, respond to an event vs complete an assignment. Avoid choices that are cosmetic or always optimal.
- Ensure 30 days are not simply repeated random tasks: use mission phases/milestones, event pools with destination filtering, task cooldowns, escalating conditions, and a fair seeded schedule. Keep deterministic seeds for reproducible bug reports.
- Clarify what happens when the timer expires, when a player saves/exits mid-shift, and when a task modal is open. Prevent timer exploits caused by opening/closing UI or backgrounding the tab.

**Done when:** The brief, HUD, planning UI, and implementation all describe the same loop; every day offers understandable choices; saved/resumed shifts preserve a valid timer and state.

### 3. Make tasks feel like space work and provide useful feedback

**Files:** `src/minigames.ts`, `src/model.ts` task definitions, `src/data/events.ts`, `src/main.ts` task/result UI, `src/style.css`.

- Keep the existing wiring/calibration/inspection mechanics as prototypes, but map tasks to plausible operations: scrubber diagnostics, water-reclaimer flow balancing, greenhouse nutrient/light tuning, battery load routing, pressure-seal repair, antenna alignment, rover route survey, sample analysis, and radiation shelter preparation.
- Replace generic “swipe card / empty garbage / clear asteroids” framing in the outpost. Re-skin or replace mechanics to match the action; asteroid shooting should not be a routine habitat assignment unless the story establishes an actual threat.
- Tie success quality, time, mistakes, and specialist perks to clear metric outcomes. Give a concise result panel showing what changed and why. Avoid instant completion from repeated clicking/holding without feedback.
- Add a first-use instruction, a retry/exit affordance, progress and error states, pause-safe cleanup of timers/listeners, and keyboard/touch equivalents. Make completion impossible to trigger twice.
- Vary task parameters by destination, event, day, and difficulty using the mission RNG, while ensuring the puzzle remains solvable.

**Done when:** Each task explains the operation, has clear input and feedback, affects a relevant system, supports keyboard and touch, and cleans up its resources on close.

## P1 — improve player-facing systems and reliability

### 4. Give the cards, events, crew, and reports more strategic value

- Assignment and event cards exist today. Improve their hierarchy, readability, selected/disabled states, keyboard focus, and small-screen layout; display explicit metric deltas and destination relevance.
- Make event response actionable where appropriate: accept a cost, spend an assignment to mitigate, or take a risk for a research reward. Keep passive events for routine days, but don’t present a non-interactive event as if it were a player choice.
- Make all five specialist perks useful and testable across the mission. Avoid tying perks to a metric or task family that rarely appears. State the numerical effect in the lobby and results.
- Add a mission log and accessible history of days, choices, events, completed/missed tasks, and metric changes. The existing report is useful but only shows the current shift and final requirements.

### 5. Tighten navigation, tutorialization, accessibility, and screen flow

**Files:** `src/main.ts`, `src/game/scene.ts`, `src/data/trainingDeck.ts`, `src/style.css`, `src/ui-kit.css`.

- Audit every intended path from splash through story, training, exam, graduation, lobby, launch, mission, save/resume, final result, and new trial. Add a direct training/replay path from menu or credits without clearing certification/save data.
- Make the first mission teach the exterior/airlock and event/planning rules in short contextual prompts; let players revisit controls and tutorial hints.
- Check focus order, visible focus, dialog semantics, Escape behavior, labels, contrast, and reduced-motion behavior. Ensure status changes and metric deltas have text cues and are not color-only.
- Test the entire UI at narrow phone, tablet, and desktop sizes; support touch targets and avoid scroll traps behind overlays. Add optional remappable controls/gamepad only after core keyboard/touch flow is reliable.
- Ensure music/SFX volume controls affect their respective buses and persist; add appropriate ambience and task cues when licensed or authored audio is available. Handle browsers that block audio until user input.

### 6. Make save data robust and observable

**Files:** `src/model.ts` save validation/migrations, `src/app/state.ts`, persistence code in `src/main.ts`.

- Keep a versioned save schema with migrations for changed map/task IDs and validate all loaded mission fields. Gracefully recover corrupt or stale localStorage without silently losing a valid backup.
- Save at clear checkpoints (planning confirmation, task completion, report, exit); test resume during each phase and after refresh. Store enough timer state to prevent resetting the shift by reloading.
- Add a player-facing reset-save action with a clear confirmation, and optionally export/import a small JSON save for testing. Never make a new trial silently overwrite an active trial.

## P1 — tests and acceptance checks

Add tests alongside features; current coverage is concentrated in pure simulation modules.

- Unit: destination-specific event filtering/effects; task offer variety and reachability; role perks; timer/pause accounting; metric bounds; mission pass/fail and penalty day; save migration/validation; deterministic seeded runs.
- Integration/browser: new game → training → exam → lobby → launch → first shift → complete tasks → report → next day; save/resume from planning, active shift, task, and report; final win/fail and penalty extension; options persistence.
- Interaction: keyboard-only task completion, touch-sized controls, modal focus/close, reduced motion, narrow viewport, tab backgrounding, audio blocked until input.
- Record reproducible seeds and add a debug overlay/readout for current map, destination, day, task IDs, metrics, timer, FPS, and loaded assets. Keep debug controls disabled or hidden in release.

## P2 — performance and maintainability

**Files:** `src/main.ts`, `src/game/scene.ts`, `scripts/prepare-assets.mjs`, `vite.config.ts` if present, asset folders.

- Reduce startup payload: dynamically load Phaser/game scenes when needed and configure Vite vendor chunks. Keep DOM-only menu/story screens from paying the full Phaser parse/execute cost. Re-check the production bundle warning after splitting.
- Audit texture loading and disposal on scene transitions; preload only assets needed for the active scene, use atlases where they reduce requests/draw overhead, and avoid duplicate image copies. Compress/resize raster files to their actual display sizes where quality permits.
- Profile vision raycasts, map drawing, markers, UI updates, and resize handling on a low-end device. Keep the existing fixed-step simulation and capped frame delta; avoid rebuilding static geometry or DOM every frame. Tune `VISION.rays`/update frequency based on measurements, not guesswork.
- Break `src/main.ts` into screen controllers and mission-flow modules with typed boundaries. Keep pure rules in `src/sim` and content in `src/data`; remove duplicated or dead constants only after checking all usages.
- Make `prepare-assets` emit a clear manifest of copied assets and missing inputs; document provenance/license alongside each imported pack and ensure only needed files ship in `public`.
- Add a production smoke checklist for build, asset loading, browser console errors, save migration, and a full short mission. Track bundle size and frame rate as regressions.

## Recommended order for Luna

1. Replace procedural greybox art with authored habitat tiles/props; then make Moon/Mars exterior spaces mechanically distinct while keeping paths tested.
2. Replace thematic wrappers around generic mini-games with task-specific mechanics, success quality, error costs, and clear results.
3. Extend balanced event responses and tune daily attrition after several full simulated runs.
4. Run browser-based full-flow, accessibility, and responsive checks; fix the failures they expose.
5. Profile on a low-end device, optimize the Phaser chunk and textures, and extract `main.ts` modules incrementally.
6. Add end-to-end tests, save schema migration/export, and update this status with measured results.

## Explicit scope boundary

Do not spend this pass redrawing the potato characters, authoring story cutscenes, or producing character animation. Keep their existing asset paths and state interfaces stable where possible. The handoff focuses on playable maps, task/mission design, UI flow, accessibility, persistence, testing, and performance.

## Reference files

- Project pitch/requirements: `Project Overview/Nasa Hackathon.md` and `Project Overview/SPUDNAUT_ The Great Starch Migration.md`
- Flow and screens: `src/main.ts`, `src/app/state.ts`
- Simulation and tuning: `src/sim/`, `src/data/balance.ts`, `src/data/events.ts`
- Content/map definitions: `src/model.ts`, `src/data/trainingDeck.ts`, `src/data/surfaceHabitat.ts`, `src/data/mapTypes.ts`
- Phaser renderer and task mechanics: `src/game/scene.ts`, `src/minigames.ts`
- Assets pipeline: `scripts/prepare-assets.mjs`, `Assets/`, `public/assets/`
- Existing automated tests: `tests/`

