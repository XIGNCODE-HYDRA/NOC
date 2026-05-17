#!/usr/bin/env bash
# =============================================================================
#  NOC Monitor — One-Command VPS Installer
#  Works on Ubuntu 22.04 / 24.04 LTS and Debian 12
#
#  Usage (pick one):
#    Option A — from GitHub:
#      bash <(curl -fsSL https://raw.githubusercontent.com/XIGNCODE-HYDRA/NOC/main/install.sh) \
#           https://github.com/XIGNCODE-HYDRA/NOC.git
#
#    Option B — from extracted zip on the server:
#      bash install.sh
#
#    Option C — pass repo URL as argument:
#      bash install.sh https://github.com/XIGNCODE-HYDRA/NOC.git
# =============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; B='\033[1m'; N='\033[0m'
OK()   { echo -e "${G}  ✔${N}  $*"; }
INFO() { echo -e "${C}  ▶${N}  $*"; }
WARN() { echo -e "${Y}  ⚠${N}  $*"; }
FAIL() { echo -e "${R}  ✖  $*${N}"; exit 1; }
HR()   { echo -e "${C}──────────────────────────────────────────────────${N}"; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || FAIL "Run as root:  sudo bash install.sh"

INSTALL_DIR="/opt/noc-dashboard"
REPO_URL="${1:-}"           # optional first argument: GitHub repo URL
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

clear
echo ""
echo -e "${C}${B}"
echo "  ███╗   ██╗ ██████╗  ██████╗     ███╗   ███╗ ██████╗ ███╗   ██╗██╗████████╗ ██████╗ ██████╗ "
echo "  ████╗  ██║██╔═══██╗██╔════╝     ████╗ ████║██╔═══██╗████╗  ██║██║╚══██╔══╝██╔═══██╗██╔══██╗"
echo "  ██╔██╗ ██║██║   ██║██║          ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║   ██║   ██║██████╔╝"
echo "  ██║╚██╗██║██║   ██║██║          ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║   ██║   ██║██╔══██╗"
echo "  ██║ ╚████║╚██████╔╝╚██████╗     ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║   ██║   ╚██████╔╝██║  ██║"
echo "  ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝     ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝"
echo -e "${N}"
echo -e "  ${B}VPS Auto-Installer${N}  |  MikroTik Bandwidth & Network Operations Dashboard"
echo ""
HR

# ── Collect user inputs ───────────────────────────────────────────────────────
echo ""

# Source: Git repo or local files?
if [[ -f "${SCRIPT_DIR}/package.json" && -d "${SCRIPT_DIR}/artifacts" ]]; then
  SOURCE="local"
  INFO "Source: current directory  (${SCRIPT_DIR})"
elif [[ -n "$REPO_URL" ]]; then
  SOURCE="git"
  INFO "Source: GitHub repository  (${REPO_URL})"
else
  echo -e "  ${B}Where is the project code?${N}"
  echo "    1) Clone from GitHub (enter URL)"
  echo "    2) Use current directory (you already extracted the zip)"
  echo ""
  read -rp "  Your choice [1/2]: " SRC_CHOICE
  if [[ "$SRC_CHOICE" == "2" ]]; then
    [[ -f "${SCRIPT_DIR}/package.json" ]] || FAIL "No package.json found in current directory. Extract the zip first."
    SOURCE="local"
    INFO "Source: current directory  (${SCRIPT_DIR})"
  else
    read -rp "  GitHub repo URL (e.g. https://github.com/you/noc-monitor): " REPO_URL
    [[ -n "$REPO_URL" ]] || FAIL "Repo URL is required"
    SOURCE="git"
    INFO "Source: GitHub repository  (${REPO_URL})"
  fi
fi

echo ""

# Database password
read -rp "  Database password for 'noc_user' [Enter = auto-generate]: " DB_PASS
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 24)
  WARN "Auto-generated DB password: ${Y}${DB_PASS}${N}"
  WARN "It will be saved to ${INSTALL_DIR}/.env.production"
fi

echo ""

# Domain name (for Nginx + SSL)
read -rp "  Domain or IP for Nginx (e.g. noc.example.com or 123.45.67.89): " APP_HOST
APP_HOST="${APP_HOST:-_}"

echo ""

# GitHub PAT for private repos (only if using git source)
GIT_USER=""
GIT_TOKEN=""
if [[ "$SOURCE" == "git" && "$REPO_URL" == *"github.com"* ]]; then
  echo -e "  If this is a ${B}private${N} GitHub repo, enter a Personal Access Token."
  echo "  (Leave blank for public repos)"
  read -rp "  GitHub PAT [Enter = skip]: " GIT_TOKEN
  if [[ -n "$GIT_TOKEN" ]]; then
    read -rp "  GitHub username: " GIT_USER
    # Embed credentials in the URL
    REPO_URL=$(echo "$REPO_URL" | sed "s|https://|https://${GIT_USER}:${GIT_TOKEN}@|")
  fi
fi

echo ""
INFO "Starting installation. This will take 2–5 minutes..."
echo ""
HR

# ── Step 1: System packages ───────────────────────────────────────────────────
INFO "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl git nginx certbot python3-certbot-nginx \
  ufw build-essential ca-certificates gnupg lsb-release
OK "System packages ready"

# ── Step 2: Node.js 20 via NVM ────────────────────────────────────────────────
INFO "Setting up Node.js 20..."
export NVM_DIR="/root/.nvm"
if [[ ! -f "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install 20 --no-progress
nvm use 20
nvm alias default 20
NODE_BIN=$(nvm which current)
NPM_BIN="$(dirname "$NODE_BIN")/npm"
# Symlink for www-data / systemd (which won't have NVM in PATH)
ln -sf "$NODE_BIN" /usr/local/bin/node
ln -sf "$NPM_BIN"  /usr/local/bin/npm
OK "Node.js $(node --version) ready"

# ── Step 3: pnpm ──────────────────────────────────────────────────────────────
INFO "Installing pnpm..."
npm install -g pnpm --quiet
PNPM_BIN=$(which pnpm)
ln -sf "$PNPM_BIN" /usr/local/bin/pnpm 2>/dev/null || true
OK "pnpm $(pnpm --version) ready"

# ── Step 4: PostgreSQL ────────────────────────────────────────────────────────
INFO "Setting up PostgreSQL..."
apt-get install -y -qq postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql --quiet

# Create user/db only if they don't exist yet
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='noc_user'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER noc_user WITH PASSWORD '${DB_PASS}';" >/dev/null
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='noc_db'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE noc_db OWNER noc_user;" >/dev/null
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE noc_db TO noc_user;" >/dev/null
OK "PostgreSQL ready  (user: noc_user  |  db: noc_db)"

# ── Step 5: Get the application code ─────────────────────────────────────────
INFO "Deploying application code to ${INSTALL_DIR}..."
if [[ "$SOURCE" == "git" ]]; then
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    cd "$INSTALL_DIR" && git pull --quiet
    OK "Repository updated"
  else
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --quiet "$REPO_URL" "$INSTALL_DIR"
    OK "Repository cloned"
  fi
else
  # Copy local files to install dir (skip if already there)
  if [[ "$(realpath "$SCRIPT_DIR")" != "$(realpath "$INSTALL_DIR")" ]]; then
    mkdir -p "$INSTALL_DIR"
    cp -r "${SCRIPT_DIR}/." "$INSTALL_DIR/"
    OK "Project files copied to ${INSTALL_DIR}"
  else
    OK "Already in install directory"
  fi
fi

cd "$INSTALL_DIR"

# ── Step 6: Write .env.production ────────────────────────────────────────────
INFO "Writing environment configuration..."
SESSION_SECRET=$(openssl rand -hex 64)
cat > "${INSTALL_DIR}/.env.production" <<EOF
DATABASE_URL=postgresql://noc_user:${DB_PASS}@localhost:5432/noc_db
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=8080
EOF
chmod 600 "${INSTALL_DIR}/.env.production"
OK ".env.production written"

# ── Step 7: Install Node dependencies ────────────────────────────────────────
INFO "Installing Node.js dependencies (this may take a minute)..."
pnpm install --frozen-lockfile --reporter=silent
OK "Dependencies installed"

# ── Step 8: Build the application ────────────────────────────────────────────
INFO "Building API server..."
pnpm --filter @workspace/api-server run build
OK "API server built"

INFO "Building frontend..."
PORT=3000 BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
OK "Frontend built"

# ── Step 9: Push DB schema ────────────────────────────────────────────────────
INFO "Initializing database schema..."
set -a; source "${INSTALL_DIR}/.env.production"; set +a
pnpm --filter @workspace/db run push
OK "Database schema ready"

# ── Step 10: Set permissions ──────────────────────────────────────────────────
INFO "Setting file permissions..."
chown -R www-data:www-data "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
chmod 600 "${INSTALL_DIR}/.env.production"
OK "Permissions set"

# ── Step 11: Systemd service ──────────────────────────────────────────────────
INFO "Creating systemd service..."
cat > /etc/systemd/system/noc-api.service <<EOF
[Unit]
Description=NOC Monitor API Server
Documentation=https://github.com/XIGNCODE-HYDRA/NOC
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=${INSTALL_DIR}/artifacts/api-server
EnvironmentFile=${INSTALL_DIR}/.env.production
ExecStart=/usr/local/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=noc-api

# Hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable noc-api --quiet
systemctl restart noc-api
sleep 3

if systemctl is-active --quiet noc-api; then
  OK "API service running"
else
  FAIL "API service failed to start. Check logs: sudo journalctl -u noc-api -n 30"
fi

# ── Step 12: Nginx ────────────────────────────────────────────────────────────
INFO "Configuring Nginx..."
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/noc-dashboard <<EOF
server {
    listen 80;
    server_name ${APP_HOST};

    root ${INSTALL_DIR}/artifacts/noc-dashboard/dist/public;
    index index.html;

    # React SPA — route all paths to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy /api/* to Node.js API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade      \$http_upgrade;
        proxy_set_header Connection   "upgrade";
        proxy_set_header Host         \$host;
        proxy_set_header X-Real-IP    \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_read_timeout    60s;
    }

    # Security headers
    add_header X-Frame-Options        "SAMEORIGIN"                    always;
    add_header X-Content-Type-Options "nosniff"                       always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection       "1; mode=block"                 always;
}
EOF

ln -sf /etc/nginx/sites-available/noc-dashboard /etc/nginx/sites-enabled/
nginx -t -q
systemctl reload nginx
OK "Nginx configured"

# ── Step 13: SSL (only if a real domain was given) ────────────────────────────
SSL_ENABLED=false
if [[ "$APP_HOST" != "_" && "$APP_HOST" != "localhost" && ! "$APP_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  INFO "Requesting SSL certificate for ${APP_HOST}..."
  if certbot --nginx -d "$APP_HOST" --non-interactive --agree-tos \
       --register-unsafely-without-email --redirect -q 2>/dev/null; then
    SSL_ENABLED=true
    OK "SSL certificate installed (auto-renews via certbot.timer)"
  else
    WARN "SSL setup failed — run manually: sudo certbot --nginx -d ${APP_HOST}"
  fi
else
  WARN "No domain given — skipping SSL. Run later: sudo certbot --nginx -d your-domain.com"
fi

# ── Step 14: Firewall ─────────────────────────────────────────────────────────
INFO "Configuring firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH          >/dev/null
ufw allow 'Nginx Full'     >/dev/null
echo "y" | ufw enable      >/dev/null
OK "Firewall active (SSH + HTTP/HTTPS open)"

# ── Step 15: update.sh shortcut ───────────────────────────────────────────────
ln -sf "${INSTALL_DIR}/update.sh" /usr/local/bin/noc-update 2>/dev/null || true
chmod +x "${INSTALL_DIR}/update.sh" 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────────
VPS_IP=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
PROTO="http"
[[ "$SSL_ENABLED" == true ]] && PROTO="https"

echo ""
HR
echo ""
echo -e "  ${G}${B}Installation complete!${N}"
echo ""
echo -e "  ${B}Dashboard URL:${N}  ${C}${PROTO}://${APP_HOST}${N}"
[[ "$APP_HOST" == "_" ]] && echo -e "  ${B}Or by IP:${N}       ${C}http://${VPS_IP}${N}"
echo ""
echo -e "  ${B}Default login:${N}"
echo -e "    Username: ${C}admin${N}"
echo -e "    Password: ${C}admin123${N}  ← ${R}change this immediately!${N}"
echo ""
echo -e "  ${B}First steps after login:${N}"
echo "    1. Settings → Change Password  (change admin password)"
echo "    2. Devices → Add Device        (add your MikroTik routers)"
echo "    3. Settings → Support Accounts (create accounts for your team)"
echo ""
echo -e "  ${B}Useful commands:${N}"
echo "    sudo journalctl -u noc-api -f        # live API logs"
echo "    sudo systemctl restart noc-api        # restart API"
echo "    sudo noc-update                        # deploy latest code from git"
echo ""
echo -e "  ${B}DB credentials saved to:${N}  ${INSTALL_DIR}/.env.production"
echo ""
HR
echo ""
