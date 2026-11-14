# Nexa Unified CLI Reference

`scripts/nexa.sh` manages the dev, staging and production environments on the
VPS. It resolves the repo root from its own location (symlinks included), so
symlink it onto `$PATH` (e.g. `ln -s /opt/nexa-chess/NexaGen-dev/scripts/nexa.sh ~/bin/nexa`)
and run `nexa` from anywhere.

Dev and stage run in the tmux session `nexa-dev` — web on **3010**, API on
**3011** — and log to `{api,web}-dev.log` / `{api,web}-prod.log` in the repo root.
Prod is the Docker Compose stack.

```bash
nexa status                              # tmux session + HTTP health of dev (3010/3011) and prod (3000/3001)
nexa start   <dev|stage|prod> [api|web]  # component target: dev/stage only
nexa stop    <dev|stage|prod> [api|web]
nexa restart <dev|stage|prod> [api|web]
nexa logs    [api|web]                   # dev logs
nexa attach                              # attach to the nexa-dev tmux session
```

- **dev** — `npm run dev:api` + `npm run dev -w apps/web` in watch mode.
- **stage** — production builds (`build:prod` / `next build`) run with
  `NODE_ENV=production` in tmux; tests a production build without Docker.
- **prod** — `docker compose up -d --build` / `down`. On the production box use
  the deploy workflow instead (CLAUDE.md §6); never run this from an agent
  ([.agents/SAFETY.md](../.agents/SAFETY.md)).

`stop` only kills the tmux session or window it started; anything else on
3010/3011 is reported, never killed.
