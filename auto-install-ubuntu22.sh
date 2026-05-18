#!/usr/bin/env bash
# =============================================================================
#  NOC Monitor — Full Auto-Installer for Ubuntu 22.04 LTS
#  Installs: Node.js 22 · pnpm · PostgreSQL 16 · Nginx · Certbot SSL
#            Builds frontend + backend · Pushes DB schema · Systemd service
#            Uploads directory · Firewall · All permissions
#
#  Usage:
#    sudo bash auto-install-ubuntu22.sh
#    sudo bash auto-install-ubuntu22.sh https://github.com/XIGNCODE-HYDRA/NOC.git
#
#  Log file:  /var/log/noc-install.log
# =============================================================================
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/noc-dashboard"
LOG_FILE="/var/log/noc-install.log"
NODE_VERSION="22"
DB_NAME="noc_db"
DB_USER="noc_user"
SERVICE_NAME="noc-api"
NGINX_CONF="noc-dashboard"
REPO_URL="${1:-}"

# ── Colors & helpers ──────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
C='\033[0;36m'; B='\033[1m';    N='\033[0m'
OK()   { echo -e "${G}  ✔${N}  $*" | tee -a "$LOG_FILE"; }
INFO() { echo -e "${C}  ▶${N}  $*" | tee -a "$LOG_FILE"; }
WARN() { echo -e "${Y}  ⚠${N}  $*" | tee -a "$LOG_FILE"; }
FAIL() { echo -e "${R}  ✖  $*${N}" | tee -a "$LOG_FILE"; exit 1; }
HR()   { echo -e "${C}$(printf '─%.0s' {1..66})${N}"; }
STEP() { echo ""; HR; echo -e "  ${B}${C}[ $* ]${N}"; HR; echo ""; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || FAIL "Run as root:  sudo bash auto-install-ubuntu22.sh"

# ── OS check ─────────────────────────────────────────────────────────────────
OS_ID=$(grep -oP '(?<=^ID=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "unknown")
OS_VER=$(grep -oP '(?<=^VERSION_ID=).+' /etc/os-release 2>/dev/null | tr -d '"' || echo "")
if [[ "$OS_ID" != "ubuntu" ]]; then
  WARN "This script targets Ubuntu 22.04. Detected: ${OS_ID} ${OS_VER}"
  read -rp "  Continue anyway? [y/N]: " FORCE
  [[ "${FORCE,,}" == "y" ]] || exit 1
fi

# ── Init log ──────────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$LOG_FILE")"
echo "=== NOC Monitor Install Log — $(date) ===" > "$LOG_FILE"
echo "  OS: ${OS_ID} ${OS_VER}   Script: auto-install-ubuntu22.sh" >> "$LOG_FILE"

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "${C}${B}"
cat << 'BANNER'
  ███╗   ██╗ ██████╗  ██████╗    ███╗   ███╗ ██████╗ ███╗   ██╗██╗████████╗ ██████╗ ██████╗
  ████╗  ██║██╔═══██╗██╔════╝    ████╗ ████║██╔═══██╗████╗  ██║██║╚══██╔══╝██╔═══██╗██╔══██╗
  ██╔██╗ ██║██║   ██║██║         ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║   ██║   ██║██████╔╝
  ██║╚██╗██║██║   ██║██║         ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║   ██║   ██║██╔══██╗
  ██║ ╚████║╚██████╔╝╚██████╗    ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║   ██║   ╚██████╔╝██║  ██║
  ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝    ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝
BANNER
echo -e "${N}"
echo -e "  ${B}Ubuntu 22.04 Auto-Installer${N}  |  MikroTik NOC Dashboard"
echo -e "  Log file: ${C}${LOG_FILE}${N}"
echo ""
HR
echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  COLLECT USER INPUT
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

# Source: Git or local directory?
if [[ -f "${SCRIPT_DIR}/package.json" && -d "${SCRIPT_DIR}/artifacts" ]]; then
  SOURCE="local"
  INFO "Source: current directory  (${SCRIPT_DIR})"
elif [[ -n "$REPO_URL" ]]; then
  SOURCE="git"
  INFO "Source: GitHub repository  (${REPO_URL})"
else
  echo -e "  ${B}Where is the project code?${N}"
  echo "    1) Clone from GitHub (enter URL)"
  echo "    2) Use current directory (zip already extracted)"
  echo ""
  read -rp "  Choice [1/2]: " SRC_CHOICE
  if [[ "${SRC_CHOICE}" == "2" ]]; then
    [[ -f "${SCRIPT_DIR}/package.json" ]] || FAIL "No package.json in current directory. Extract the zip first."
    SOURCE="local"
    INFO "Source: current directory  (${SCRIPT_DIR})"
  else
    read -rp "  GitHub repo URL: " REPO_URL
    [[ -n "$REPO_URL" ]] || FAIL "Repo URL is required."
    SOURCE="git"
    INFO "Source: ${REPO_URL}"
  fi
fi

echo ""

# GitHub PAT for private repos
GIT_USER=""
GIT_TOKEN=""
if [[ "$SOURCE" == "git" && "$REPO_URL" == *"github.com"* ]]; then
  echo -e "  ${B}Private repo?${N} Enter a GitHub Personal Access Token."
  echo "  (Leave blank for public repos)"
  read -rp "  GitHub PAT [Enter = skip]: " GIT_TOKEN
  if [[ -n "$GIT_TOKEN" ]]; then
    read -rp "  GitHub username: " GIT_USER
    REPO_URL=$(echo "$REPO_URL" | sed "s|https://|https://${GIT_USER}:${GIT_TOKEN}@|")
  fi
fi

echo ""

# Database password
read -rp "  Database password for '${DB_USER}' [Enter = auto-generate]: " DB_PASS
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 24)
  WARN "Auto-generated DB password: ${Y}${DB_PASS}${N}"
  WARN "Saved to: ${INSTALL_DIR}/.env.production"
fi

echo ""

# Domain / IP
read -rp "  Domain name for this server (e.g. noc.example.com) [Enter = use IP only]: " APP_HOST
APP_HOST="${APP_HOST:-_}"

echo ""

# Email for Certbot
SSL_EMAIL=""
if [[ "$APP_HOST" != "_" && ! "$APP_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  read -rp "  Email for SSL certificate (for renewal notices): " SSL_EMAIL
fi

echo ""
INFO "Starting installation — this will take 3–6 minutes…"
echo -e "  Full log: ${C}tail -f ${LOG_FILE}${N}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
STEP "1/12  SYSTEM PACKAGES"
# ─────────────────────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >> "$LOG_FILE" 2>&1
apt-get install -y -qq \
  curl wget git gnupg ca-certificates lsb-release \
  build-essential openssl \
  nginx certbot python3-certbot-nginx \
  ufw fail2ban \
  >> "$LOG_FILE" 2>&1
OK "System packages installed"

# ─────────────────────────────────────────────────────────────────────────────
STEP "2/12  SWAP (low-memory safety net)"
# ─────────────────────────────────────────────────────────────────────────────
TOTAL_RAM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
if [[ "$TOTAL_RAM" -lt 1572864 && ! -f /swapfile ]]; then
  INFO "RAM < 1.5 GB — creating 1 GB swap file…"
  fallocate -l 1G /swapfile >> "$LOG_FILE" 2>&1
  chmod 600 /swapfile
  mkswap /swapfile >> "$LOG_FILE" 2>&1
  swapon /swapfile >> "$LOG_FILE" 2>&1
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  OK "Swap enabled (1 GB)"
else
  OK "Swap not needed (RAM ≥ 1.5 GB or swap already exists)"
fi

# ─────────────────────────────────────────────────────────────────────────────
STEP "3/12  NODE.JS ${NODE_VERSION} LTS"
# ─────────────────────────────────────────────────────────────────────────────
export NVM_DIR="/root/.nvm"
if [[ ! -f "$NVM_DIR/nvm.sh" ]]; then
  INFO "Installing NVM…"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >> "$LOG_FILE" 2>&1
fi
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION" --no-progress >> "$LOG_FILE" 2>&1
nvm use "$NODE_VERSION" >> "$LOG_FILE" 2>&1
nvm alias default "$NODE_VERSION" >> "$LOG_FILE" 2>&1
NODE_BIN=$(nvm which current)
NPM_BIN="$(dirname "$NODE_BIN")/npm"
ln -sf "$NODE_BIN" /usr/local/bin/node
ln -sf "$NPM_BIN"  /usr/local/bin/npm
OK "Node.js $(node --version) ready  (symlinked to /usr/local/bin/node)"

# ─────────────────────────────────────────────────────────────────────────────
STEP "4/12  PNPM"
# ─────────────────────────────────────────────────────────────────────────────
npm install -g pnpm --quiet >> "$LOG_FILE" 2>&1
PNPM_BIN=$(which pnpm)
ln -sf "$PNPM_BIN" /usr/local/bin/pnpm 2>/dev/null || true
OK "pnpm $(pnpm --version) ready"

# ─────────────────────────────────────────────────────────────────────────────
STEP "5/12  POSTGRESQL 16"
# ─────────────────────────────────────────────────────────────────────────────
# Add PostgreSQL 16 official repo for Ubuntu 22.04
if ! dpkg -l | grep -q 'postgresql-16'; then
  INFO "Adding PostgreSQL 16 apt repository…"
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg >> "$LOG_FILE" 2>&1
  echo "deb [signed-by=/etc/apt/trusted.gpg.d/postgresql.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq >> "$LOG_FILE" 2>&1
  apt-get install -y -qq postgresql-16 postgresql-contrib-16 >> "$LOG_FILE" 2>&1
  OK "PostgreSQL 16 installed"
else
  OK "PostgreSQL 16 already installed"
fi

systemctl start postgresql
systemctl enable postgresql --quiet >> "$LOG_FILE" 2>&1

# Ensure pg_hba.conf uses md5 (password) auth for noc_user from localhost
PG_HBA=$(find /etc/postgresql -name pg_hba.conf | head -1)
if [[ -n "$PG_HBA" ]]; then
  grep -q "noc_user" "$PG_HBA" \
    || sed -i "/^local.*all.*all.*peer/a host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    md5" "$PG_HBA"
  systemctl reload postgresql >> "$LOG_FILE" 2>&1 || true
fi

# Create DB role + database (idempotent)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" >> "$LOG_FILE" 2>&1

sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" >> "$LOG_FILE" 2>&1

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >> "$LOG_FILE" 2>&1

sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >> "$LOG_FILE" 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" >> "$LOG_FILE" 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};" >> "$LOG_FILE" 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};" >> "$LOG_FILE" 2>&1
OK "PostgreSQL ready  (user: ${DB_USER} | db: ${DB_NAME})"

# ─────────────────────────────────────────────────────────────────────────────
STEP "6/12  APPLICATION CODE"
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$SOURCE" == "git" ]]; then
  git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    INFO "Repository exists — pulling latest…"
    cd "$INSTALL_DIR"
    git fetch origin >> "$LOG_FILE" 2>&1
    git reset --hard origin/main >> "$LOG_FILE" 2>&1
    OK "Repository updated"
  else
    mkdir -p "$(dirname "$INSTALL_DIR")"
    INFO "Cloning repository to ${INSTALL_DIR}…"
    git clone --depth=1 "$REPO_URL" "$INSTALL_DIR" >> "$LOG_FILE" 2>&1
    OK "Repository cloned"
  fi
else
  REAL_SCRIPT="$(realpath "$SCRIPT_DIR")"
  REAL_INSTALL="$(realpath "$INSTALL_DIR" 2>/dev/null || echo "$INSTALL_DIR")"
  if [[ "$REAL_SCRIPT" != "$REAL_INSTALL" ]]; then
    mkdir -p "$INSTALL_DIR"
    cp -r "${SCRIPT_DIR}/." "$INSTALL_DIR/"
    OK "Project files copied to ${INSTALL_DIR}"
  else
    OK "Already in install directory — skipping copy"
  fi
fi

cd "$INSTALL_DIR"

# ─────────────────────────────────────────────────────────────────────────────
STEP "7/12  ENVIRONMENT CONFIGURATION"
# ─────────────────────────────────────────────────────────────────────────────
SESSION_SECRET=$(openssl rand -hex 64)

cat > "${INSTALL_DIR}/.env.production" <<EOF
# NOC Monitor — Production Environment
# Generated by auto-install-ubuntu22.sh on $(date)
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=8080
EOF

chmod 600 "${INSTALL_DIR}/.env.production"
OK ".env.production written and locked (chmod 600)"

# ─────────────────────────────────────────────────────────────────────────────
STEP "8/12  BUILD FRONTEND + BACKEND"
# ─────────────────────────────────────────────────────────────────────────────

# Load env so DB push works
set -a; source "${INSTALL_DIR}/.env.production"; set +a

INFO "Installing Node.js dependencies…"
pnpm install --frozen-lockfile --reporter=silent >> "$LOG_FILE" 2>&1
OK "Dependencies installed"

INFO "Building API server (esbuild)…"
pnpm --filter @workspace/api-server run build >> "$LOG_FILE" 2>&1
OK "API server built  →  artifacts/api-server/dist/"

INFO "Building frontend (Vite)…"
PORT=3000 BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build >> "$LOG_FILE" 2>&1
OK "Frontend built   →  artifacts/noc-dashboard/dist/public/"

INFO "Pushing database schema…"
pnpm --filter @workspace/db run push >> "$LOG_FILE" 2>&1
OK "Database schema applied"

# ─────────────────────────────────────────────────────────────────────────────
STEP "9/12  FILE PERMISSIONS"
# ─────────────────────────────────────────────────────────────────────────────

# Ensure uploads directory exists and is writable by www-data
mkdir -p "${INSTALL_DIR}/artifacts/api-server/uploads"

# www-data owns the whole tree
chown -R www-data:www-data "$INSTALL_DIR"
find "$INSTALL_DIR" -type d -exec chmod 755 {} \;
find "$INSTALL_DIR" -type f -exec chmod 644 {} \;

# Executable scripts
chmod 755 "${INSTALL_DIR}/update.sh"    2>/dev/null || true
chmod 755 "${INSTALL_DIR}/deploy.sh"    2>/dev/null || true
chmod 755 "${INSTALL_DIR}/install.sh"   2>/dev/null || true
chmod 755 "${INSTALL_DIR}/auto-install-ubuntu22.sh" 2>/dev/null || true

# Protect secrets
chmod 600 "${INSTALL_DIR}/.env.production"

# Uploads dir must be writable by the API process (www-data)
chmod 755 "${INSTALL_DIR}/artifacts/api-server/uploads"
chown www-data:www-data "${INSTALL_DIR}/artifacts/api-server/uploads"

# NVM / Node binaries need to be executable
chmod +x "$NODE_BIN" 2>/dev/null || true

OK "Permissions set"

# ─────────────────────────────────────────────────────────────────────────────
STEP "10/12  SYSTEMD SERVICE"
# ─────────────────────────────────────────────────────────────────────────────
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=NOC Monitor — MikroTik Bandwidth Dashboard API
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
SyslogIdentifier=${SERVICE_NAME}

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload >> "$LOG_FILE" 2>&1
systemctl enable "${SERVICE_NAME}" --quiet >> "$LOG_FILE" 2>&1
systemctl restart "${SERVICE_NAME}" >> "$LOG_FILE" 2>&1
sleep 4

if systemctl is-active --quiet "${SERVICE_NAME}"; then
  OK "Systemd service '${SERVICE_NAME}' is running"
else
  echo "" && journalctl -u "${SERVICE_NAME}" -n 20 --no-pager 2>/dev/null || true
  FAIL "Service failed to start. Full log: sudo journalctl -u ${SERVICE_NAME} -n 50"
fi

# ─────────────────────────────────────────────────────────────────────────────
STEP "11/12  NGINX REVERSE PROXY"
# ─────────────────────────────────────────────────────────────────────────────
rm -f /etc/nginx/sites-enabled/default

DIST_DIR="${INSTALL_DIR}/artifacts/noc-dashboard/dist/public"

cat > /etc/nginx/sites-available/${NGINX_CONF} <<EOF
server {
    listen 80;
    server_name ${APP_HOST};

    # ── Static frontend (Vite build output) ───────────────────────────────
    root ${DIST_DIR};
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml;
    gzip_min_length 1024;

    # Static files with cache headers
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot|map)$ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # React SPA — send all non-file requests to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # ── API proxy to Node.js ──────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade              \$http_upgrade;
        proxy_set_header   Connection           "upgrade";
        proxy_set_header   Host                 \$host;
        proxy_set_header   X-Real-IP            \$remote_addr;
        proxy_set_header   X-Forwarded-For      \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto    \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout  60s;
        proxy_read_timeout     60s;
        proxy_send_timeout     60s;
        # Allow larger uploads (logo/favicon)
        client_max_body_size   10m;
    }

    # ── Security headers ──────────────────────────────────────────────────
    add_header X-Frame-Options        "SAMEORIGIN"                      always;
    add_header X-Content-Type-Options "nosniff"                         always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection       "1; mode=block"                   always;
    add_header Permissions-Policy     "geolocation=(), camera=()"       always;
}
EOF

ln -sf /etc/nginx/sites-available/${NGINX_CONF} /etc/nginx/sites-enabled/
nginx -t -q >> "$LOG_FILE" 2>&1
systemctl reload nginx >> "$LOG_FILE" 2>&1
OK "Nginx configured"

# ─────────────────────────────────────────────────────────────────────────────
STEP "12/12  SSL CERTIFICATE (Certbot)"
# ─────────────────────────────────────────────────────────────────────────────
SSL_ENABLED=false
IS_DOMAIN=false

if [[ "$APP_HOST" != "_" && "$APP_HOST" != "localhost" && ! "$APP_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  IS_DOMAIN=true
fi

if [[ "$IS_DOMAIN" == true ]]; then
  INFO "Requesting Let's Encrypt SSL certificate for ${APP_HOST}…"
  CERTBOT_ARGS=(
    --nginx
    -d "$APP_HOST"
    --non-interactive
    --agree-tos
    --redirect
  )
  if [[ -n "$SSL_EMAIL" ]]; then
    CERTBOT_ARGS+=(--email "$SSL_EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi

  if certbot "${CERTBOT_ARGS[@]}" >> "$LOG_FILE" 2>&1; then
    SSL_ENABLED=true
    OK "SSL certificate installed  (Let's Encrypt — auto-renews via certbot.timer)"
    # Verify auto-renewal timer
    systemctl is-enabled certbot.timer --quiet 2>/dev/null && OK "Certbot renewal timer active" || \
      systemctl enable certbot.timer --quiet >> "$LOG_FILE" 2>&1 || true
  else
    WARN "Certbot failed — make sure DNS for '${APP_HOST}' points to this server's IP."
    WARN "Run manually later:  sudo certbot --nginx -d ${APP_HOST}"
  fi
else
  WARN "No domain provided — skipping SSL."
  WARN "Add SSL later:  sudo certbot --nginx -d your-domain.com"
fi

# ── Firewall ───────────────────────────────────────────────────────────────────
INFO "Configuring UFW firewall…"
ufw --force reset >> "$LOG_FILE" 2>&1
ufw default deny incoming  >> "$LOG_FILE" 2>&1
ufw default allow outgoing >> "$LOG_FILE" 2>&1
ufw allow OpenSSH          >> "$LOG_FILE" 2>&1
ufw allow 'Nginx Full'     >> "$LOG_FILE" 2>&1
echo "y" | ufw enable      >> "$LOG_FILE" 2>&1
OK "Firewall active  (SSH + HTTP/HTTPS allowed; all else denied)"

# ── fail2ban ──────────────────────────────────────────────────────────────────
systemctl enable fail2ban --quiet >> "$LOG_FILE" 2>&1
systemctl start  fail2ban >> "$LOG_FILE" 2>&1 || true
OK "fail2ban active  (brute-force protection)"

# ── Update shortcuts ──────────────────────────────────────────────────────────
ln -sf "${INSTALL_DIR}/update.sh" /usr/local/bin/noc-update 2>/dev/null || true
chmod +x "${INSTALL_DIR}/update.sh" 2>/dev/null || true
OK "Update shortcut installed  (run: noc-update)"

# ─────────────────────────────────────────────────────────────────────────────
#  SEED DEFAULT ADMIN ACCOUNT (first run only)
# ─────────────────────────────────────────────────────────────────────────────
# The API server seeds admin/admin123 on first start automatically.
# Give it 3 more seconds to complete seeding.
sleep 3

# ─────────────────────────────────────────────────────────────────────────────
#  DONE — SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
VPS_IP=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
         || hostname -I 2>/dev/null | awk '{print $1}' \
         || echo "your-server-ip")

PROTO="http"
[[ "$SSL_ENABLED" == "true" ]] && PROTO="https"

DISPLAY_HOST="$APP_HOST"
[[ "$APP_HOST" == "_" ]] && DISPLAY_HOST="$VPS_IP"

echo ""
HR
echo ""
echo -e "  ${G}${B}╔═══════════════════════════════════════════════╗${N}"
echo -e "  ${G}${B}║        INSTALLATION COMPLETE  ✔              ║${N}"
echo -e "  ${G}${B}╚═══════════════════════════════════════════════╝${N}"
echo ""
echo -e "  ${B}Dashboard URL:${N}     ${C}${PROTO}://${DISPLAY_HOST}${N}"
[[ "$APP_HOST" == "_" ]] && \
echo -e "  ${B}Direct IP:${N}         ${C}http://${VPS_IP}${N}"
echo ""
echo -e "  ${B}Default login:${N}"
echo -e "    Username  ${C}admin${N}"
echo -e "    Password  ${C}admin123${N}  ${R}← change this immediately!${N}"
echo ""
echo -e "  ${B}First steps:${N}"
echo "    1. Open the dashboard and log in"
echo "    2. Settings → Change Password"
echo "    3. Settings → Branding  (upload your logo + favicon)"
echo "    4. Settings → Telegram Alerts  (optional notifications)"
echo "    5. Devices → Add your MikroTik routers"
echo "    6. Interfaces → Select interfaces to monitor"
echo ""
echo -e "  ${B}Installed components:${N}"
echo -e "    ${G}✔${N}  Node.js $(node --version)"
echo -e "    ${G}✔${N}  pnpm $(pnpm --version)"
echo -e "    ${G}✔${N}  PostgreSQL 16  (db: ${DB_NAME} | user: ${DB_USER})"
echo -e "    ${G}✔${N}  Nginx reverse proxy"
[[ "$SSL_ENABLED" == "true" ]] \
  && echo -e "    ${G}✔${N}  Let's Encrypt SSL (auto-renews via certbot.timer)" \
  || echo -e "    ${Y}⚠${N}  SSL not installed  (no domain provided)"
echo -e "    ${G}✔${N}  UFW firewall  (SSH + HTTP/HTTPS)"
echo -e "    ${G}✔${N}  fail2ban brute-force protection"
echo -e "    ${G}✔${N}  Systemd service '${SERVICE_NAME}' (auto-starts on reboot)"
echo -e "    ${G}✔${N}  Uploads directory  (logo/favicon persistence)"
echo ""
echo -e "  ${B}Useful commands:${N}"
echo "    sudo journalctl -u ${SERVICE_NAME} -f       # live API logs"
echo "    sudo systemctl restart ${SERVICE_NAME}       # restart API"
echo "    sudo noc-update                              # pull & rebuild from GitHub"
echo "    sudo certbot renew --dry-run                 # test SSL renewal"
echo "    cat ${INSTALL_DIR}/.env.production           # view credentials"
echo ""
echo -e "  ${B}Install log:${N}  ${LOG_FILE}"
echo ""
HR
echo ""
