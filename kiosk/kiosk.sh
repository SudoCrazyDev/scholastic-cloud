#!/usr/bin/env bash
# Launch Chromium in kiosk mode and hold it there.
#
# Installed to /usr/local/bin/kiosk.sh and started by the desktop session on
# every boot/login (see install-kiosk.sh). Settings come from /etc/default/kiosk
# so you never have to edit this file on the device.
#
# Logs:  journalctl -t kiosk        (this script)
#        ~/.local/state/kiosk.log   (Chromium's own output)
set -uo pipefail

CONFIG_FILE=${KIOSK_CONFIG:-/etc/default/kiosk}

# ── Defaults (override in /etc/default/kiosk) ────────────────────────────────
KIOSK_URL="https://example.com"
KIOSK_PROFILE="$HOME/.config/chromium-kiosk"
KIOSK_WAIT_FOR_NETWORK=1     # wait for NetworkManager to report online
KIOSK_WAIT_FOR_URL=1         # then wait until the host answers at all
KIOSK_WAIT_TIMEOUT=90        # seconds to spend waiting before starting anyway
KIOSK_RESPAWN=1              # relaunch Chromium if it exits or is closed
KIOSK_DISABLE_BLANKING=1     # stop the screen from sleeping
KIOSK_ALLOW_CAMERA=0         # auto-grant camera/mic (set 1 for scanner pages)
KIOSK_EXTRA_FLAGS=""         # any extra Chromium flags, space separated

# shellcheck source=/dev/null
[ -r "$CONFIG_FILE" ] && . "$CONFIG_FILE"

LOG_DIR=${XDG_STATE_HOME:-$HOME/.local/state}
LOG_FILE="$LOG_DIR/kiosk.log"
mkdir -p "$LOG_DIR"

say() { logger -t kiosk -- "$*" 2>/dev/null || true; echo "kiosk: $*" >&2; }

# ── Only ever one kiosk per session ─────────────────────────────────────────
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/kiosk.lock"
exec 9>"$LOCK_FILE" || true
if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
  say "another instance is already running; nothing to do"
  exit 0
fi

# ── Find Chromium ───────────────────────────────────────────────────────────
CHROMIUM=""
for candidate in chromium-browser chromium /usr/bin/chromium-browser /usr/bin/chromium; do
  if command -v "$candidate" >/dev/null 2>&1; then
    CHROMIUM=$(command -v "$candidate")
    break
  fi
done
if [ -z "$CHROMIUM" ]; then
  say "Chromium not found. Install it with:  sudo apt-get install -y chromium-browser"
  exit 1
fi

if [ -z "${KIOSK_URL:-}" ] || [ "$KIOSK_URL" = "https://example.com" ]; then
  say "KIOSK_URL is not set yet — edit $CONFIG_FILE and set the page to open."
  exit 1
fi

# ── Keep the screen awake ───────────────────────────────────────────────────
if [ "$KIOSK_DISABLE_BLANKING" = "1" ]; then
  # Wayland (labwc/wayfire): swayidle is what blanks the Pi's screen.
  pkill -x swayidle >/dev/null 2>&1 || true
  command -v wlopm >/dev/null 2>&1 && wlopm --on '*' >/dev/null 2>&1 || true
  # X11 fallback, in case this ever runs under an X session.
  if [ -n "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then
    xset s off || true
    xset -dpms || true
    xset s noblank || true
  fi
fi

# ── Wait for the network, but never wait forever ─────────────────────────────
deadline=$(( $(date +%s) + KIOSK_WAIT_TIMEOUT ))

if [ "$KIOSK_WAIT_FOR_NETWORK" = "1" ] && command -v nm-online >/dev/null 2>&1; then
  say "waiting for network"
  nm-online -q -t "$KIOSK_WAIT_TIMEOUT" || say "network still not up; continuing"
fi

case "$KIOSK_URL" in
  http://*|https://*)
    if [ "$KIOSK_WAIT_FOR_URL" = "1" ] && command -v curl >/dev/null 2>&1; then
      say "waiting for $KIOSK_URL to answer"
      until curl -s -o /dev/null --max-time 5 "$KIOSK_URL"; do
        if [ "$(date +%s)" -ge "$deadline" ]; then
          say "host did not answer in time; starting anyway"
          break
        fi
        sleep 3
      done
    fi
    ;;
esac

# ── Chromium flags ──────────────────────────────────────────────────────────
flags=(
  --kiosk
  --user-data-dir="$KIOSK_PROFILE"
  --noerrdialogs
  --disable-infobars
  --disable-session-crashed-bubble
  --hide-crash-restore-bubble
  --no-first-run
  --no-default-browser-check
  --disable-features=Translate,TranslateUI
  --disable-pinch
  --overscroll-history-navigation=0
  --autoplay-policy=no-user-gesture-required
  --password-store=basic
  --check-for-update-interval=31536000
  --disable-component-update
)

# Chromium picks Wayland up on its own on Pi OS, but be explicit when we know.
[ -n "${WAYLAND_DISPLAY:-}" ] && flags+=(--ozone-platform=wayland)

# Auto-grant camera/mic without a prompt — for scanner pages that need it.
[ "$KIOSK_ALLOW_CAMERA" = "1" ] && flags+=(--use-fake-ui-for-media-stream)

if [ -n "${KIOSK_EXTRA_FLAGS:-}" ]; then
  read -ra extra <<<"$KIOSK_EXTRA_FLAGS"
  flags+=("${extra[@]}")
fi

# ── Run, and put it back if it dies ─────────────────────────────────────────
say "starting Chromium at $KIOSK_URL"

while :; do
  # A hard power-off leaves Chromium thinking it crashed, which shows a
  # "restore pages?" bar over the kiosk. Clear that before each start.
  prefs="$KIOSK_PROFILE/Default/Preferences"
  if [ -f "$prefs" ]; then
    sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
      "$prefs" 2>/dev/null || true
  fi

  "$CHROMIUM" "${flags[@]}" "$KIOSK_URL" >>"$LOG_FILE" 2>&1
  rc=$?

  if [ "$KIOSK_RESPAWN" != "1" ]; then
    say "Chromium exited (rc=$rc); respawn disabled"
    break
  fi
  say "Chromium exited (rc=$rc); restarting in 3s"
  sleep 3
done
