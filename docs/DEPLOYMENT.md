# NexaGen Deployment Guide — Oracle Cloud (12 GB RAM, Ubuntu)

This guide covers how to deploy the full NexaGen stack (Web, API, Postgres, Redis, and LiveKit) to your Oracle Ubuntu server using Docker.

## Step 1: Server & Firewall Prep

Since your server already has Docker installed, you just need to open the required firewall ports for LiveKit and web traffic.

Run these commands on your Oracle Ubuntu server:

```bash
# SSH first, or `ufw enable` locks you out (use your port if sshd isn't on 22)
sudo ufw allow 22/tcp

# Web traffic
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# LiveKit WebRTC Ports (CRITICAL)
sudo ufw allow 7881/tcp  # LiveKit TCP fallback
sudo ufw allow 7882/udp  # LiveKit media (single muxed UDP port)
sudo ufw allow 3478/udp  # TURN/UDP (when LIVEKIT_TURN_ENABLED=true)
sudo ufw allow 5349/tcp  # TURN/TLS (when LIVEKIT_TURN_ENABLED=true)

# Enable firewall (if not already enabled)
sudo ufw enable
```

**Docker bypasses ufw.** A port published as `"3001:3001"` is reachable from the
internet whatever ufw says. `docker-compose.yml` therefore binds web (3000), api
(3001), LiveKit signalling (7880), Postgres and Redis to `127.0.0.1`; only SSH,
nginx (80/443) and the LiveKit media/TURN ports above are public. Mirror exactly that
list in the OCI VCN security list (ingress rules), and remove the old
`50000-60000/udp` and `7880/tcp` rules.

## Step 2: Configure Environment Variables

1. Clone your repository to your server if you haven't already:
   ```bash
   git clone <your-repo-url> /opt/nexa-chess
   cd /opt/nexa-chess
   ```

2. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Open the `.env` file (`nano .env`) and fill in your actual production values (database passwords, JWT secrets, Cloudinary keys, SMTP, etc.). 
   
   **Important LiveKit Note:** `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` from `.env` are the LiveKit credentials. The livekit-server config (including the `webhook` block that drives coach/board attendance) is passed inline as `LIVEKIT_CONFIG` in `docker-compose.yml` — Compose interpolates `${LIVEKIT_API_KEY}` into it, so there is no separate `livekit.yaml` to keep in sync.

## Step 3: Start the Docker Stack

From the root of your project (where `docker-compose.yml` is located), run:

```bash
docker compose up -d --build
```

This single command will:
1. Build the Next.js frontend (`web`)
2. Build the NestJS backend (`api`)
3. Download and start `postgres`, `redis`, `livekit`, and `egress`
4. Spin everything up in an isolated Docker network.

To verify everything is running, use:
```bash
docker compose ps
```

**Class recording (`egress`):** the `egress` container is what LiveKit uses to
record rooms. Nothing `depends_on` it, so `docker compose up -d web api` (what CI
runs on every deploy) will **not** create or update it — only a full
`docker compose up -d` or an explicit `docker compose up -d egress` does.
`scripts/deploy-production.sh` appends `egress` to its `up` list for this reason.
If recordings fail to start ("Failed to start LiveKit recording" / API 500),
check `docker compose ps` for `nexa_egress` and `docker logs nexa_egress`.

## Step 4: Nginx Reverse Proxy & SSL (Required for WebRTC)

Browsers strictly require a secure `https://` connection to access a user's camera and microphone. You must configure Nginx to proxy traffic and provide SSL certificates.

1. **Install Nginx & Certbot**:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx -y
   ```

2. **Create the Nginx Configuration**:
   Create a new file at `/etc/nginx/sites-available/nexa-chess`:
   ```bash
   sudo nano /etc/nginx/sites-available/nexa-chess
   ```

   **Paste the following configuration (replace `yourdomain.com` with your actual domains).**
   The hosts must match `.env`: web = `FRONTEND_URL` / `CORS_ORIGIN`, API =
   `NEXT_PUBLIC_API_URL`. API routes are rooted at `/` (e.g. `/auth/login`), so the
   API gets its own host rather than a path prefix.

   ```nginx
   # 1. Web Domain (FRONTEND_URL, e.g. yourdomain.com)
   server {
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           # Required: the API trusts exactly one proxy hop (TRUST_PROXY_HOPS=1)
           # for the client IP. Without this every user shares one rate-limit
           # bucket, and a client-sent X-Forwarded-For would be believed.
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }

   # 2. API Domain (NEXT_PUBLIC_API_URL, e.g. api.yourdomain.com)
   server {
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           # Required: the API trusts exactly one proxy hop (TRUST_PROXY_HOPS=1)
           # for the client IP. Without this every user shares one rate-limit
           # bucket, and a client-sent X-Forwarded-For would be believed.
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }

   # 3. LiveKit Domain (e.g., livekit.yourdomain.com)
   server {
       server_name livekit.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:7880;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_read_timeout 86400; # Keep WebSockets alive
       }
   }
   ```

3. **Enable the Site & Get SSL Certificates**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/nexa-chess /etc/nginx/sites-enabled/
   
   # Run certbot to automatically provision free Let's Encrypt SSL certs
   sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com -d livekit.yourdomain.com
   
   # Restart Nginx to apply changes
   sudo systemctl restart nginx
   ```

## Step 4b: TURN for restricted networks

Students on school or office networks often can't reach UDP or port 7881. LiveKit's
embedded TURN relays media over TLS for them.

1. Add a DNS A record, e.g. `turn.yourdomain.com`, pointing at the server (not
   proxied by Cloudflare).
2. Issue a certificate: `sudo certbot certonly --nginx -d turn.yourdomain.com`.
   The `livekit` container mounts `/etc/letsencrypt` read-only; restart it after
   each renewal (`docker compose restart livekit`), e.g. from a certbot deploy hook.
3. In `.env`: `LIVEKIT_TURN_ENABLED=true`, `LIVEKIT_TURN_DOMAIN=turn.yourdomain.com`.
4. Open 5349/tcp and 3478/udp (ufw + OCI security list), then
   `docker compose up -d livekit`.

TURN/TLS on 5349 gets past most firewalls. Networks that allow *only* 443 need
TURN on 443: on this box that means nginx `stream` mode with `ssl_preread`
routing `turn.` by SNI to LiveKit, or giving LiveKit its own IP / media VM, where
`LIVEKIT_TURN_TLS_PORT=443` works directly.

## CI, automated deploys and rollback

Moved out of CLAUDE.md §6 on 2026-10-31. Agents don't run any of this themselves.

- **CI runs on PRs and as the deploy gate** (`.github/workflows/ci.yml`, PRs
  into `main`/`dev`): lint and API unit tests first, then, if those pass, every
  migration applied to an empty Postgres + `prisma migrate diff --exit-code`
  against `schema.prisma`, DB integration tests on that Postgres, and the
  production build (type-checks the app).
  Only the affected app is checked, and Jest runs only the specs importing a
  changed file (`scripts/ci/jest-scope.sh`; full suite when
  packages/schema/test setup/deps/`ci.yml`/`scripts/ci/` change).
- The **`main: CI before merge` ruleset** requires a PR, those three checks, and
  an up-to-date branch. Admins can bypass it, and GitHub Free doesn't enforce
  it on a private repo, so the deploy gate below is what protects production.
- **Deploy gate**: the `pr-ci` job skips CI only when the pushed commit has the
  same tree as the merged PR's head and that head's latest CI run passed. A PR
  that was behind `main`, a direct push, a manual run or a failed lookup runs
  `ci.yml` first, and a failure stops the deploy. Updating a PR's branch before
  merging avoids the second run and its Actions minutes.
- **Push to `main` deploys**: `deploy-production.yml` detects whether
  `apps/web/**` / `apps/api/**` / `packages/**` changed → gate → SSH to the VPS →
  `scripts/deploy-production.sh <sha> <services>` → `docker compose up -d --build`
  for the affected services only. Change detection diffs against the head of
  the last successful push-triggered deploy run (falling back to the previous
  push), so a later push also redeploys what a failed deploy left out. To
  redeploy by hand: Actions → Deploy Production → **Run workflow**
  (`workflow_dispatch`, services `both`/`api`/`web`); it runs CI first.
- **Migrations first**: the script applies `prisma migrate deploy` from the
  newly built image *before* replacing the running API, so a failed migration
  aborts the deploy without downtime. `apps/api`'s `entrypoint.sh` also runs it
  on container start (idempotent; the safety net for manual starts).
- **Rollback restores images, never rebuilds.** Each service keeps
  `<image>:last-good` (live and healthy) and `<image>:previous` beside
  compose's `latest`. A failed `up` (including web's "dependency failed to
  start: container nexa_api is unhealthy") or health check restores
  `:last-good` within seconds, and a crash-looping container counts as failed
  immediately. A deploy that succeeded but misbehaves: Run workflow →
  `action: rollback` (or `scripts/deploy-production.sh --rollback [api|web]` on
  the box) → `:previous` + that commit's checkout, once per successful deploy,
  no CI, no build. Migrations are never reversed, so keep them additive. State
  (`last-good-commit`, `previous-commit`, `last-deploy-services`,
  `history.log`, the lock) lives in the gitignored `.deploy/` in the prod
  checkout.
- **Concurrency**: the workflow's `production` group runs one at a time (a
  newer pending run replaces an older pending one); on the box the script holds
  a flock on `.deploy/deploy.lock` and skips a commit that is an ancestor of
  the one live (`FORCE_DEPLOY=1` overrides). It runs from a temp copy of
  itself, since `git checkout -f` rewrites `scripts/deploy-production.sh` in
  place.
- **Security & dependency automation**: `.github/workflows/security.yml` runs
  Semgrep on PRs (fails only on findings the PR introduces) and a weekly
  report-only full scan; it is not a deploy gate. `.semgrepignore` excludes
  tests/generated files. Dependabot (`.github/dependabot.yml`) opens monthly
  grouped npm PRs, skipping versions under 7 days old; core-stack majors (Next, React, Nest, Prisma) are ignored on
  purpose. Workflow actions are pinned to a commit SHA with the version in a
  trailing comment (`uses: actions/checkout@<sha> # v4.4.0`) — a new step does
  the same; Dependabot's monthly `github-actions` run bumps both together.
  `.coderabbit.yaml` holds the CodeRabbit PR-review rules.
- **Backups**: `scripts/backup_db.sh` via cron (OCI CLI to object storage).
  Restores are CLI-only (`docs/DATABASE_RESTORE.md`); the admin UI can list,
  download and trigger backups but deliberately has no restore. Every dump
  (that script, admin "Backup now") uses `--exclude-table-data` for
  `lichess_puzzles` / `lichess_puzzles_staging` — re-loadable source data; a
  restore reloads the release named in `lichess_catalogue_releases`. A new bulk
  source-data table gets the same treatment in both places. Prod-container
  commands: `docs/PROD_DOCKER_COMMANDS.md`.
- `NEXT_PUBLIC_*` vars are build-time — they must be set before
  `docker compose build` for web.

## Step 5: Ongoing Updates (manual)

The push-to-`main` workflow above is the normal path. To update by hand:

```bash
cd /opt/nexa-chess
git pull origin main
docker compose up -d --build
```
Docker is smart enough to only rebuild the containers that had code changes (like `web` or `api`), leaving the others (`postgres`, `livekit`, `redis`) running untouched!
