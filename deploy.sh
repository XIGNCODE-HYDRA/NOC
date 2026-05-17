#!/usr/bin/env bash
# =============================================================================
# NOC Monitor — One-Shot VPS Deploy Script
# Run as root or with sudo: sudo bash deploy.sh
# Tested on Ubuntu 22.04 / 24.04 LTS and Debian 12
# =============================================================================
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Check root ───────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Please run as root: sudo bash deploy.sh"

APP_DIR="/opt/noc-dashboard"
[[ -f "$APP_DIR/package.json" ]] || error "Run this script from inside the project: sudo bash $APP_DIR/deploy.sh"

# ─── Gather config ────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}   NOC Monitor — VPS Deployment                      ${NC}"
echo -e "${CYAN}=====================================================${NC}"
echo ""

read -rp "  DB password for 'noc_user' (press Enter to auto-generate): " DB_PASS
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 24)
  info "Auto-generated DB password: ${YELLOW}${DB_PASS}${NC}  (saved to .env.production)"
fi

read -rp "  Your domain name (e.g. noc.example.com) — or press Enter to skip SSL: " DOMAIN
SESSION_SECRET=$(openssl rand -hex 64)

echo ""
info "Starting deployment..."
echo ""

# ─── Step 1: System packages ─────────────────────────────────────────────────
info "Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx ufw build-essential
success "System packages installed"

# ─── Step 2: Node.js via NVM ─────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -e 'process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)' 2>/dev/null; echo $?)" == "1" ]]; then
  info "Installing Node.js 20 via NVM..."
  export NVM_DIR="/root/.nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  nvm alias default 20
  # Make node/npm available system-wide
  NVM_NODE_PATH="$(nvm which current)"
  ln -sf "$NVM_NODE_PATH" /usr/local/bin/node
  ln -sf "$(dirname "$NVM_NODE_PATH")/npm" /usr/local/bin/npm
  success "Node.js $(node --version) installed"
else
  success "Node.js $(node --version) already installed"
fi

# ─── Step 3: pnpm ────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm --quiet
  success "pnpm $(pnpm --version) installed"
else
  success "pnpm $(pnpm --version) already installed"
fi

# ─── Step 4: PostgreSQL ──────────────────────────────────────────────────────
info "Setting up PostgreSQL..."
apt-get install -y -qq postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='noc_user'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER noc_user WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='noc_db'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE noc_db OWNER noc_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE noc_db TO noc_user;" >/dev/null
success "PostgreSQL ready (user: noc_user, db: noc_db)"

# ─── Step 5: Environment file ────────────────────────────────────────────────
info "Writing environment file..."
cat > "$APP_DIR/.env.production" <<EOF
DATABASE_URL=postgresql://noc_user:${DB_PASS}@localhost:5432/noc_db
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=8080
EOF
chmod 600 "$APP_DIR/.env.production"
success ".env.production written"

# ─── Step 6: Install dependencies & build ────────────────────────────────────
info "Installing Node dependencies..."
cd "$APP_DIR"
pnpm install --frozen-lockfile --reporter=silent
success "Dependencies installed"

info "Building API server..."
pnpm --filter @workspace/api-server run build
success "API server built"

info "Building frontend..."
PORT=3000 BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
success "Frontend built"

# ─── Step 7: Push DB schema ──────────────────────────────────────────────────
info "Pushing database schema..."
export $(grep -v '^#' "$APP_DIR/.env.production" | xargs)
pnpm --filter @workspace/db run push
success "Database schema ready"

# ─── Step 8: Set permissions ─────────────────────────────────────────────────
info "Setting file permissions..."
chown -R www-data:www-data "$APP_DIR"
chmod -R 755 "$APP_DIR"
chmod 600 "$APP_DIR/.env.production"
success "Permissions set"

# ─── Step 9: Systemd service ─────────────────────────────────────────────────
info "Creating systemd service..."
NODE_BIN=$(command -v node)
cat > /etc/systemd/system/noc-api.service <<EOF
[Unit]
Description=NOC Monitor API Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=${APP_DIR}/artifacts/api-server
EnvironmentFile=${APP_DIR}/.env.production
ExecStart=${NODE_BIN} --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=noc-api

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable noc-api
systemctl restart noc-api
sleep 2
systemctl is-active --quiet noc-api && success "API service running" || error "API service failed to start — run: sudo journalctl -u noc-api -n 30"

# ─── Step 10: Nginx config ───────────────────────────────────────────────────
info "Configuring Nginx..."

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

NGINX_SERVER_NAME="${DOMAIN:-_}"

cat > /etc/nginx/sites-available/noc-dashboard <<EOF
server {
    listen 80;
    server_name ${NGINX_SERVER_NAME};

    root ${APP_DIR}/artifacts/noc-dashboard/dist/public;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
EOF

ln -sf /etc/nginx/sites-available/noc-dashboard /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
success "Nginx configured"

# ─── Step 11: SSL ─────────────────────────────────────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  info "Obtaining SSL certificate for ${DOMAIN}..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email \
    --redirect && success "SSL certificate installed" || warn "SSL setup failed — run manually: sudo certbot --nginx -d ${DOMAIN}"
else
  warn "Skipping SSL (no domain provided). Run later: sudo certbot --nginx -d your-domain.com"
fi

# ─── Step 12: Firewall ───────────────────────────────────────────────────────
info "Configuring firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
success "Firewall configured (SSH + HTTP/HTTPS allowed)"

# ─── Done ─────────────────────────────────────────────────────────────────────
VPS_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}   Deployment Complete!                              ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo ""
echo -e "  URL:      ${CYAN}http://${DOMAIN:-$VPS_IP}${NC}"
echo -e "  Username: ${CYAN}admin${NC}"
echo -e "  Password: ${CYAN}admin123${NC}  ← change this immediately!"
echo ""
echo -e "  DB password saved to: ${YELLOW}${APP_DIR}/.env.production${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    sudo journalctl -u noc-api -f          # live API logs"
echo -e "    sudo systemctl restart noc-api          # restart API"
echo -e "    cd ${APP_DIR} && sudo bash update.sh    # deploy update"
echo ""
