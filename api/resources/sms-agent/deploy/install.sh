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
cp -r "$SRC_DIR/package.json" "$SRC_DIR/tsconfig.json" "$SRC_DIR/src" "$SRC_DIR/scripts" "$SRC_DIR/deploy" "$APP_DIR/"
[ -f "$SRC_DIR/package-lock.json" ] && cp "$SRC_DIR/package-lock.json" "$APP_DIR/"
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

Installed. From $APP_DIR run these (short) commands:
  cd $APP_DIR
  1. (Optional) Set SERIAL_PORT in sms-gateway.env — leave blank to auto-detect the modem.
  2. Pair:           sudo -u $SERVICE_USER npm run pair -- <PAIRING_CODE>
  3. Enable + start: npm run enable-start
  4. Logs:           npm run logs
  Also available:    npm run status | npm run restart | npm run stop | npm run list-ports

The agent auto-detects the USB GSM modem, so a udev symlink is optional. If you
want a stable device path anyway, see deploy/99-gsm-modem.rules.
EOF
