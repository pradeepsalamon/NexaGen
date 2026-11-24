# Service status screens

What a person sees when part of the platform can't serve them, and which piece
shows it. Each failure is handled by the outermost layer that is still working.

| Situation | Who answers | What they see |
|---|---|---|
| Web container restarting during a deploy | nginx (502) + `deploying.json` | "Updating to a new version". Checks every 4 s and reloads by itself |
| Web container crashed / restart loop / not started | nginx (502) | "We'll be right back". Checks every 6 s, backing off to 30 s, and reloads by itself |
| App took longer than nginx's 60 s timeout | nginx (504) | "This is taking longer than usual". Same retry loop |
| Planned maintenance | nginx (503) via `maintenance.json` | "Scheduled maintenance", with an optional message and "expected back by" time |
| API down / maintenance (calls from the browser) | nginx on the API host | `503 {"message","code":"SERVICE_UNAVAILABLE"}` with CORS, so `lib/api.ts` shows the message instead of a bare network error |
| A page throws while rendering | the closest `error.tsx` | "Something went wrong" with Try again / Back to dashboard. Role areas keep their nav. The error is sent to Sentry with its digest shown as a reference |
| The root layout itself throws | `app/global-error.tsx` | The same screen, full page, in the saved theme |
| A live class or demo room throws | `live-class/[roomId]/error.tsx`, `demo/[classId]/error.tsx` | "The classroom hit a problem" with **Rejoin class** (full reload) / Leave |
| Old tab after a deploy (JS/CSS chunk gone) | `error.tsx` (render) or `ConnectionStatus` (lazy import in a handler) | "A new version is available". Reloads once automatically (guarded to once a minute), then shows a Reload button. Not sent to Sentry |
| The device goes offline | `ConnectionStatus` pill | "You're offline…", then "Back online" for 3 s. The global "Connection Error" toast is skipped while offline |
| Rate limited (429) | `lib/api.ts` | Existing toast (unchanged) |
| The whole box / nginx is down | nothing on our side | The browser's own error page. See "Not built yet" |

## In the app (`apps/web`)

- `components/common/ErrorScreen.tsx`: the only error screen. Variants: `section`
  (inside a role layout), `page` (root `error.tsx`), `fullscreen`
  (`global-error.tsx`), `classroom`. Every `error.tsx` is a one-line wrapper.
  A new area with its own layout that should keep its chrome on a crash gets its
  own `error.tsx` using it.
- `lib/chunkErrors.ts`: `isChunkLoadError` + `reloadForNewVersion` (session-storage
  guard, so a reload that doesn't help never loops; no reload when storage is blocked).
- `components/layout/ConnectionStatus.tsx`: mounted once in `AppProviders` on every
  route. It sits at the bottom centre, or at the top in `/live-class` and `/demo`, where the room's controls take the bottom edge.

## At the edge (nginx)

Files in the repo: `deploy/status-pages/` (the page and the API JSON) and
`deploy/nginx/` (snippets). On the box they live in:

```
/etc/nginx/snippets/nexa-status-{maps,web,api}.conf, nexa-maintenance-gate.conf
/var/www/nexa-status/<prod|stage>/page.html, api-unavailable.json      # copies
/var/www/nexa-status/<prod|stage>/maintenance.json, deploying.json     # state, when present
```

- One self-contained HTML page (inline CSS/JS/SVG, Design System v2 colours,
  light/dark from the saved app theme). Same layout as the app's 404
  (`app/not-found.tsx`): brand line, the error code in large type (a spinning
  icon while deploying), a gold bar, the message. The brand line says Nexa Chess
  on Nexa's hosts, the academy's name cached in `localStorage` `nexa-brand` on its
  own address, and is hidden otherwise. It reads `/__status/maintenance.json` and
  `/__status/deploying.json` to pick its wording, then sends `HEAD` to the
  original URL until the app answers below 500 and goes back to that URL.
  A deploy marker older than 20 minutes is ignored (left by a killed deploy).
- **Preview** any state while the app is up: `https://<host>/__status/page.html?mode=deploying`
  (`down`, `slow`, `maintenance`, `deploying`). Preview never polls.
- `error_page` only covers errors nginx itself generates. An error the app returns
  (e.g. `/health/ready` 503) passes through unchanged.

### Wiring a server block

```nginx
# top of the site file, once (http context)
include /etc/nginx/snippets/nexa-status-maps.conf;

server {                       # web
    server_name nexachess.in www.nexachess.in;
    set $nexa_status_env prod;           # stage for dev.nexachess.in
    include /etc/nginx/snippets/nexa-status-web.conf;
    location / {
        include /etc/nginx/snippets/nexa-maintenance-gate.conf;
        proxy_pass http://nextjs_upstream;
        ...
    }
}
server {                       # API
    server_name api.nexachess.in;
    set $nexa_status_env prod;
    include /etc/nginx/snippets/nexa-status-api.conf;
    location / {
        include /etc/nginx/snippets/nexa-maintenance-gate.conf;
        proxy_pass http://nestjs_api_upstream;
        ...
    }
}
```

An academy server block (`DEPLOYMENT.md` Step 4c) takes the web snippet plus the
gate, and the gate inside its `location /api/` too. Add a new web origin that calls
the API cross-origin to the map in `nexa-status-maps.conf`, alongside the API's `CORS_ORIGIN`.

First install: copy the four snippets to `/etc/nginx/snippets/`, run
`scripts/nexa.sh status-pages prod` (and `stage`), which creates the folder
with sudo once and copies the files. Then edit the site file, `sudo nginx -t`
and `sudo systemctl reload nginx`.

## Operating it

```bash
scripts/nexa.sh maintenance on prod 45 "Upgrading the database"   # minutes and message optional
scripts/nexa.sh maintenance status prod
scripts/nexa.sh maintenance off prod                              # open tabs reload by themselves
scripts/nexa.sh status-pages stage                                # refresh stage's copy of the page
```

Maintenance closes the API too, so webhooks (Razorpay, LiveKit) get 503 and
retry later. There is no bypass: test the app on staging while prod is closed.

`scripts/deploy-production.sh` copies the checked-out page into
`/var/www/nexa-status/prod/` and writes `deploying.json` just before
`docker compose up`. It removes the marker once health checks pass, and the
`EXIT` trap removes it on any failure. When the folder is missing it skips all
of this. Override the location with `NEXA_STATUS_DIR` / `NEXA_STATUS_ENV`.

## Not built yet

- **Persistent "can't reach the server" banner in the app** when the API is down
  but the web app is up (driven by `lib/api.ts` failures + `/health/live` polling),
  and a "some features unavailable" state from `/health/ready`. Today that is
  the "Connection Error" toast plus per-call error toasts.
- **Box or nginx down**: only a service worker with a cached offline page could
  show anything, and only to returning visitors.
- A maintenance bypass for staff (e.g. a cookie checked in the gate).
