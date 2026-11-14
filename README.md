# SPUDNAUT: The Great Starch Migration

A cooperative browser game about a potato crew's 30-day habitat trial on the Moon or Mars. Complete daily station assignments, keep the crew's survival metrics healthy, and send an Earth Progress Report at the end of each day.

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

1. Read the mission story and pass the eight-question Spud Exam. Failed topics lead to short remedial lessons and another attempt.
2. Select your callsign, suit color, specialist, and destination.
3. Launch, then complete station assignments during each of the 30 mission days.
4. Send an Earth Progress Report after each day's assignments. The report tracks oxygen, starch integrity, morale, and research.
5. If the crew's 30-day results fall short, complete a 15-day penalty extension before the final review.

The trial is cooperative: there are no impostors, kills, meetings, voting, ejections, or ghost mode. Certification, preferences, and mission results are saved locally.

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

Daily shifts may use NASA's DONKI space-weather reports (FLR, CME, SEP, and GST) to add a recent observation to the existing fictional Solar Flare Watch event. The game requests the previous seven days and caches the result in memory; when DONKI is unavailable or rate-limited, the deterministic event flow continues unchanged. Set `VITE_NASA_API_KEY` in a local `.env` file to use your own NASA API key. Vite variables are included in browser code, so this key is public to players; never put a private or server-only key there. Without it, the game uses NASA's public `DEMO_KEY`.

EVA means **Extravehicular Activity**, commonly called a spacewalk. In this game, EVA refers to existing suited outdoor assignments such as collecting geology samples and inspecting the exterior power cable.

## Source layout

- `src/model.ts` — mission types, station layout, assignments, exam questions, and local saves.
- `src/game.ts` — Phaser station scene, crew rendering, movement, navigation, and task prompts.
- `src/minigames.ts` — assignment minigames.
- `src/main.ts` — menus, story and exam flow, mission-day progression, HUD, and Earth reports.
- `src/style.css` — interface and responsive layout.
- `Project Overview/` — original Spudnaut story and NASA hackathon concept.
- `Assets/` and `public/assets/` — project artwork.
