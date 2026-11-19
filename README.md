# SPUDNAUT: The Great Starch Migration

A browser game about a potato crew running a Moon base. Complete three jobs per shift, balance the station’s four status bars, and bring home a Golden Potato Medal.

Built with TypeScript, Vite, Phaser 3, and plain DOM overlays.

## Run locally

```sh
npm install
npm run dev
```

```sh
npm run build     # type-check and create dist/
npm run preview   # serve the production build
```

## Trial flow

1. Select a callsign, suit color, specialist, and difficulty. Cadet lasts three shifts, Crew lasts five, and Veteran lasts seven.
2. Read the Moon briefing, review your flight check, and launch. Commander Russet gives a short tutorial after the first landing.
3. Pick three of six jobs each shift. Each job boosts one status and costs a little of another. Tap a job to walk to its room and play its minigame.
4. Complete each shift and return to Earth for your medal. Checkpoints, settings, rewards, and tutorial progress are saved locally.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Click or tap | Walk to a station or destination |
| E | Use a nearby assignment |
| M | Open the station map |
| T | Open today's assignment list |
| H | Open controls and help |
| O | Open in-game settings |
| Esc | Close a task or panel |

## Space weather and EVA

The game rolls the past week’s NASA DONKI reports from newest to oldest, with a 15% chance per report on Cadet, 30% on Crew, and 50% on Veteran. When reports are unavailable, the game uses seeded Space Apps practice alerts. Follow the red route to the broken equipment and play a repair card. Use the Power Wrench on the Reactor Dome power box (FLR), the Shield Patch at the Landing Pad airlock (CME), or the Sensor Fixer on the Researcher Room sensors (SEP). Commander Russet explains each event on the first interaction with its broken part. A wrong pick during the guided repair lets you try again. In later shifts, a wrong pick or empty status bar rewinds to the last checkpoint.

By default, the game fetches reports from NASA CCMC’s public DONKI API. Set `VITE_NASA_API_KEY` in a local `.env` file to use the keyed `api.nasa.gov` endpoint. Vite includes this value in the browser bundle.

EVA means **Extravehicular Activity**, commonly called a spacewalk. In this game, EVA refers to existing suited outdoor assignments such as collecting geology samples and inspecting the exterior power cable.

## Source layout

- `src/model.ts` — mission types, station layout, assignments, exam questions, and local saves.
- `src/game.ts` — Phaser station scene, crew rendering, movement, navigation, and task prompts.
- `src/minigames.ts` and `src/hud/assignmentGames.ts` — assignment minigames.
- `src/main.ts` — app entry point and input wiring. Screens, HUD, and simulation live in their corresponding directories.
- `src/styles/` — interface and responsive layout.
- `Project Overview/` — original Spudnaut story and NASA hackathon concept.
- `Assets/` and `public/assets/` — project artwork.
