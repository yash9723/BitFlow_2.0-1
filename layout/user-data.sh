#!/bin/bash
# layout/user-data.sh: first-boot setup for the BitFlow layout server (EC2, Ubuntu 24.04, t3.medium, 30 GB disk).
# Installs Docker, pulls the pinned OpenROAD image, runs layout/app.py as a systemd service on 127.0.0.1:8090
# and puts Caddy in front for HTTPS ($DOMAIN's DNS A record must point here). Reached by SSM, no SSH.
# Only the JWT PUBLIC key is set here (paste it into /opt/bitflow-layout/layout.env after boot): nothing secret.
set -euxo pipefail
exec > >(tee /var/log/bitflow-layout-setup.log) 2>&1

DOMAIN=layout.bitflowvlsi.tech
BRANCH=feat/layout-service
ORFS_IMAGE=openroad/orfs@sha256:d64a1e6edb83726c4816e2ae2144fbd5691f7b67403db0e86789cb30a2763d06

fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io git python3-venv
systemctl enable --now docker

# The service runs as uid 1000 (ubuntu), the same uid as the job containers, so job folders are writable by both.
# It starts containers, so it's in the docker group (root-equivalent on this box: nothing else runs here).
usermod -aG docker ubuntu
mkdir -p /opt/bitflow-layout /var/lib/bitflow-layout/jobs && chown -R ubuntu:ubuntu /opt/bitflow-layout /var/lib/bitflow-layout

cd /opt/bitflow-layout
git clone --depth 1 --branch "$BRANCH" https://github.com/yash9723/BitFlow_2.0-1 repo
python3 -m venv venv && venv/bin/pip install -q -r repo/layout/requirements.txt
docker pull "$ORFS_IMAGE"

cat > layout.env <<ENV
ORFS_IMAGE=$ORFS_IMAGE
JOBS_DIR=/var/lib/bitflow-layout/jobs
WORKERS=1
MAX_QUEUE=20
JOB_TIMEOUT_S=420
JOB_MEMORY=2g
JOB_CPUS=2
JWT_PUBLIC_KEY=
ENV
chown -R ubuntu:ubuntu /opt/bitflow-layout

cat > /etc/systemd/system/bitflow-layout.service <<'UNIT'
[Unit]
Description=BitFlow layout (RTL to GDS) service
After=docker.service
Requires=docker.service
[Service]
User=ubuntu
WorkingDirectory=/opt/bitflow-layout/repo/layout
EnvironmentFile=/opt/bitflow-layout/layout.env
ExecStart=/opt/bitflow-layout/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8090
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now bitflow-layout

docker run -d --name caddy --restart always --network host -v caddy-data:/data caddy:2.8.4 \
  caddy reverse-proxy --from "$DOMAIN" --to 127.0.0.1:8090
