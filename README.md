# Civilization V Replay Viewer

Play back a Civilization V game in your browser: the map, territory, borders, cities, events and per-civ stats, turn by turn.

**Live site:** https://prxsto.github.io/civ5replay — drag a `.Civ5Replay` file onto the page, or [try an example](https://prxsto.github.io/civ5replay/?file=replays/wu-zetian-2006-ad.Civ5Replay).

Replays are saved in `Documents/My Games/Sid Meier's Civilization 5/Replays/`. Everything runs client-side; files are never uploaded.

Supports replays from Brave New World (mid-2013) through the final patch (1.0.3.279), including Vox Populi / Community Patch games.

## Features

- Hex map with toggleable layers: terrain, features, hills & mountains, natural wonders, territory, borders, cities & names, burning cities, hex grid
- Pan (drag), zoom (wheel / double-click / buttons), hover a tile for terrain, owner and city
- Follow mode: the camera smoothly zooms and pans to frame each turn's events, and the places where things happen pulse
- Burning cities: flames in the razing civ's colour on a city and its neighbouring tiles while it is razed
- In-game year for every turn (from the game-speed calendar in `CIV5GameSpeeds.xml`), with a speed override
- Event feed that keeps the current turn centered (future turns dimmed), filterable by category (wars, peace, wonders, golden ages, religion, science, culture, captures, razings…) and civilization; click an event to jump to it and highlight it on the map
- Color-coded messages: civ names in their civ colors (city-states grey), key phrases tinted by category (war, peace, captures, razing, golden ages, wonders, science, culture, religion, victories)
- Stats tab: any of the ~27 per-civ datasets in the replay (score, techs, military, gold…) charted over time with turn/year axes, a ranking at the current or hovered turn, and a full-screen view
- Timeline with an event-density strip, playback at five speeds, linkable `?file=…&turn=…` URLs

## Development

Vite + React 19 + TypeScript. Node 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parser tests against every replay in public/replays/
npm run build      # type-check + production build into dist/
```

To test against replays you don't want to commit:

```bash
REPLAY_DIR=~/path/to/replays npm test
```

### Project layout

| Path | What |
|---|---|
| `src/parser/` | `.Civ5Replay` binary parser (`parseReplay.ts` documents the file layout) and its tests |
| `src/model/timeline.ts` | Replays events into per-turn ownership + city snapshots |
| `src/model/civColors.ts` | In-game civ colors (city-states grey, generated colors for modded civs) |
| `src/model/calendar.ts` | Turn → year per game speed |
| `src/model/eventStyle.ts` | Event categories and message color-coding |
| `src/map/` | Hex geometry and canvas rendering (static base layer + per-turn overlay) |
| `src/components/` | React UI: map, timeline, event log, stats, layer panel |
| `public/tiles/` | Terrain textures |
| `public/replays/` | Example replays, loadable with `?file=replays/<name>` |

### Deployment

`.github/workflows/deploy.yml` tests, builds and deploys to GitHub Pages on every push to `main`. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Keyboard shortcuts

Key | Action
--- | ---
`space` | Play / pause
`1` – `5` | Playback speed
`←` `→` | Back / forward one turn
`↑` `↓` | Back / forward ten turns
`Home` `PgUp` / `End` `PgDn` | First / last turn
`+` `-` `0` | Zoom in / out / fit
`T` `F` `E` `W` `R` `B` `C` `X` `G` | Toggle terrain, features, elevation, wonders, territory, borders, cities & names, burning cities, grid
`Esc` | Clear highlighted event

## Query parameters

- `file` — path within the site (e.g. `replays/foo.Civ5Replay`) or a full URL to a CORS-enabled host
- `turn` — turn to open at; kept in sync as you scrub

## TODO

- Tile artwork for marsh, oasis, flood plains and natural wonders (currently simple procedural marks)
- Decode the remaining unknown header block (game options) and civ fields (likely player color / slot type)
- Religion spread / war-and-peace layers from event text

## Background

I do a fair amount of work with mapping, and I've always enjoyed diving into binary files. I was frustrated with the in-game replay viewer in Civ V - it crashes very commonly at the end of a game, it doesn't display the log messages alongside the map, the map itself leaves a bit to be desired, you can't load a replay unless all the mods it used are currently installed, and sharing replays is just impractical enough to not be done.

I wanted something *simple* that would make it easy to share replays with the community with nothing but a URL, so I set about reverse engineering the format and building an entirely client-side replay site that would stand the test of time.

## Process

I used [jDataView](https://github.com/jDataView/jDataView) to abstract the process of grabbing bits into a series of simple function calls. From there, I built a simple (mostly-)general-purpose binary file parser that accepts a configuration object describing the file structure and produces an output data object.

I used [Synalyze It](https://www.synalysis.net/) for OS X as my hex editor - it has a nice tagging scheme, a quick-view grid of human readable values for selected bytes, and good support for searching, jumping to various locations, and resizing the window to snap bytes into alignment. Not trying to shill for them, but I tried a dozen other products over the years before I found one with that combination of features, so credit where credit is due for producing a hex editor that doesn't have any major shortcomings.

The original JS parser config lives in the [upstream repo](https://github.com/aiwebb/civ5replay); this fork ports it to TypeScript in `src/parser/parseReplay.ts`.

## Special thanks
A huge part of reverse engineering binary files is getting the first questions answered - how are integers encoded? Strings? Arrays? Several others had done varying degrees of work on the format before me, and while the file structure has changed so much since their efforts that I wasn't able to reuse much at all, their work was very important for that initial momentum:

- Kristoffer Berdal - [flexd/replay_parser](https://github.com/flexd/replay_parser)
- Danny Fisher - [CivFanatics thread](http://forums.civfanatics.com/showthread.php?t=388160)

Additional thanks to [civilopedia.info](http://www.civilopedia.info/), which provided the design inspiration that turned this from [something bland](https://i.imgur.com/efkyaiI.png) into what you see now.

Finally, huge thanks to Firaxis for making a game [I can't stop playing](http://i.imgur.com/Xk3jrll.png).
