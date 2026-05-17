# MikroTik NOC Dashboard — VPS Hosting Guide

## Overview

This guide covers deploying the MikroTik NOC Bandwidth Monitor on a VPS using Node.js, PostgreSQL, and a reverse proxy (Nginx). Tested on Ubuntu 22.04 LTS.

---

## Requirements

| Component | Minimum |
|-----------|---------|
| CPU | 1 vCPU |
| RAM | 512 MB |
| Disk | 10 GB SSD |
| OS | Ubuntu 22.04 / Debian 12 |
| Node.js | 20+ (LTS) |
| PostgreSQL | 14+ |

---

## Step 1: Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Install Node.js 20 via NVM (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version  # should print v20.x.x

# Install pnpm
npm install -g pnpm

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## Step 2: Database Setup

```bash
# Create database and user
sudo -u postgres psql <<EOF
CREATE USER noc_user WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE noc_db OWNER noc_user;
GRANT ALL PRIVILEGES ON DATABASE noc_db TO noc_user;
EOF
```

---

## Step 3: Clone & Build the Application

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /opt/noc-dashboard
cd /opt/noc-dashboard

# Install all dependencies
pnpm install

# Build the API server
pnpm --filter @workspace/api-server run build

# Build the frontend (static files)
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
```

---

## Step 4: Environment Variables

Create `/opt/noc-dashboard/.env.production`:

```bash
# Database
DATABASE_URL=postgresql://noc_user:your_strong_password_here@localhost:5432/noc_db

# Session secret — generate a strong random string:
# Run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=replace_with_your_64_char_random_string

# Node environment
NODE_ENV=production

# API server port (internal, Nginx will proxy)
PORT=8080
```

```bash
# Secure the file
chmod 600 /opt/noc-dashboard/.env.production
```

---

## Step 5: Push Database Schema

```bash
cd /opt/noc-dashboard
export $(cat .env.production | xargs)
pnpm --filter @workspace/db run push
```

---

## Step 6: Seed the Default Admin User

```bash
cd /opt/noc-dashboard
node -e "
import('@workspace/db').then(async ({ db, usersTable }) => {
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.default.hash('change_me_immediately', 10);
  await db.insert(usersTable).values({ username: 'admin', passwordHash: hash });
  console.log('Admin user created');
  process.exit(0);
}).catch(console.error);
"
```

> **Important:** Change the password immediately after first login.

---

## Step 7: Systemd Service (API Server)

Create `/etc/systemd/system/noc-api.service`:

```ini
[Unit]
Description=MikroTik NOC Dashboard API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/noc-dashboard/artifacts/api-server
EnvironmentFile=/opt/noc-dashboard/.env.production
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=noc-api

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable noc-api
sudo systemctl start noc-api
sudo systemctl status noc-api
```

---

## Step 8: Nginx Configuration

Create `/etc/nginx/sites-available/noc-dashboard`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Frontend static files
    root /opt/noc-dashboard/artifacts/noc-dashboard/dist/public;
    index index.html;

    # Serve frontend (SPA routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_cookie_flags ~ httponly samesite=strict;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/noc-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 9: SSL Certificate (HTTPS)

```bash
# Get a free SSL certificate from Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is handled by certbot systemd timer
sudo systemctl status certbot.timer
```

---

## Step 10: Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Step 11: MikroTik Router Firewall

The NOC server needs access to your MikroTik routers on port **8728** (RouterOS API). On each MikroTik router, allow your VPS IP:

```
# In MikroTik terminal:
/ip firewall filter add chain=input src-address=YOUR_VPS_IP protocol=tcp dst-port=8728 action=accept comment="NOC Dashboard API"
```

Enable the API service on MikroTik:

```
/ip service enable api
/ip service set api port=8728
```

---

## Maintenance

### View API Logs

```bash
sudo journalctl -u noc-api -f
```

### Restart API After Updates

```bash
cd /opt/noc-dashboard
git pull
pnpm install
pnpm --filter @workspace/api-server run build
sudo systemctl restart noc-api
```

### Update Frontend

```bash
cd /opt/noc-dashboard
git pull
pnpm install
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
# No service restart needed — static files are served by Nginx
```

### Database Backup

```bash
# Backup
pg_dump -U noc_user -h localhost noc_db > noc_backup_$(date +%Y%m%d).sql

# Restore
psql -U noc_user -h localhost noc_db < noc_backup_20260517.sql
```

---

## GitHub Actions CI/CD (Optional)

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/noc-dashboard
            git pull
            pnpm install
            pnpm --filter @workspace/api-server run build
            BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
            sudo systemctl restart noc-api
            echo "Deployment complete!"
```

Add these secrets to your GitHub repository settings:
- `VPS_HOST` — your VPS IP or domain
- `VPS_USER` — SSH username (e.g. `ubuntu`)
- `VPS_SSH_KEY` — your private SSH key

---

## Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

> **Change the password immediately after first login.**

---

## Troubleshooting

### API won't start
```bash
# Check logs
sudo journalctl -u noc-api -n 50

# Verify DATABASE_URL is correct
sudo systemctl cat noc-api
```

### Can't connect to MikroTik
- Ensure port 8728 is open on the MikroTik firewall
- Verify the MikroTik API service is enabled: `/ip service print`
- Test from VPS: `telnet MIKROTIK_IP 8728`

### Frontend shows blank page
```bash
# Rebuild with correct BASE_PATH
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build

# Check Nginx config
sudo nginx -t
sudo systemctl reload nginx
```

### Session not persisting
- Ensure `SESSION_SECRET` is set and consistent across restarts
- Check cookie settings in browser DevTools
- Verify `NODE_ENV=production` is set (enables secure cookies)
