#!/bin/bash
# gcp/startup.sh: first-boot setup for the BitFlow simulator on a Google Compute Engine Ubuntu 24.04 VM.
# Same shape as aws/user-data.sh: Docker, the simulator image built from Dockerfile.api, and Caddy serving it over
# HTTPS (a Let's Encrypt certificate for $DOMAIN once its DNS A record points at this VM's external IP).
# Public key only: the API verifies tokens, it never signs them, so nothing in this file is secret.
#
# Settings come from instance metadata, so the same script serves every VM (see gcp/README.md):
#   domain          required, e.g. sim-us.bitflowvlsi.tech
#   max_concurrent  light jobs at once (default 2; use 1 on a tiny VM)
#   cache_mb        result cache size (default 256; use 64 on 1 GB of RAM)
#   branch          git branch to run (default bitflow-hardening-and-features)
set -euxo pipefail
exec > >(tee /var/log/bitflow-setup.log) 2>&1

md() { curl -fsS -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true; }
DOMAIN="$(md domain)"
[ -n "$DOMAIN" ] || { echo "metadata 'domain' is required"; exit 1; }
MAX_CONCURRENT="$(md max_concurrent)"; MAX_CONCURRENT="${MAX_CONCURRENT:-2}"
CACHE_MB="$(md cache_mb)"; CACHE_MB="${CACHE_MB:-256}"
BRANCH="$(md branch)"; BRANCH="${BRANCH:-bitflow-hardening-and-features}"
JWT_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEK0NV+XvppsCb4EI0HsZMoXVmmDV1\nh+cA0JIYRZYCy/+sWT8w6TPV7YceiLo+spUPsVxHznGJxlzV5ZuvdQ+24g==\n-----END PUBLIC KEY-----'

# The image build is the memory peak (and a 1 GB VM has no room for it without swap)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# BBR congestion control: better throughput for waveform replies
cat > /etc/sysctl.d/99-bitflow.conf <<'SYSCTL'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
SYSCTL
sysctl --system || true

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io docker-compose-v2 git
systemctl enable --now docker

mkdir -p /opt/bitflow && cd /opt/bitflow
[ -d repo ] || git clone --branch "$BRANCH" https://github.com/yash9723/BitFlow_2.0-1 repo

echo "DOMAIN=$DOMAIN" > .env
cat > api.env <<ENVFILE
JWT_PUBLIC_KEY='$JWT_PUBLIC_KEY'
MAX_CONCURRENT_SIMULATIONS=$MAX_CONCURRENT
MAX_HEAVY_SIMULATIONS=1
RESULT_CACHE_MB=$CACHE_MB
TIMEOUT_SECONDS=30
ENVFILE

cat > docker-compose.yml <<'COMPOSE'
services:
  api:
    build:
      context: ./repo
      dockerfile: Dockerfile.api
    restart: always
    env_file: api.env
    expose: ["8080"]
  caddy:
    image: caddy:2.8.4
    restart: always
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from ${DOMAIN} --to api:8080
    volumes: ["caddy-data:/data"]
    depends_on: [api]
volumes:
  caddy-data:
COMPOSE

# This VM doesn't redeploy on every push; a nightly timer keeps it current (a stale API would 404 on endpoints
# the site has started to use).
cat > update.sh <<UPDATE
#!/bin/sh
set -e
cd /opt/bitflow/repo
git fetch -q origin $BRANCH
if [ "\$(git rev-parse HEAD)" != "\$(git rev-parse origin/$BRANCH)" ]; then
  git reset -q --hard origin/$BRANCH
  cd /opt/bitflow && docker compose up -d --build api
  docker image prune -f
fi
UPDATE
chmod +x update.sh
cat > /etc/systemd/system/bitflow-update.service <<'UNIT'
[Unit]
Description=Update the BitFlow simulator from git
[Service]
Type=oneshot
ExecStart=/opt/bitflow/update.sh
UNIT
cat > /etc/systemd/system/bitflow-update.timer <<'UNIT'
[Unit]
Description=Nightly BitFlow simulator update
[Timer]
OnCalendar=*-*-* 21:00:00 UTC
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload && systemctl enable --now bitflow-update.timer

docker compose up -d --build
echo "bitflow setup finished"
