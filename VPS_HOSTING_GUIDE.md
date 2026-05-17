# NOC Monitor — VPS Hosting Guide

Complete deployment guide for the MikroTik NOC Monitor on a Linux VPS using Node.js, PostgreSQL, and Nginx. Tested on **Ubuntu 22.04 / 24.04 LTS** and **Debian 12**.

---

## Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 512 MB | 1 GB |
| Disk | 10 GB SSD | 20 GB SSD |
| OS | Ubuntu 22.04 / Debian 12 | Ubuntu 24.04 LTS |
| Node.js | 20+ | 24 (LTS) |
| PostgreSQL | 14+ | 16+ |

> **Quick deploy:** If you just want to run the automated setup script, jump to the [One-Shot Deploy Script](#one-shot-deploy-script) section.

---

## Manual Step-by-Step Setup

### Step 1: Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git nginx certbot python3-certbot-nginx ufw build-essential

# Install Node.js 20 via NVM (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
node --version   # should print v20.x.x

# Install pnpm
npm install -g pnpm

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

### Step 2: Database Setup

```bash
# Create database and user (replace 'your_strong_password' with a real password)
sudo -u postgres psql <<EOF
CREATE USER noc_user WITH PASSWORD 'your_strong_password';
CREATE DATABASE noc_db OWNER noc_user;
GRANT ALL PRIVILEGES ON DATABASE noc_db TO noc_user;
EOF
```

---

### Step 3: Clone & Build the Application

```bash
# Clone your repository
git clone https://github.com/XIGNCODE-HYDRA/NOC.git /opt/noc-dashboard
cd /opt/noc-dashboard

# Install all dependencies
pnpm install --frozen-lockfile

# Build the API server
pnpm --filter @workspace/api-server run build

# Build the frontend (static files)
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
```

---

### Step 4: Environment Variables

Create `/opt/noc-dashboard/.env.production`:

```bash
# Generate a secure session secret first:
SESSION_SECRET_VAL=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

cat > /opt/noc-dashboard/.env.production <<EOF
DATABASE_URL=postgresql://noc_user:your_strong_password@localhost:5432/noc_db
SESSION_SECRET=${SESSION_SECRET_VAL}
NODE_ENV=production
PORT=8080
EOF

# Lock down the file
chmod 600 /opt/noc-dashboard/.env.production
```

---

### Step 5: Push Database Schema

```bash
cd /opt/noc-dashboard
export $(grep -v '^#' .env.production | xargs)
pnpm --filter @workspace/db run push
```

---

### Step 6: Seed the Default Admin User

The schema auto-seeds `admin` / `admin123` via Drizzle seed on first push. If you need to do it manually:

```bash
cd /opt/noc-dashboard
export $(grep -v '^#' .env.production | xargs)

node --input-type=module <<'SEED'
import { db, usersTable } from './lib/db/src/index.js';
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('admin123', 10);
await db.insert(usersTable).values({ username: 'admin', passwordHash: hash, role: 'admin' })
  .onConflictDoNothing();
console.log('Admin user seeded.');
process.exit(0);
SEED
```

> **Change the password immediately** after first login via Settings → Change Password.

---

### Step 7: Systemd Service

Create `/etc/systemd/system/noc-api.service`:

```ini
[Unit]
Description=NOC Monitor API Server
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
sudo systemctl daemon-reload
sudo systemctl enable noc-api
sudo systemctl start noc-api
sudo systemctl status noc-api
```

---

### Step 8: Nginx Configuration

Create `/etc/nginx/sites-available/noc-dashboard`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Frontend static files
    root /opt/noc-dashboard/artifacts/noc-dashboard/dist/public;
    index index.html;

    # SPA routing — all non-asset paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js backend
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
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/noc-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 9: SSL Certificate (HTTPS)

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Verify auto-renewal timer is active
sudo systemctl status certbot.timer
```

---

### Step 10: Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

### Step 11: MikroTik Router Firewall

The NOC server needs to reach each MikroTik on port **8728** (RouterOS API). On each router:

```
# MikroTik terminal — allow VPS IP through API port
/ip firewall filter add chain=input src-address=YOUR_VPS_IP protocol=tcp dst-port=8728 action=accept comment="NOC Monitor API"

# Verify/enable the API service
/ip service enable api
/ip service set api port=8728
/ip service print
```

---

## One-Shot Deploy Script

See `deploy.sh` in the project root — or run it directly from your cloned repo:

```bash
sudo bash /opt/noc-dashboard/deploy.sh
```

The script handles everything: packages, Node.js, PostgreSQL, app build, systemd, Nginx, firewall.

---

## User Accounts & Roles

The dashboard has two roles:

| Role | Access |
|------|--------|
| `admin` | All pages: Dashboard, Devices, Interfaces, Ping, Netwatch, Settings |
| `support` | Dashboard + Event Log panel only |

### Managing Users

Log in as `admin` → **Settings** → **Support Accounts**:
- Create new support accounts (username + password)
- Delete support accounts
- You cannot delete your own account

### Change Password

Log in → **Settings** → **Change Password** (available to all roles).

---

## Maintenance

### View API Logs

```bash
sudo journalctl -u noc-api -f
sudo journalctl -u noc-api --since "1 hour ago"
```

### Deploy an Update

```bash
cd /opt/noc-dashboard
git pull
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
sudo systemctl restart noc-api
```

### Database Backup & Restore

```bash
# Backup
pg_dump -U noc_user -h localhost noc_db > noc_backup_$(date +%Y%m%d_%H%M).sql

# Restore
psql -U noc_user -h localhost noc_db < noc_backup_20260517_1200.sql
```

### Run DB Migrations After Code Update

```bash
cd /opt/noc-dashboard
export $(grep -v '^#' .env.production | xargs)
pnpm --filter @workspace/db run push
sudo systemctl restart noc-api
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
            pnpm install --frozen-lockfile
            pnpm --filter @workspace/api-server run build
            BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
            export $(grep -v '^#' .env.production | xargs)
            pnpm --filter @workspace/db run push
            sudo systemctl restart noc-api
            echo "Deployment complete!"
```

**GitHub repository secrets to add:**
- `VPS_HOST` — your VPS IP or domain
- `VPS_USER` — SSH username (e.g. `ubuntu` or `root`)
- `VPS_SSH_KEY` — contents of your private SSH key (`~/.ssh/id_rsa`)

---

## Troubleshooting

### API service won't start
```bash
sudo journalctl -u noc-api -n 50 --no-pager
# Check env file is readable by www-data
sudo -u www-data cat /opt/noc-dashboard/.env.production
```

### Database connection error
```bash
# Test connection manually
psql postgresql://noc_user:your_password@localhost:5432/noc_db -c "SELECT 1"
```

### Can't connect to MikroTik
- Ensure port **8728** is open on the MikroTik firewall
- Check from VPS: `nc -zv MIKROTIK_IP 8728`
- Verify: `/ip service print` on MikroTik

### Frontend shows blank/white page
```bash
# Rebuild with correct BASE_PATH
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
sudo nginx -t && sudo systemctl reload nginx
```

### Session drops after API restart
- Ensure `SESSION_SECRET` is set to the same value after restart
- Verify `NODE_ENV=production` is in `.env.production`

### Permission denied on /opt/noc-dashboard
```bash
sudo chown -R www-data:www-data /opt/noc-dashboard
sudo chmod -R 755 /opt/noc-dashboard
```

---

## Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

> **Change the default password immediately** after first login via Settings → Change Password.
