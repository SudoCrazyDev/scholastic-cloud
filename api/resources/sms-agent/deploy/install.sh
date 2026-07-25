#!/usr/bin/env bash
# Install the ScholasticCloud SMS gateway agent as a systemd service on Linux
# (including Raspberry Pi OS Lite). Run as root from the extracted sms_gateway/:
#
#   sudo ./deploy/install.sh
#
set -euo pipefail

APP_DIR=/opt/sms_gateway
SERVICE_USER=smsgw
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root:  sudo ./deploy/install.sh" >&2
  exit 1
fi

# ── System dependencies (best-effort; skipped if apt-get is unavailable) ──────
if command -v apt-get >/dev/null 2>&1; then
  echo "==> Installing system packages (build tools, usb-modeswitch)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null 2>&1 || true
  # build-essential + python3 let serialport compile if no prebuilt binary exists;
  # usb-modeswitch flips dongles that boot in CD-ROM/storage mode into modem mode.
  apt-get install -y build-essential python3 usb-modeswitch usb-modeswitch-data >/dev/null 2>&1 || \
    echo "   (could not install all packages; continuing)"
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
echo "==> Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Node.js not found. Install Node 18+ first, e.g.:
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
Then re-run this installer.
EOF
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node $(node -v) is too old; please install Node 18+." >&2
  exit 1
fi

echo "==> Creating service user '$SERVICE_USER' (in dialout for modem access)"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
usermod -aG dialout "$SERVICE_USER"

echo "==> Copying files to $APP_DIR"
mkdir -p "$APP_DIR"
cp -r "$SRC_DIR/package.json" "$SRC_DIR/package-lock.json" "$SRC_DIR/tsconfig.json" "$SRC_DIR/src" "$APP_DIR/" 2>/dev/null || \
  cp -r "$SRC_DIR/package.json" "$SRC_DIR/tsconfig.json" "$SRC_DIR/src" "$APP_DIR/"
cp -r "$SRC_DIR/deploy" "$APP_DIR/"
# Config precedence: portal-downloaded sms-gateway.env, then .env, then the example.
if [ -f "$SRC_DIR/sms-gateway.env" ]; then
  cp "$SRC_DIR/sms-gateway.env" "$APP_DIR/sms-gateway.env"
elif [ -f "$SRC_DIR/.env" ]; then
  cp "$SRC_DIR/.env" "$APP_DIR/.env"
else
  cp "$SRC_DIR/.env.example" "$APP_DIR/.env"
fi

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
  1. (Optional) Set SERIAL_PORT in $APP_DIR/sms-gateway.env — leave blank to auto-detect the modem.
  2. Pair the kiosk:   cd $APP_DIR && sudo -u $SERVICE_USER node dist/index.js --pair <PAIRING_CODE>
  3. Enable + start:   sudo systemctl enable --now sms-gateway
  4. Logs:             journalctl -u sms-gateway -f

The agent auto-detects the USB GSM modem, so a udev symlink is optional. If you
want a stable device path anyway, see deploy/99-gsm-modem.rules.
EOF
