# NexaGen Deployment Guide — Oracle Cloud (12 GB RAM, Ubuntu)

This guide covers how to deploy the full NexaGen stack (Web, API, Postgres, Redis, and LiveKit) to your Oracle Ubuntu server using Docker.

## Step 1: Server & Firewall Prep

Since your server already has Docker installed, you just need to open the required firewall ports for LiveKit and web traffic.

Run these commands on your Oracle Ubuntu server:

```bash
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
(3001), LiveKit signalling (7880), Postgres and Redis to `127.0.0.1`; only nginx
(80/443) and the LiveKit media/TURN ports above are public. Mirror exactly that
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

   **Paste the following configuration (replace `yourdomain.com` with your actual domains):**
   ```nginx
   # 1. Web & API Domain (e.g., app.yourdomain.com)
   server {
       server_name app.yourdomain.com;

       # Next.js frontend
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

       # NestJS API
       location /api {
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

   # 2. LiveKit Domain (e.g., livekit.yourdomain.com)
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
   sudo certbot --nginx -d app.yourdomain.com -d livekit.yourdomain.com
   
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

## Step 5: Ongoing Updates

Whenever you make changes to your code and want to deploy them to production:

```bash
cd /opt/nexa-chess
git pull origin main
docker compose up -d --build
```
Docker is smart enough to only rebuild the containers that had code changes (like `web` or `api`), leaving the others (`postgres`, `livekit`, `redis`) running untouched!
