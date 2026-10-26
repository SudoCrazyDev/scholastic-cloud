#!/usr/bin/env bash
# Launch Chromium in kiosk mode and hold it there — and, run as `kiosk`, give
# whoever is at the device a menu to stop, restart, update or remove it.
#
# Installed to /usr/local/bin/kiosk.sh (with /usr/local/bin/kiosk linked to it)
# and started by the desktop session on every boot/login (see install-kiosk.sh).
# Settings come from /etc/default/kiosk so you never have to edit this file on
# the device.
#
#   kiosk.sh            run the kiosk — what the desktop session starts
#   kiosk               the maintenance menu, over SSH or on Ctrl-Alt-F2
#   kiosk <command>     one menu action directly; `kiosk help` lists them
#
# Logs:  journalctl -t kiosk        (this script)
#        ~/.local/state/kiosk.log   (Chromium's own output)
set -uo pipefail

SELF=$(readlink -f "$0")
CONFIG_FILE=${KIOSK_CONFIG:-/etc/default/kiosk}
LAUNCHER=/usr/local/bin/kiosk.sh
LIB_DIR=/usr/local/lib/scholasticcloud-kiosk          # installer keeps a copy here
SOURCE_RECORD=${XDG_CONFIG_HOME:-$HOME/.config}/kiosk-source   # where it was installed from

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

# An SSH or Ctrl-Alt-F2 login usually has this already, but the lock below has
# to land on the same path the desktop session's copy uses.
if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/kiosk.lock"

say() { logger -t kiosk -- "$*" 2>/dev/null || true; echo "kiosk: $*" >&2; }
die() { echo "kiosk: $*" >&2; exit 1; }

find_chromium() {
  local candidate
  for candidate in chromium-browser chromium /usr/bin/chromium-browser /usr/bin/chromium; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

# ── Which processes are the kiosk ───────────────────────────────────────────
# The run loop is the only invocation whose command line ends in `kiosk.sh` or
# `kiosk.sh run …` — the menu and its commands never do — so this can't match
# the copy of the script that is asking. Requiring bash in front keeps an
# editor that has the file open out of it.
loop_pids() { pgrep -u "$(id -u)" -f 'bash [^ ]*kiosk\.sh( run.*)?$'; }
# Matching on the kiosk profile leaves any ordinary Chromium window alone.
browser_pids() { pgrep -u "$(id -u)" -f -- "--user-data-dir=$KIOSK_PROFILE( |\$)"; }

# ── Run, and put it back if it dies ─────────────────────────────────────────
run_kiosk() {
  if [ "${1:-}" = "--no-wait" ]; then
    KIOSK_WAIT_FOR_NETWORK=0
    KIOSK_WAIT_FOR_URL=0
  fi

  # Only ever one kiosk per session.
  exec 9>"$LOCK_FILE" || true
  if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
    say "another instance is already running; nothing to do"
    exit 0
  fi

  local CHROMIUM
  if ! CHROMIUM=$(find_chromium); then
    say "Chromium not found. Install it with:  sudo apt-get install -y chromium-browser"
    exit 1
  fi

  if [ -z "${KIOSK_URL:-}" ] || [ "$KIOSK_URL" = "https://example.com" ]; then
    say "KIOSK_URL is not set yet — edit $CONFIG_FILE and set the page to open."
    exit 1
  fi

  # Keep the screen awake.
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

  # Wait for the network, but never wait forever.
  local deadline=$(( $(date +%s) + KIOSK_WAIT_TIMEOUT ))

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

  local flags=(
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
    local extra
    read -ra extra <<<"$KIOSK_EXTRA_FLAGS"
    flags+=("${extra[@]}")
  fi

  say "starting Chromium at $KIOSK_URL"

  local prefs rc
  while :; do
    # A hard power-off leaves Chromium thinking it crashed, which shows a
    # "restore pages?" bar over the kiosk. Clear that before each start.
    prefs="$KIOSK_PROFILE/Default/Preferences"
    if [ -f "$prefs" ]; then
      sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
        "$prefs" 2>/dev/null || true
    fi

    # 9>&- so Chromium doesn't inherit the lock and hold it after we're gone.
    "$CHROMIUM" "${flags[@]}" "$KIOSK_URL" >>"$LOG_FILE" 2>&1 9>&-
    rc=$?

    if [ "$KIOSK_RESPAWN" != "1" ]; then
      say "Chromium exited (rc=$rc); respawn disabled"
      break
    fi
    say "Chromium exited (rc=$rc); restarting in 3s"
    sleep 3
  done
}

# ── Start / stop from outside the desktop session ───────────────────────────
# Over SSH or on a text console there is no display in the environment, so find
# the desktop session's own socket. Never trust DISPLAY over SSH — with X
# forwarding on, it would open the kiosk on the technician's laptop.
attach_session() {
  [ -n "${WAYLAND_DISPLAY:-}" ] && return 0
  [ -z "${SSH_CONNECTION:-}" ] && [ -n "${DISPLAY:-}" ] && return 0
  unset DISPLAY

  local sock
  for sock in "${XDG_RUNTIME_DIR:-/nonexistent}"/wayland-*; do
    case "$sock" in *.lock) continue ;; esac
    if [ -S "$sock" ]; then
      export WAYLAND_DISPLAY="${sock##*/}"
      break
    fi
  done
  if [ -z "${WAYLAND_DISPLAY:-}" ]; then
    [ -S /tmp/.X11-unix/X0 ] || return 1
    export DISPLAY=:0
    [ -f "$HOME/.Xauthority" ] && export XAUTHORITY="$HOME/.Xauthority"
  fi
  if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "${XDG_RUNTIME_DIR:-}/bus" ]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  fi
}

start_kiosk() {
  if [ -n "$(loop_pids)" ]; then
    echo "The kiosk is already running."
    return 0
  fi
  if ! attach_session; then
    echo "No desktop session is running to open Chromium in."
    echo "Check Desktop Autologin is on (sudo raspi-config), then reboot."
    return 1
  fi
  setsid -f "$SELF" run "$@" </dev/null >/dev/null 2>&1
  sleep 2
  if [ -n "$(loop_pids)" ]; then
    echo "Started."
  else
    echo "It didn't stay up. See why with:  journalctl -t kiosk -n 20"
    return 1
  fi
}

stop_kiosk() {
  local pids
  # The loop first — kill Chromium first and the loop just brings it back.
  pids=$(loop_pids)
  # shellcheck disable=SC2086
  [ -n "$pids" ] && kill $pids 2>/dev/null
  pids=$(browser_pids)
  # shellcheck disable=SC2086
  [ -n "$pids" ] && kill $pids 2>/dev/null

  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ -z "$(browser_pids)" ] && break
    sleep 0.5
  done
  pids=$(browser_pids)
  # shellcheck disable=SC2086
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  say "kiosk stopped"
}

restart_kiosk() {
  stop_kiosk
  sleep 1
  start_kiosk "$@"
}

# Throws away Chromium's HTTP and shader caches so the next start fetches the
# app fresh. Local Storage and IndexedDB stay: that is where a gate keeps its
# pairing token, its roster and any scans still waiting to upload.
clear_cache() {
  stop_kiosk
  # Chromium keeps the disk cache under ~/.cache/<profile name> when the profile
  # lives in ~/.config, and inside the profile otherwise — clear both.
  local base dir
  for base in "${KIOSK_PROFILE:?}" "${XDG_CACHE_HOME:-$HOME/.cache}/${KIOSK_PROFILE##*/}"; do
    for dir in "Default/Cache" "Default/Code Cache" "Default/GPUCache" \
               GrShaderCache ShaderCache GraphiteDawnCache; do
      rm -rf -- "${base:?}/$dir"
    done
  done
  echo "Cache cleared (pairing and queued scans kept)."
  start_kiosk
}

# Re-installs from the folder the kiosk was installed from — after copying new
# files over it, or straight from git if that folder is a checkout.
update_kiosk() {
  local src="" answer
  [ -r "$SOURCE_RECORD" ] && src=$(cat "$SOURCE_RECORD")
  read -rp "Folder with the new kiosk files [${src:-none}]: " answer
  src=${answer:-$src}
  if [ -z "$src" ] || [ ! -f "$src/install-kiosk.sh" ]; then
    echo "No install-kiosk.sh in '${src}'. Copy the new kiosk folder onto the device first."
    return 1
  fi
  src=$(cd "$src" && pwd)

  if git -C "$src" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Pulling the latest from git..."
    git -C "$src" pull --ff-only || { echo "git pull failed; nothing changed."; return 1; }
  fi

  bash "$src/install-kiosk.sh" || return 1
  # The new copy does the restart, so a changed run loop takes effect now.
  "$LAUNCHER" restart
}

update_chromium() {
  local pkgs=() p
  for p in chromium chromium-browser rpi-chromium-mods; do
    dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed" && pkgs+=("$p")
  done
  if [ ${#pkgs[@]} -eq 0 ]; then
    echo "Chromium wasn't installed with apt on this device; nothing to update."
    return 1
  fi
  sudo apt-get update && sudo apt-get install -y --only-upgrade "${pkgs[@]}" || return 1
  restart_kiosk
}

show_status() {
  local chromium server
  if [ -n "$(loop_pids)" ]; then echo "Kiosk:      running"; else echo "Kiosk:      stopped"; fi
  if [ -n "$(browser_pids)" ]; then echo "Browser:    open"; else echo "Browser:    closed"; fi
  echo "Page:       $KIOSK_URL"
  if curl -s -o /dev/null --max-time 5 "$KIOSK_URL" 2>/dev/null; then server="answering"; else server="NOT answering"; fi
  echo "Server:     $server"
  echo "IP address: $(hostname -I 2>/dev/null || echo unknown)"
  if chromium=$(find_chromium); then
    echo "Chromium:   $("$chromium" --version 2>/dev/null | head -n1)"
  else
    echo "Chromium:   not installed"
  fi
  echo "Up for:     $(uptime -p 2>/dev/null || echo unknown)"
  echo "Disk free:  $(df -h --output=avail / 2>/dev/null | tail -n1 | tr -d ' ')"
}

show_logs() {
  echo "── kiosk.sh (journalctl -t kiosk) ──"
  journalctl -t kiosk -n 25 --no-pager 2>/dev/null || echo "(journal not readable)"
  echo
  echo "── Chromium ($LOG_FILE) ──"
  tail -n 15 "$LOG_FILE" 2>/dev/null || echo "(no log yet)"
}

edit_settings() {
  sudo "${EDITOR:-nano}" "$CONFIG_FILE" || return 1
  if confirm "Restart the kiosk so the new settings take effect?"; then
    # A fresh copy re-reads the file; this one still holds the old values.
    "$SELF" restart
  fi
}

uninstall_kiosk() {
  confirm "Remove the kiosk from this device? It stops now and won't start on boot." || return 1
  local installer="$LIB_DIR/install-kiosk.sh"
  if [ ! -f "$installer" ] && [ -r "$SOURCE_RECORD" ]; then
    installer="$(cat "$SOURCE_RECORD")/install-kiosk.sh"
  fi
  [ -f "$installer" ] || { echo "Can't find install-kiosk.sh to uninstall with."; return 1; }
  stop_kiosk
  bash "$installer" --uninstall
}

confirm() {
  local answer
  read -rp "$1 [y/N] " answer
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

pause() {
  local _
  read -rsn1 -p "Press any key to go back to the menu..." _
  echo
}

menu() {
  [ -t 0 ] || die "the menu needs a terminal — run it over SSH or on Ctrl-Alt-F2"
  local key state
  while :; do
    if [ -n "$(loop_pids)" ]; then state="running"; else state="stopped"; fi
    clear
    cat <<EOF
 ScholasticCloud kiosk — $state
 $KIOSK_URL

   1  Restart the kiosk
   2  Stop the kiosk (until the next reboot)
   3  Start the kiosk
   4  Start without waiting for the network
   5  Clear the browser cache and restart
   6  Update the kiosk scripts
   7  Update Chromium

   8  Status
   9  Recent logs
   e  Edit settings
   u  Uninstall

   r  Reboot        s  Shut down        q  Quit

EOF
    read -rsn1 -p " Choose: " key
    echo
    echo
    case "$key" in
      1) restart_kiosk ;;
      2) stop_kiosk ;;
      3) start_kiosk ;;
      4) echo "Opens Chromium straight away. The page itself still loads from the server,"
         echo "so with no connection at all it shows an error until you restart the kiosk."
         restart_kiosk --no-wait ;;
      5) confirm "Clear the cache? The gate stays paired and keeps its unsent scans." && clear_cache ;;
      6) update_kiosk && exec "$LAUNCHER" menu ;;
      7) update_chromium ;;
      8) show_status ;;
      9) show_logs ;;
      e|E) edit_settings && exec "$SELF" menu ;;
      u|U) uninstall_kiosk && exit 0 ;;
      r|R) confirm "Reboot now?" && sudo systemctl reboot ;;
      s|S) confirm "Shut down now? Someone will have to power it back on." && sudo systemctl poweroff ;;
      q|Q) return 0 ;;
      *) continue ;;
    esac
    echo
    pause
  done
}

usage() {
  cat <<EOF
Usage: kiosk [command]

  (none)            open the menu (as kiosk.sh: run the kiosk)
  start [--no-wait] start the kiosk in the desktop session
  stop              stop it until the next reboot
  restart           stop, then start — picks up changed settings
  status            is it running, can it reach the server
  logs              recent kiosk and Chromium logs
  clear-cache       clear the browser cache and restart
  update            re-install from the kiosk folder, then restart
  update-chromium   upgrade Chromium with apt, then restart
  uninstall         remove the kiosk from this device
EOF
}

main() {
  local cmd=${1:-}
  [ $# -gt 0 ] && shift
  if [ -z "$cmd" ]; then
    case "${0##*/}" in kiosk) cmd=menu ;; *) cmd=run ;; esac
  fi

  if [ "$cmd" != run ] && [ "$(id -u)" -eq 0 ]; then
    die "run this as the kiosk's desktop user, not root (it sudos when it needs to)"
  fi

  case "$cmd" in
    run)             run_kiosk "$@" ;;
    menu)            menu ;;
    start)           start_kiosk "$@" ;;
    stop)            stop_kiosk ;;
    restart)         restart_kiosk "$@" ;;
    status)          show_status ;;
    logs)            show_logs ;;
    clear-cache)     clear_cache ;;
    update)          update_kiosk ;;
    update-chromium) update_chromium ;;
    uninstall)       uninstall_kiosk ;;
    help|-h|--help)  usage ;;
    *)               usage >&2; exit 2 ;;
  esac
}

# On one line so bash has read the exit before running anything: an update
# replaces this file mid-run, and bash reads scripts as it goes.
main "$@"; exit $?
