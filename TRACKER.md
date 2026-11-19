# SPUDNAUT Mobile Web — Work Tracker

Status log for the mobile PWA and Capacitor Android effort. Update the checkboxes as phases complete.

Project: SPUDNAUT (TypeScript, Phaser 3.90, Vite 6, Vitest)
Scope: mobile web PWA and Android debug APK. No native offline mode or signed store release is included.
Plan: Phase 1 (touch controls) → Phase 2 (responsive layout) → Phase 3 (PWA/offline/performance) → Phase 4 (tutorial/presentation polish) → Phase 5 (test coverage) → Phase 6 (Capacitor Android packaging).

---

## Phase 1 — Touch controls and PC-gap buttons

Status: complete. `npm run build` passes; `npm test` passes (15 files, 183 tests).

- [x] New module `src/game/systems/TouchControls.ts` — floating-origin virtual joystick with pointer capture, deadzone/unit-clamp math, queued touch actions (`interact`, `snapCamera`, `demoPan`), peek hold state, `mount()`/`unmount()`, `touchControls` singleton, and `shouldUseTouchControls()` device detection (coarse primary pointer plus `maxTouchPoints > 0`).
- [x] `src/game/systems/InputSystem.ts` merges the joystick vector with the keyboard. Keyboard wins while held, so desktop behaviour is unchanged. Queued touch actions drain into `justPressedActions`; `isShiftDown()` also reports the touch PEEK hold.
- [x] `src/ui/layout.ts` — joystick markup (`#touch-controls`) and camera cluster (`#camera-cluster`, PEEK / RECENTER / TOUR) added to the scene shell and mission HUD.
- [x] `src/main.ts` — mounts `touchControls` after `mountAppFrame()`, wires `cam-peek` (hold), `cam-snap`, and `cam-tour` through `wireCameraCluster()`.
- [x] `SurfaceScene` — tap-to-walk via `camera.getWorldPoint` → `routeTo()`, tap snapping onto nearby station markers (80 px), and `autopilotStep()` that walks the guide path for player-requested routes. Scripted emergency markers stay visual only.
- [x] `route-blocked` GameEvent now emitted when a manual route cannot be followed; `main.ts` shows the toast.
- [x] `TrainingScene.navigateTo()` implemented with `MapGeometry.findPath()` + `sim.route` (was a stub that always failed, so touch could not play the training deck). Joystick merged into `readInput()`; deck taps walk to the tapped point.
- [x] Training USE button (`[data-training-use]`) added to the training HUD with styles in `ui-kit.css`; `updateActionButtons()` drives both USE buttons so the thumb target never jumps.
- [x] Commander briefings with an `advanceKey` now render a real CONTINUE button instead of a key hint that trapped touch players behind an inert backdrop.
- [x] Minigame touch fixes in `src/minigames.ts` — hold button uses pointer capture and releases on `pointerup`/`pointercancel`/`lostpointercapture`; swipe speed window relaxed for touch drags; calibrate hit band widened on coarse pointers.
- [x] New stylesheet `src/styles/touch-controls.css` (imported from `index.css`) — joystick placement above the profile plate at every orientation, camera cluster targets at least 44 px, safe-area insets, `touch-action: none` on the canvas so gameplay gestures never scroll or zoom the page, and right-hugging toasts on touch so they clear the joystick.
- [x] Tests: `tests/touchControls.test.ts` (16 cases) covers detection, deadzone, unit clamp, action queue, peek state, and unmount cleanup.

Verification notes

- Desktop keyboard and mouse paths were not modified except where touch is additive; no desktop regression observed in the test suite.
- `npm install` was required first (no `node_modules` in the checkout).

---

## Phase 2 — Responsive layout

Status: implementation and automated verification complete. S1, P1-1…P1-5, P2-1…P2-4, P3-1, and adaptive camera zoom are fixed. Pass 3 now verifies 320×640, 390×844, 430×932, and 667×375; real-device testing remains blocked because no phone is available here.

### Systemic

- [x] **S1 — cascade layers make phone fixes dead.** `src/styles/index.css:2-8` imports `style.css` (layer `legacy`), `ui-kit.css` (layer `components`), `spudnaut-theme.css` (layer `overrides`) into layers, but `mission.css`, `reference-design.css`, `ingame-hud.css`, `touch-controls.css` are unlayered. Unlayered rules beat all layered rules regardless of specificity, so `ui-kit.css:3826-3842` (≤640 HUD compaction), `mission.css:371`, and `spudnaut-theme.css:1779-1800` (≤560 menu column) never apply. Fix: move phone HUD overrides into `ingame-hud.css`/`touch-controls.css`, or drop the layering.

### P1 — reproducible breakages (320–430px portrait, 667×375 landscape)

- [x] **P1-1 — USE button overlaps camera cluster.** `ingame-hud.css:753` (`@media (max-width:960px)` sets `--hud-bottom: …+61px`) is declared after `ingame-hud.css:420` (≤640 sets `--hud-bottom: 8px`) so the phone value never wins; USE spans 67–125px from bottom while the camera cluster starts at 114px (`touch-controls.css:129`) — ~11px overlap, tapping the top of USE fires TOUR. Fix: gate line 753 to `min-width:641px`, or raise the cluster to +126px.
- [x] **P1-2 — toast renders behind the camera cluster.** Toast bottom = 145px on phones (`ingame-hud.css:358`) and `touch-controls.css:110-116` right-aligns it; camera stack occupies 114–262px at z-index 9 (`touch-controls.css:13`) over `.mission-hud` z-index 6 (`ui-kit.css:2515`). Every touch toast is partly unreadable. Fix: `bottom: 280px` for `body[data-touch-controls]`, or move it left of the camera column.
- [x] **P1-3 — joystick floats above the HUD and steals drawer taps.** `.touch-controls` z-index 9 (unlayered) beats `.mission-hud` z-index 6, so the Tasks/Status drawer (z 10/11 inside the HUD context) renders below the pad; `TouchControls.ts` never hides the pad when the drawer opens. Fix: hide `#touch-joystick` while a drawer/modal is open, or raise `.mission-hud` above the pad.
- [x] **P1-4 — landscape 667×375: joystick cleared neither the drawer rail nor the profile plate.** The rail is positioned 16px beyond the joystick's computed right edge for short landscape heights, including widths above the phone-only 640px breakpoint. Focused Pass 3 verifies the 16px minimum gap.
- [x] **P1-5 — dialogue CTA clipped at 561–640px.** `.spud-dialogue-cta` is `position:absolute; bottom:-48px` (`spudnaut-theme.css:1736-1740`) and only goes static at ≤560px, while `ingame-hud.css:478-483` makes the card scrollable at ≤640 — the NEXT button hangs 48px below the scroll viewport. Fix: make it static up to ≤700px.

### P2 — viewport / dvh / hardcoded sizes

- [x] **P2-1 — menu and options sized with `100vh`.** `style.css:483` (`.screen-menu.spud-video-menu`, used by every screen from `layout.ts:252`), `style.css:511-513` (`.video-menu-stage`), `style.css:1259`, `style.css:900` (options panel) → bottom-anchored TRAINING DECK / ARCHIVES buttons (`reference-design.css:77-78`) sit under mobile browser chrome. Fix: add `100dvh` fallbacks after each rule.
- [x] **P2-2 — map modal inline px height fights `max-height:54vh`** (`missionModals.ts:408-425` vs `ui-kit.css:1985-1993`): on 667×375 landscape the map squashes and room labels overlap. Fix: emit `min(Npx, 54dvh)` and keep aspect via width.
- [x] **P2-3 — report stat row frozen columns.** Inline `grid-template-columns:86px 1fr 94px` (`missionScreens.ts:1193`) with no media query for `.spud-stat-row` → bar track squeezed to ~90px at 320–430px. Fix: `minmax(64px,86px) minmax(0,1fr) auto`.
- [x] **P2-4 — mission log inline `max-height:44vh`** (`missionModals.ts:525`) → 165px scroll list in landscape. Fix: `44dvh` plus a 200px floor.

### P3 — dead CSS and coverage

- [x] **P3-1 — remove dead `.rotate-hint`.** Confirmed: only `style.css:4200` (base) and `style.css:7135-7139` (media gate) exist; no TS or HTML renders the element. Delete both blocks and check off this item.
- [ ] **P3-2 (optional, deferred) — dead legacy style blocks:** broad cleanup is not required for mobile readiness and needs a separate audit to avoid removing styles for low-frequency screens.
- [x] Viewport baseline is correct: `index.html:5` `viewport-fit=cover`, theme-color set, `html,body` pinned to `100dvh` (`ui-kit.css:32-38`), `min-width:320px; overflow-x:hidden` (`style.css:54-57`), safe-area insets on all fixed HUD bars and touch controls. No horizontal-scroll source found.
- [x] Coverage verdict for live screens: menus/options, dialogue modals, `missionModals`, training HUD, lobby/habitat/launch, mission shell/report/credits all have phone breakpoints — the exceptions are exactly P1-1…P1-5 and P2-1…P2-4 above.

### Remaining Phase 2 tasks

- [x] Fix P1-1 through P1-5, then P2-1 through P2-4.
- [x] Fix or remove S1 layering so the fixes above stay applied. (`index.css` now imports everything unlayered; unlayered files win by source order.)
- [x] Remove dead `.rotate-hint` CSS (P3-1).
- [x] Adaptive camera zoom: `cameraZoomForViewport()` in `src/data/balance.ts` clamps zoom to `min(1.1, max(0.55, viewWidth/900))`, applied at scene create/build and re-applied on Phaser `resize` in both `SurfaceScene` and `TrainingScene`.
- [x] Extend `tools/verify-e2e.mjs` mobile pass to cover the training deck, mission HUD/drawers, joystick/camera-cluster clearances, and 667×375 landscape clearance.
- [ ] **Blocked — manual device check:** portrait + landscape on a physical phone; no device is available in this environment.

## Phase 3 — PWA, offline, performance

- [x] Manifest: square 192×192 and 512×512 icons, maskable variants, and Apple touch icon.
- [x] Service worker: versioned app-shell precache, old-cache cleanup, offline navigation fallback, and bounded runtime caching for small static assets.
- [x] Service worker registration remains production-only; Vite preview serves the production build and is covered by browser E2E.
- [x] Install/update flow: menu affordance, install prompt handling, waiting-worker `SKIP_WAITING` action, and reload on `controllerchange`. The update E2E simulates a waiting worker; the banner is hidden outside the menu so it cannot block gameplay/tutorial controls.
- [x] Startup weight reviewed: Phaser remains a separate lazy-loaded chunk (1,481.79 KB raw / 339.86 KB gzip). Touch devices and Save-Data connections skip idle prewarming. Large media is intentionally not guaranteed offline; runtime cache entries are capped at 2 MB.
- [x] Verify offline cold start end to end: production-browser E2E confirms cached JavaScript/CSS, active service worker, and offline shell startup.

## Phase 4 — Tutorial and presentation polish

- [x] Tutorial: touch-specific first-minute instructions explain joystick/tap-to-walk, USE, Tasks, and the touch-friendly CONTINUE action.
- [x] Mission objectives and shift progression feedback pass: task counts, status bars, shift reports, and next-step guidance remain visible and consistent.
- [x] Scene transitions and feedback consistency verified across training, mission entry, reports, and completion in browser E2E.
- [x] Light presentation pass only; story, characters, and the core gameplay loop are unchanged.

## Phase 5 — Test coverage

- [x] Touch input coverage beyond unit maths: mobile E2E sends a real CDP touch drag and verifies the TrainingScene player position changes.
- [x] Responsive behaviour tests: no-overflow and control-clearance invariants at 320×640, 390×844, 430×932, and 667×375.
- [x] PWA lifecycle tests: service-worker registration/control, cache version cleanup, install action, simulated waiting-worker update message/reload, and offline cold start.
- [x] `tools/verify-e2e.mjs` uses touch emulation and CDP touch events for joystick movement; `tsconfig.app.json` continues to exclude tests.

## Phase 6 — Capacitor Android packaging

Status: debug APK built and artifact metadata verified. Device/emulator runtime testing is still blocked.

- [x] Capacitor wraps the existing Vite build from `dist/` with app ID `com.spudnaut.greatstarchmigration`; game/story content and loop are unchanged.
- [x] Native builds skip browser PWA install/update prompts and service-worker registration. No separate native offline mode was added; remote-backed features still require network access.
- [x] Branded launcher and splash assets are generated from `resources/icon.png`; `npm run android:assets` can regenerate them.
- [x] `npm run android:apk` builds, syncs, and assembles the debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`.
- [x] APK metadata verified with Android `aapt`: application label `SPUDNAUT`, min SDK 24, target SDK 36, and branded launcher/splash resources included.
- [ ] Emulator/device launch and interaction smoke test — no physical device is available, and the available emulator reported an unauthorized ADB connection.
- [ ] Release signing and store distribution are not included in this debug-APK task.

## Final verification

- `npm test` — 15 files, 183 tests passed.
- `npm run test:e2e` — all three live Chrome CDP passes passed with zero errors; focused Pass 3 passed twice after the 16px landscape clearance change.
- `npm run android:apk` — production web build, Capacitor sync, and Gradle debug APK assembly succeeded; verified package ID, app label, SDK range, and generated Android assets.
- Physical-device/emulator runtime testing is not complete because no physical device is available and the local emulator's ADB connection was unauthorized. The APK is debug-signed; a release-signed APK/AAB is not included.

---

## Comments and documentation notes

- Keep comments focused on intent ("why"), matching the existing style in `src/game` and `src/hud`.
- `navigateStationTo()` / `interactStation()` (`src/game/scene.ts`) and `walkStationTo()` / `interactActiveStation()` (`src/app/session.ts`) remain the bridges between DOM buttons and the active scene. New buttons should use them.
- `MapGeometry.findPath()` (`src/sim/navigation.ts`) is the single pathfinding source for both scenes.
- Keyboard always wins over the joystick in the merge rule; buttons are additive, so desktop input is untouched.
- Service worker and manifest behavior is owned by Phase 3.
- Update `README.md` controls section once touch controls ship, listing the joystick, tap-to-walk, training USE button, and camera cluster.
