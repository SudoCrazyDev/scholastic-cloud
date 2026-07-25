#!/usr/bin/env bash
# Install the SMS gateway agent as a systemd service on Linux (incl. Raspberry Pi OS Lite).
# Run as root from the repo's sms_gateway/ directory:  sudo ./deploy/install.sh
set -euo pipefail

APP_DIR=/opt/sms_gateway
SERVICE_USER=smsgw
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node 18+ first (e.g. via nodesource or 'apt install nodejs')." >&2
  exit 1
fi

echo "==> Creating service user '$SERVICE_USER' (in dialout for modem access)"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
usermod -aG dialout "$SERVICE_USER"

echo "==> Copying files to $APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$SRC_DIR/package.json" "$SRC_DIR/tsconfig.json" "$SRC_DIR/src" "$APP_DIR/"
[ -f "$SRC_DIR/.env" ] && cp "$SRC_DIR/.env" "$APP_DIR/.env" || cp "$SRC_DIR/.env.example" "$APP_DIR/.env"

echo "==> Installing dependencies and building"
cd "$APP_DIR"
npm install --omit=dev
npm install --no-save typescript
npx tsc -p tsconfig.json
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

echo "==> Installing systemd unit"
cp "$SRC_DIR/deploy/sms-gateway.service" /etc/systemd/system/sms-gateway.service
systemctl daemon-reload

cat <<EOF

Installed. Next steps:
  1. Edit $APP_DIR/.env  (set API_BASE_URL; SERIAL_PORT optional)
  2. Pair the kiosk:   cd $APP_DIR && sudo -u $SERVICE_USER node dist/index.js --pair <PAIRING_CODE>
  3. Enable + start:   sudo systemctl enable --now sms-gateway
  4. Logs:             journalctl -u sms-gateway -f
EOF
