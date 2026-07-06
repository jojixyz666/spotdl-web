# Installation Guide

This guide covers the full installation and deployment of SpotDL Web on a fresh Ubuntu 24.04 server.

## Prerequisites

- Ubuntu 24.04 LTS (or compatible Linux distribution)
- Root or sudo access
- A domain name (optional, for HTTPS)

## 1. System Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mysql-server redis-server ffmpeg git curl
```

### Install Python 3.12

```bash
sudo apt install -y python3.12 python3.12-venv python3-pip
```

### Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install Deno (for YouTube PO token)

```bash
curl -fsSL https://deno.land/install.sh | sh
# Add to PATH in ~/.bashrc:
# export DENO_INSTALL="/root/.deno"
# export PATH="$DENO_INSTALL/bin:$PATH"
```

## 2. Clone Repository

```bash
cd /opt
git clone https://github.com/jojixyz666/spotdl-web.git
cd spotdl-web
```

## 3. Python Virtual Environment

```bash
python3.12 -m venv venv
source venv/bin/activate

pip install flask flask-login flask-limiter flask-session bcrypt \
  mysql-connector-python redis requests gunicorn rq
```

## 4. Frontend Build

```bash
cd frontend
npm install
npm run build
cd ..
```

The build output goes to `static/react/`.

## 5. MySQL Setup

```bash
sudo mysql -e "
CREATE DATABASE spotdl_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spotdl_user'@'localhost' IDENTIFIED BY 'SpotDL@Pass123';
GRANT ALL PRIVILEGES ON spotdl_db.* TO 'spotdl_user'@'localhost';
FLUSH PRIVILEGES;
"
```

### Increase Max Connections

Edit `/etc/mysql/mysql.conf.d/mysqld.cnf`:

```ini
[mysqld]
max_connections = 500
```

```bash
sudo systemctl restart mysql
```

## 6. Redis Configuration

Redis works out of the box with default settings. Ensure it is running:

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

## 7. Environment Configuration

Create `/opt/spotdl-web/.env`:

```env
SECRET_KEY=your-random-secret-key-here
DB_HOST=localhost
DB_USER=spotdl_user
DB_PASSWORD=SpotDL@Pass123
DB_NAME=spotdl_db
REDIS_URL=redis://localhost:6379/0
ADMIN_USER=admin
ADMIN_PASS=change-this-password
HTTPS_ENABLED=1
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Generate a random secret key:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## 8. YouTube Cookies (Optional)

To enable YouTube downloads (if your VPS IP is blocked):

1. Export cookies from your browser using a cookies.txt extension
2. Place the file at `/opt/spotdl-web/cookies.txt`

```bash
chmod 600 /opt/spotdl-web/cookies.txt
```

**Important**: The `cookies.txt` file is gitignored. Never commit it to version control.

## 9. PO Token Server (Optional)

For YouTube bot detection bypass:

```bash
# Install bgutil-ytdlp-pot-provider
pip install bgutil-ytdlp-pot-provider

# The deno binary should be at /usr/local/bin/deno
# The PO token server runs on port 4416
```

## 10. Gunicorn Configuration

Create `/opt/spotdl-web/gunicorn.conf.py`:

```python
bind = "127.0.0.1:5000"
workers = 4
threads = 4
worker_class = "gthread"
timeout = 300
accesslog = "/var/log/spotdl/gunicorn_access.log"
errorlog = "/var/log/spotdl/gunicorn_error.log"
```

```bash
sudo mkdir -p /var/log/spotdl
```

## 11. Worker Configuration

Create `/etc/systemd/system/spotdl-worker.service`:

```ini
[Unit]
Description=SpotDL Download Worker Pool
After=network.target redis-server.service mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/spotdl-web
ExecStart=/opt/spotdl-web/venv/bin/python3 /opt/spotdl-web/scripts/start_workers.py
Restart=always
RestartSec=5
Environment=PATH=/opt/spotdl-web/venv/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable spotdl-worker
sudo systemctl start spotdl-worker
```

## 12. Web Application Service

Create `/etc/systemd/system/spotdl-web.service`:

```ini
[Unit]
Description=SpotDL Web Application
After=network.target redis-server.service mysql.service

[Service]
Type=notify
User=root
WorkingDirectory=/opt/spotdl-web
ExecStart=/opt/spotdl-web/venv/bin/gunicorn -c gunicorn.conf.py main:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable spotdl-web
sudo systemctl start spotdl-web
```

## 13. Nginx Configuration

Create `/etc/nginx/sites-available/spotdl`:

```nginx
upstream flask {
    server 127.0.0.1:5000;
    keepalive 32;
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 5M;

    location /api/ {
        proxy_pass http://flask;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 5s;
    }

    location /api/events {
        proxy_pass http://flask;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    root /opt/spotdl-web/static/react;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/spotdl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 14. SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d your-domain.com --non-interactive --agree-tos -m your@email.com
```

Certbot automatically sets up auto-renewal via systemd timer. Verify:

```bash
sudo systemctl list-timers | grep certbot
```

## 15. Dynamic DNS (Optional)

If you are using a dynamic IP with DuckDNS:

```bash
# Add cron job to update IP every 5 minutes
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=YOUR_DOMAIN&token=YOUR_TOKEN&ip=' > /dev/null 2>&1") | crontab -
```

## 16. Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 17. Verify Installation

```bash
# Check all services
sudo systemctl status spotdl-web
sudo systemctl status spotdl-worker
sudo systemctl status nginx
sudo systemctl status mysql
sudo systemctl status redis-server

# Test HTTPS
curl -I https://your-domain.com

# Check logs
sudo journalctl -u spotdl-web -f
sudo journalctl -u spotdl-worker -f
```

## Service Management

```bash
# Restart all services
sudo systemctl restart spotdl-web spotdl-worker nginx

# View logs
sudo journalctl -u spotdl-web --since "1 hour ago"
sudo journalctl -u spotdl-worker --since "1 hour ago"

# Check worker processes
ps aux | grep rq
```

## Updating

```bash
cd /opt/spotdl-web
source venv/bin/activate
git pull
cd frontend && npm run build && cd ..
sudo systemctl restart spotdl-web spotdl-worker
```

## Troubleshooting

### Workers not picking up jobs

```bash
sudo systemctl restart spotdl-worker
```

### MySQL connection errors

```bash
sudo mysql -e "SHOW VARIABLES LIKE 'max_connections';"
# If needed, increase in /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql
```

### YouTube downloads failing

1. Check if `cookies.txt` exists and is valid
2. Check if PO token server is running: `curl http://127.0.0.1:4416`
3. Check yt-dlp version: `yt-dlp --version`

### SSL certificate renewal

```bash
sudo certbot renew --dry-run
```
