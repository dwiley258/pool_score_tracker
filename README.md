# Pool Score Tracker

A small, dependency-free web app for tracking pool (billiards) matches between a fixed team of players. All data is stored in the browser via `localStorage` — no backend required.

## Features

- Add and manage players
- Record two-player games with scores
- View game history, filterable by player
- Leaderboard with wins and games played
- Persistent storage in the browser (survives reloads and syncs across tabs)

## Project layout

```
.
├── index.html          # App entry point
├── app.js              # Application logic (ES modules)
├── styles.css          # Styles
├── tests/              # Vitest unit and property-based tests
├── test-fixtures/      # Standalone HTML test harnesses (not served)
├── vitest.config.js
└── package.json
```

## Running locally

The app uses ES modules (`type="module"`), so it must be served over HTTP — opening `index.html` directly via `file://` will not work because of browser CORS restrictions on modules.

### Option 1 — npm script (recommended)

```bash
npm install        # once
npm run dev
```

This starts `http-server` on port 8080 and opens the browser to `http://localhost:8080/`.

### Option 2 — Python

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080/`.

### Option 3 — any other static server

Any tool that serves the repo root over HTTP works (`npx serve`, `caddy file-server`, etc.).

## Running tests

The project uses [Vitest](https://vitest.dev/) with `jsdom` and [fast-check](https://fast-check.dev/) for property-based tests.

```bash
npm install
npm test             # single run
npm run test:watch   # watch mode
```

Tests are auto-discovered from `tests/**/*.test.js`.

### Browser-based property tests (no install)

Some property-based tests also ship as standalone HTML harnesses under `test-fixtures/` that can be opened directly in a browser after starting a local server:

- `test-fixtures/storage.test.standalone.html` — storage round-trip, no external dependencies
- `test-fixtures/storage.test.html` — uses `fast-check` from a CDN

## Data model

All state is stored in `localStorage` under the key `poolScoreTracker`:

```json
{
  "players": [
    {
      "id": "uuid-v4",
      "name": "Player Name",
      "gamesPlayed": 0,
      "wins": 0,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "games": [
    {
      "id": "uuid-v4",
      "player1Id": "uuid-v4",
      "player2Id": "uuid-v4",
      "player1Score": 10,
      "player2Score": 8,
      "winnerId": "uuid-v4",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "version": "1.0"
}
```

## Initialization

On `DOMContentLoaded`, `PoolScoreTrackerApp.initialize()` runs:

1. Loads players and games from `localStorage` (initializes to empty if missing or corrupted).
2. Wires up the four UI components: player management, game recording, game history, leaderboard.
3. Registers a `storage` event listener so changes in one tab propagate to others.

All data-modifying operations (`addPlayer`, `removePlayer`, `recordGame`, `deleteGame`, `recalculateAllStats`) persist automatically — there is no manual save step.

### Debug helpers exposed on `window`

```js
PoolScoreTrackerApp.initialize()     // re-run initialization
PoolScoreTrackerApp.reloadData()     // reload from storage and refresh UI
PoolScoreTrackerApp.refreshAllUI()   // refresh UI from current in-memory state
PoolScoreTrackerApp.clearAllData()   // wipe all data (with confirmation)
```

## Hosting on GitHub Pages

The repo deploys as a static site. After pushing to GitHub:

1. Go to **Settings → Pages**.
2. Set **Source** to **GitHub Actions** (or to `main` / root branch for the simplest setup).
3. The workflow in `.github/workflows/deploy.yml` runs tests and publishes only `index.html`, `app.js`, and `styles.css` — test fixtures are not exposed.

## License

MIT — see [LICENSE](./LICENSE).
