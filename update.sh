#!/usr/bin/env bash
# =============================================================================
# NOC Monitor — Update Script
# Run after pulling new code: sudo bash update.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash update.sh"; exit 1; }
[[ -f "$APP_DIR/.env.production" ]] || { echo "No .env.production found in $APP_DIR"; exit 1; }

cd "$APP_DIR"

info "Pulling latest code..."
git pull

info "Installing dependencies..."
pnpm install --frozen-lockfile --reporter=silent

info "Building API server..."
pnpm --filter @workspace/api-server run build

info "Building frontend..."
PORT=3000 BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build

info "Applying DB migrations..."
export $(grep -v '^#' "$APP_DIR/.env.production" | xargs)
pnpm --filter @workspace/db run push

info "Setting permissions..."
chown -R www-data:www-data "$APP_DIR"
chmod -R 755 "$APP_DIR"
chmod 600 "$APP_DIR/.env.production"

info "Restarting API service..."
systemctl restart noc-api
sleep 2
systemctl is-active --quiet noc-api && success "API service restarted" || { echo "Service failed — check: sudo journalctl -u noc-api -n 30"; exit 1; }

success "Update complete at $(date)"
