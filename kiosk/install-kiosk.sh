#!/usr/bin/env bash
# Install the Chromium kiosk so it opens on every boot.
#
# Run as YOUR DESKTOP USER (the one that auto-logs in) — not root. It uses sudo
# only for the two system files:
#
#   ./install-kiosk.sh              install / re-install
#   ./install-kiosk.sh --uninstall  remove the autostart entry and system files
#
# Tested on Raspberry Pi OS Bookworm Desktop (labwc and wayfire).
set -euo pipefail

LAUNCHER=/usr/local/bin/kiosk.sh
CONFIG=/etc/default/kiosk
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKER="ScholasticCloud kiosk"

say()  { echo "==> $*"; }
die()  { echo "error: $*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run as your desktop user, not root (it will sudo when needed)"

# ── Which compositor is this session? ───────────────────────────────────────
detect_session() {
  # What's actually running wins over what's merely installed.
  pgrep -x labwc   >/dev/null 2>&1 && { echo labwc;   return; }
  pgrep -x wayfire >/dev/null 2>&1 && { echo wayfire; return; }
  [ -d "$HOME/.config/labwc" ]     && { echo labwc;   return; }
  [ -f "$HOME/.config/wayfire.ini" ] && { echo wayfire; return; }
  command -v labwc   >/dev/null 2>&1 && { echo labwc;   return; }
  command -v wayfire >/dev/null 2>&1 && { echo wayfire; return; }
  echo xdg   # fall back to the generic freedesktop autostart directory
}

# ── labwc:  ~/.config/labwc/autostart ───────────────────────────────────────
labwc_file() { echo "$HOME/.config/labwc/autostart"; }

install_labwc() {
  local file; file=$(labwc_file)
  mkdir -p "$(dirname "$file")"
  # A user autostart REPLACES the system one, so seed from it or we'd lose the
  # panel, desktop icons and the rest of the Pi desktop.
  if [ ! -f "$file" ] && [ -f /etc/xdg/labwc/autostart ]; then
    say "seeding $file from /etc/xdg/labwc/autostart"
    cp /etc/xdg/labwc/autostart "$file"
  fi
  touch "$file"
  if grep -qF "$LAUNCHER" "$file"; then
    say "labwc autostart already starts the kiosk"
    return
  fi
  printf '\n# %s\n%s &\n' "$MARKER" "$LAUNCHER" >>"$file"
  say "added the kiosk to $file"
}

uninstall_labwc() {
  local file; file=$(labwc_file)
  [ -f "$file" ] || return 0
  # grep -v exits 1 when it filters out every line, so don't gate mv on it.
  grep -vF -e "$LAUNCHER" -e "# $MARKER" "$file" >"$file.tmp" || true
  mv "$file.tmp" "$file"
  say "removed the kiosk from $file"
}

# ── wayfire:  [autostart] section of ~/.config/wayfire.ini ──────────────────
wayfire_file() { echo "$HOME/.config/wayfire.ini"; }

install_wayfire() {
  local file; file=$(wayfire_file)
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || printf '[autostart]\n' >"$file"
  if grep -qF "$LAUNCHER" "$file"; then
    say "wayfire.ini already starts the kiosk"
    return
  fi
  if grep -q '^\[autostart\]' "$file"; then
    awk -v line="kiosk = $LAUNCHER" '
      /^\[autostart\]/ && !added { print; print line; added=1; next }
      { print }
    ' "$file" >"$file.tmp" && mv "$file.tmp" "$file"
  else
    printf '\n[autostart]\nkiosk = %s\n' "$LAUNCHER" >>"$file"
  fi
  say "added the kiosk to $file"
}

uninstall_wayfire() {
  local file; file=$(wayfire_file)
  [ -f "$file" ] || return 0
  grep -vF "$LAUNCHER" "$file" >"$file.tmp" || true
  mv "$file.tmp" "$file"
  say "removed the kiosk from $file"
}

# ── generic freedesktop autostart ───────────────────────────────────────────
xdg_file() { echo "$HOME/.config/autostart/scholasticcloud-kiosk.desktop"; }

install_xdg() {
  local file; file=$(xdg_file)
  mkdir -p "$(dirname "$file")"
  cat >"$file" <<EOF
[Desktop Entry]
Type=Application
Name=ScholasticCloud Kiosk
Comment=$MARKER
Exec=$LAUNCHER
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
  say "wrote $file"
}

uninstall_xdg() { rm -f "$(xdg_file)"; say "removed $(xdg_file)"; }

# ── Go ──────────────────────────────────────────────────────────────────────
SESSION=$(detect_session)

if [ "${1:-}" = "--uninstall" ]; then
  say "Uninstalling (detected session: $SESSION)"
  uninstall_labwc || true
  uninstall_wayfire || true
  uninstall_xdg || true
  sudo rm -f "$LAUNCHER"
  say "left $CONFIG in place (delete it yourself if you want the URL gone)"
  say "Done. Stop the running kiosk with:  pkill -f kiosk.sh; pkill chromium"
  exit 0
fi

[ -f "$SRC_DIR/kiosk.sh" ] || die "kiosk.sh not found next to this script"

say "Detected session: $SESSION"

if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  say "Chromium is not installed — installing it now"
  sudo apt-get update -y >/dev/null 2>&1 || true
  sudo apt-get install -y chromium-browser >/dev/null 2>&1 \
    || sudo apt-get install -y chromium >/dev/null 2>&1 \
    || die "could not install Chromium; install it manually and re-run"
fi

say "Installing $LAUNCHER"
sudo install -m 0755 "$SRC_DIR/kiosk.sh" "$LAUNCHER"

if [ -e "$CONFIG" ]; then
  say "Keeping your existing $CONFIG"
else
  say "Installing $CONFIG"
  sudo install -m 0644 "$SRC_DIR/kiosk.default" "$CONFIG"
fi

case "$SESSION" in
  labwc)   install_labwc ;;
  wayfire) install_wayfire ;;
  *)       install_xdg ;;
esac

# $CONFIG is world-readable, so no sudo needed just to report the current URL.
CURRENT_URL=$(sh -c ". '$CONFIG' 2>/dev/null; echo \"\$KIOSK_URL\"" 2>/dev/null || true)

cat <<EOF

Installed.

  1. Set the page to open:
       sudo nano $CONFIG        # KIOSK_URL is currently: ${CURRENT_URL:-unset}

  2. Try it now, without rebooting:
       $LAUNCHER

  3. Confirm it survives a reboot:
       sudo reboot

Handy afterwards:
  pkill chromium              restart the browser (kiosk.sh puts it back)
  pkill -f kiosk.sh           stop the kiosk for this session
  journalctl -t kiosk         what kiosk.sh did
  tail -f ~/.local/state/kiosk.log    Chromium's own output
  $(basename "$0") --uninstall  undo all of this
EOF
