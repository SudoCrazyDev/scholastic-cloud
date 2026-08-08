# Chromium kiosk (boot straight to a page)

Turns a Raspberry Pi OS Bookworm **Desktop** device into a kiosk: on every boot
it logs in, opens Chromium fullscreen on one URL, and keeps it there. Used on
the gate/scanner terminals.

```
boot ──► desktop session ──► kiosk.sh ──► chromium --kiosk $KIOSK_URL
                                 └── respawns Chromium if it exits
```

## Install

Copy this folder to the device and run it **as the desktop user** that
auto-logs in (not root — it sudos on its own for the two system files):

```bash
cd kiosk
chmod +x install-kiosk.sh kiosk.sh   # scp/USB/zip transfers drop the exec bit
./install-kiosk.sh
sudo nano /etc/default/kiosk     # set KIOSK_URL
/usr/local/bin/kiosk.sh          # try it now, without rebooting
sudo reboot                      # confirm it comes back on its own
```

The installer detects the compositor and wires up the matching autostart:

| Session | Autostart it edits |
| --- | --- |
| labwc (current Pi OS Bookworm) | `~/.config/labwc/autostart` |
| wayfire (earlier Bookworm) | `[autostart]` in `~/.config/wayfire.ini` |
| anything else | `~/.config/autostart/scholasticcloud-kiosk.desktop` |

For labwc it seeds a user `autostart` from `/etc/xdg/labwc/autostart` first — a
user file *replaces* the system one, so skipping that step would cost you the
taskbar and desktop.

It installs Chromium if it isn't there, and won't overwrite an existing
`/etc/default/kiosk`, so re-running it is safe.

## Two prerequisites the script can't do for you

1. **Auto-login must be on**, or the device sits at a login prompt and nothing
   starts: `sudo raspi-config` → *System Options* → *Boot / Auto Login* →
   *Desktop Autologin*.
2. **Desktop, not Lite.** This hooks into an existing desktop session. On Pi OS
   Lite there's no session to hook into — you'd need `cage` or `xinit` instead.

## Configuration

All of it lives in `/etc/default/kiosk` (template: [kiosk.default](kiosk.default)),
so you never edit the script on the device.

| Key | Default | Meaning |
| --- | --- | --- |
| `KIOSK_URL` | — | **Required.** The page to open |
| `KIOSK_PROFILE` | `~/.config/chromium-kiosk` | Chromium profile; delete it to sign out |
| `KIOSK_WAIT_FOR_NETWORK` | `1` | Wait for NetworkManager before starting |
| `KIOSK_WAIT_FOR_URL` | `1` | Also wait until the host answers |
| `KIOSK_WAIT_TIMEOUT` | `90` | Cap on both waits, then start regardless |
| `KIOSK_RESPAWN` | `1` | Relaunch Chromium if it exits |
| `KIOSK_DISABLE_BLANKING` | `1` | Stop the screen sleeping |
| `KIOSK_ALLOW_CAMERA` | `0` | Auto-grant camera/mic — set `1` for scanner pages |
| `KIOSK_EXTRA_FLAGS` | — | Extra Chromium flags |

The boot wait matters more than it looks: without it the kiosk can come up
before DHCP/DNS and land on a permanent error page, since nothing would ever
reload it.

## Day to day

```bash
pkill chromium                    # reload the page (kiosk.sh puts it back)
pkill -f kiosk.sh                 # stop the kiosk this session
journalctl -t kiosk               # what kiosk.sh decided
tail -f ~/.local/state/kiosk.log  # Chromium's own output
./install-kiosk.sh --uninstall    # undo everything
```

## Notes

- **Exiting the kiosk on the device:** `--kiosk` has no window controls and
  `KIOSK_RESPAWN=1` restarts it, so plug in a keyboard and use
  `Ctrl-Alt-F2` → login → `pkill -f kiosk.sh` (or SSH in). Worth knowing before
  you deploy one somewhere awkward.
- A hard power-off makes Chromium think it crashed and show a *"restore pages?"*
  bar over the kiosk. `kiosk.sh` clears that flag from the profile before each
  start.
- `KIOSK_ALLOW_CAMERA=1` grants the camera to whatever page is loaded with no
  prompt. That's fine on a locked-down kiosk pointed at one URL; don't set it on
  a device anyone can browse from.
- Only one kiosk runs per session — `kiosk.sh` takes an `flock`, so a stray
  second launch exits quietly instead of fighting over the screen.
- The mouse cursor stays visible on Wayland (`unclutter` is X11-only). If it's
  in the way, a touchscreen-only device usually won't show it anyway.
