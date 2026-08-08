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
sudo ufw allow 7880/tcp  # LiveKit HTTP/WebSocket
sudo ufw allow 7881/tcp  # LiveKit TCP fallback
sudo ufw allow 50000:60000/udp # WebRTC UDP ports

# Enable firewall (if not already enabled)
sudo ufw enable
```

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
   
   **Important LiveKit Note:** Make sure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` match whatever you define inside `livekit.yaml`.

## Step 3: Start the Docker Stack

From the root of your project (where `docker-compose.yml` is located), run:

```bash
docker compose up -d --build
```

This single command will:
1. Build the Next.js frontend (`web`)
2. Build the NestJS backend (`api`)
3. Download and start `postgres`, `redis`, and `livekit`
4. Spin everything up in an isolated Docker network.

To verify everything is running, use:
```bash
docker compose ps
```

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
       }

       # NestJS API
       location /api {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
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

## Step 5: Ongoing Updates

Whenever you make changes to your code and want to deploy them to production:

```bash
cd /opt/nexa-chess
git pull origin main
docker compose up -d --build
```
Docker is smart enough to only rebuild the containers that had code changes (like `web` or `api`), leaving the others (`postgres`, `livekit`, `redis`) running untouched!
