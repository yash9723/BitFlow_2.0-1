#!/usr/bin/env bash
# BitFlow 2.0 — VPS setup & deployment (Ubuntu/Debian).
#
#   ./setup_server.sh                  # HTTP on port 3000
#   ./setup_server.sh bitflow.example  # HTTPS via Caddy for that domain
#                                      # (point its DNS A record at this server first)
#
# Safe to re-run: pulls the latest code and rebuilds. Never overwrites .env.

set -euo pipefail

DOMAIN="${1:-}"

echo "=================================================="
echo "🚀 BitFlow 2.0 — Production Server Deployment"
echo "=================================================="

sudo apt-get update -y

if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER" || true
    rm get-docker.sh
fi

if ! command -v git &> /dev/null; then
    echo "📦 Installing Git..."
    sudo apt-get install -y git
fi

if [ ! -d "BitFlow_2.0" ]; then
    echo "📥 Cloning BitFlow 2.0 Repository..."
    git clone https://github.com/abhilashjoyealuppalaguptha-netizen/BitFlow_2.0.git
    cd BitFlow_2.0
else
    echo "🔄 Pulling latest BitFlow 2.0 updates from main branch..."
    cd BitFlow_2.0
    git pull origin main
fi

# ── .env: created once with fresh secrets, then left alone ───────────────────
if [ ! -f .env ]; then
    echo "🔐 Creating .env with generated secrets..."
    cp .env.example .env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
    sed -i "s|^ADMIN_SECRET=.*|ADMIN_SECRET=$(openssl rand -hex 16)|" .env
    echo "   Admin sign-up secret is in .env (ADMIN_SECRET) — keep it private."
fi

set_env() {  # set_env KEY VALUE — add or replace a line in .env
    if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

PROFILES=()
if [ -n "$DOMAIN" ]; then
    set_env DOMAIN "$DOMAIN"
    set_env HTTPS true
    set_env FRONTEND_BIND 127.0.0.1   # only reachable through Caddy
    PROFILES+=(--profile https)
fi

echo "🐳 Building and launching containers..."
sudo docker compose "${PROFILES[@]}" up -d --build

echo ""
echo "=================================================="
echo "🎉 BitFlow 2.0 is running!"
echo "=================================================="
if [ -n "$DOMAIN" ]; then
    echo "🌐 https://$DOMAIN"
else
    echo "🌐 http://$(curl -s ifconfig.me || echo 'YOUR_SERVER_IP'):3000"
    echo "   For HTTPS, re-run with your domain: ./setup_server.sh your.domain"
fi
echo "   (The simulation API listens on 127.0.0.1 only; it is not exposed publicly.)"
echo "=================================================="
