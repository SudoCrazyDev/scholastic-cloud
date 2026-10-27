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
MENU=/usr/local/bin/kiosk        # same script; run under this name it opens the menu
CONFIG=/etc/default/kiosk
# A copy of this folder, so the menu can always uninstall/re-install even after
# the USB stick or scp'd folder it came from is gone.
LIB_DIR=/usr/local/lib/scholasticcloud-kiosk
SOURCE_RECORD=${XDG_CONFIG_HOME:-$HOME/.config}/kiosk-source
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
  sudo rm -f "$LAUNCHER" "$MENU"
  sudo rm -rf "$LIB_DIR"
  rm -f "$SOURCE_RECORD"
  say "left $CONFIG in place (delete it yourself if you want the URL gone)"
  say "Done. Stop a kiosk that is still running with:  pkill -f kiosk.sh; pkill chromium"
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
sudo ln -sf "$LAUNCHER" "$MENU"

# Re-running from $LIB_DIR itself (the menu's uninstall does) must not copy
# files onto themselves, or record $LIB_DIR as where updates come from.
if [ "$SRC_DIR" != "$LIB_DIR" ]; then
  sudo install -d "$LIB_DIR"
  sudo install -m 0755 "$SRC_DIR/install-kiosk.sh" "$SRC_DIR/kiosk.sh" "$LIB_DIR/"
  sudo install -m 0644 "$SRC_DIR/kiosk.default" "$LIB_DIR/"
  mkdir -p "$(dirname "$SOURCE_RECORD")"
  echo "$SRC_DIR" >"$SOURCE_RECORD"
fi

if [ -e "$CONFIG" ]; then
  say "Keeping your existing $CONFIG"

  # A download from the portal's Gate Entries page carries the gate's URL (with
  # a one-time pairing code on it). Apply just that line over an existing config
  # so re-pairing a kiosk is running the new download, while any other setting
  # someone tuned by hand survives. Not when re-running from $LIB_DIR: that copy
  # is the last install's, and its code has long been used.
  BUNDLED_URL=$(sh -c ". '$SRC_DIR/kiosk.default' 2>/dev/null; echo \"\$KIOSK_URL\"" 2>/dev/null || true)
  if [ "$SRC_DIR" != "$LIB_DIR" ] && [ -n "$BUNDLED_URL" ] && [ "$BUNDLED_URL" != "https://example.com" ]; then
    say "Setting KIOSK_URL from this download"
    if grep -q '^KIOSK_URL=' "$CONFIG"; then
      sudo sed -i "s|^KIOSK_URL=.*|KIOSK_URL=\"$BUNDLED_URL\"|" "$CONFIG"
    else
      echo "KIOSK_URL=\"$BUNDLED_URL\"" | sudo tee -a "$CONFIG" >/dev/null
    fi
  fi
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

if [ -n "$CURRENT_URL" ] && [ "$CURRENT_URL" != "https://example.com" ]; then
  STEP_ONE="The page to open is already set (change it with  sudo nano $CONFIG):
       $CURRENT_URL"
else
  STEP_ONE="Set the page to open:
       sudo nano $CONFIG        # KIOSK_URL is currently: ${CURRENT_URL:-unset}"
fi

cat <<EOF

Installed.

  1. $STEP_ONE

  2. Try it now, without rebooting:
       kiosk start

  3. Confirm it survives a reboot:
       sudo reboot

Afterwards, run  kiosk  (over SSH or on Ctrl-Alt-F2) for a menu to restart,
stop, update, clear the cache, read the logs or uninstall.  kiosk help  lists
the same actions as commands.
EOF
