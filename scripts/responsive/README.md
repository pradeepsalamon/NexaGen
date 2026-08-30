# Responsive screenshot tool

Drives a real headless Chromium across a matrix of **device sizes × routes ×
theme**, saves PNGs, flags any horizontal overflow, and writes an HTML gallery.
Use it to eyeball how any page looks on phone / tablet / laptop / desktop without
clicking through DevTools by hand.

It is **not** a Playwright test (not run by `npx playwright test` / CI) — it's a
manual dev tool.

## Setup (once)

```bash
npx playwright install chromium
```

## Run

The app must be running. For public pages `web` is enough; for authed routes and
`--live-class` you also need `api` (+ postgres/redis, and livekit for a real
meeting).

```bash
npm run dev            # or the prod servers on :3000 / :3001
```

Then (routes work with or without a leading `/`):

```bash
# public page, every device, light theme
npm run shots -- --path login --devices all

# a few admin pages on phones + tablets, logged in
npm run shots -- --paths admin,admin/batches,admin/users --login admin --devices mobile,tablet

# one page, light + dark
npm run shots -- --path student --login student --theme both

# the live-class meeting UI (logs in, clicks "Join")
npm run shots -- --live-class <roomId> --login student --devices mobile,mobile-landscape,tablet

# full-page (not just the viewport)
npm run shots -- --path coach/history --login coach --devices laptop-15 --full-page
```

> **Git Bash / MSYS:** a leading-slash route (`/login`) gets rewritten to a
> Windows path by the shell. Pass routes **without** the leading slash, or use
> `--url http://localhost:3000/login`, or prefix `MSYS_NO_PATHCONV=1`.

Output lands in `scripts/responsive/shots/<timestamp>/` (git-ignored):
`*.png`, `results.json`, and `index.html` (open it in a browser — overflow shots
are outlined amber). The command exits non-zero if any shot had horizontal
overflow or errored.

## Options

| flag | meaning |
| --- | --- |
| `--base <url>` | base URL (default `http://localhost:3000`) |
| `--devices <list>` | `quick` (default) · `all` · category · device · comma mix |
| `--path <route>` | route to capture (repeatable) |
| `--paths <a,b,c>` | comma-separated routes |
| `--url <url>` | absolute URL (repeatable; ignores `--base`) |
| `--login <role>` | `coach` · `student` · `admin` (seeded accounts) |
| `--live-class <id>` | capture `/live-class/<id>`, logging in and clicking Join |
| `--theme <mode>` | `light` (default) · `dark` · `both` |
| `--full-page` | capture the whole scroll height, not just the viewport |
| `--dpr <n>` | force devicePixelRatio for every device (`1` = smaller PNGs) |
| `--wait <ms>` | settle time per page (default 2000) |
| `--out <dir>` | output dir (default `scripts/responsive/shots/<timestamp>`) |

### Device categories

`mobile`, `mobile-landscape`, `tablet`, `tablet-landscape`, `laptop`, `desktop`.
`quick` = one representative per band + the edge phones. `all` = every preset.

Individual device keys and their sizes live in
[`devices.mjs`](./devices.mjs) — add or tweak entries there.

## Notes

- Seeded logins use password `Test@12345` (`coach@nexa.test`, `student@nexa.test`,
  `superadmin@nexa.test`). Run `npm run db:seed` if they're missing.
- Theme is set via the `nexa-chess-theme` localStorage key the app reads on boot.
- The browser launches with fake camera/mic so `--live-class` can pass pre-join.
