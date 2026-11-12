#!/bin/bash
# aws/user-data.sh: first-boot setup for the BitFlow simulator on an EC2 Ubuntu 24.04 server.
# Installs Docker, builds the simulator image from Dockerfile.api, and serves it over HTTPS
# (Caddy gets a Let's Encrypt certificate for $DOMAIN once its DNS A record points here).
# Public key only: the API verifies tokens, it never signs them, so nothing here is secret.
set -euxo pipefail
exec > >(tee /var/log/bitflow-setup.log) 2>&1

DOMAIN=sim.bitflowvlsi.tech
BRANCH=bitflow-hardening-and-features
JWT_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEK0NV+XvppsCb4EI0HsZMoXVmmDV1\nh+cA0JIYRZYCy/+sWT8w6TPV7YceiLo+spUPsVxHznGJxlzV5ZuvdQ+24g==\n-----END PUBLIC KEY-----'

# The image build is the memory peak on a 2 GB server
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# BBR congestion control: better throughput over the ~200 ms path between Sydney and Vercel in Virginia
# (waveforms travel in the replies).
cat > /etc/sysctl.d/99-bitflow.conf <<'EOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
sysctl --system || true

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io docker-compose-v2 git
systemctl enable --now docker

mkdir -p /opt/bitflow && cd /opt/bitflow
git clone --branch "$BRANCH" https://github.com/yash9723/BitFlow_2.0-1 repo

echo "DOMAIN=$DOMAIN" > .env
cat > api.env <<EOF
JWT_PUBLIC_KEY='$JWT_PUBLIC_KEY'
MAX_CONCURRENT_SIMULATIONS=2
MAX_HEAVY_SIMULATIONS=2
RESULT_CACHE_MB=256
TIMEOUT_SECONDS=30
EOF

cat > docker-compose.yml <<'EOF'
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
EOF

# Render redeploys on every push; this server doesn't, so a nightly timer keeps it current
# (a stale API would 404 on endpoints the site has started to use).
cat > update.sh <<EOF
#!/bin/sh
set -e
cd /opt/bitflow/repo
git fetch -q origin $BRANCH
if [ "\$(git rev-parse HEAD)" != "\$(git rev-parse origin/$BRANCH)" ]; then
  git reset -q --hard origin/$BRANCH
  cd /opt/bitflow && docker compose up -d --build api
  docker image prune -f
fi
EOF
chmod +x update.sh
cat > /etc/systemd/system/bitflow-update.service <<'EOF'
[Unit]
Description=Update the BitFlow simulator from git
[Service]
Type=oneshot
ExecStart=/opt/bitflow/update.sh
EOF
cat > /etc/systemd/system/bitflow-update.timer <<'EOF'
[Unit]
Description=Nightly BitFlow simulator update
[Timer]
OnCalendar=*-*-* 21:00:00 UTC
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload && systemctl enable --now bitflow-update.timer

docker compose up -d --build
echo "bitflow setup finished"
