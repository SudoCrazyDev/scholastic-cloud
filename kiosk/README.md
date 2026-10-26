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
kiosk start                      # try it now, without rebooting
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

SSH in (or plug in a keyboard and press `Ctrl-Alt-F2`), log in as the desktop
user, and run:

```bash
kiosk
```

```
 ScholasticCloud kiosk — running
 https://school.example.com/gate-enter

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
```

Each action also works as a command, e.g. `kiosk restart` or `kiosk status`;
`kiosk help` lists them. Run plain `kiosk.sh` and you get the kiosk itself (that
is what the desktop session starts at boot), not the menu.

A few of these need a word:

- **Restart** re-reads `/etc/default/kiosk`, so it's what you want after
  changing a setting.
- **Clear the browser cache** fixes a kiosk stuck on an old version of the app
  after a deploy. It only deletes Chromium's HTTP and shader caches. Local
  Storage and IndexedDB stay, and that's where a gate keeps its pairing, its
  roster and any scans it hasn't uploaded yet. To wipe the profile completely,
  delete `KIOSK_PROFILE` yourself, but only once the portal shows nothing
  waiting to upload.
- **Start without waiting for the network** skips the boot wait and opens
  Chromium straight away. The app still loads from the server, so with no
  connection at all you get an error page until you restart. A gate that's
  already running keeps taking taps offline; booting one while the link is
  down doesn't work.
- **Update the kiosk scripts** re-runs the installer from the folder it was
  installed from (it asks, and remembers). Copy the new `kiosk/` folder over
  that one first, or if the folder is a git checkout it runs `git pull` for you.

The installer keeps a copy of itself in `/usr/local/lib/scholasticcloud-kiosk`,
so uninstalling from the menu still works after the folder you installed from
is gone.

Without the menu:

```bash
pkill -f kiosk.sh; pkill chromium   # stop, in this order (the other way round, it comes back)
journalctl -t kiosk                 # what kiosk.sh decided
tail -f ~/.local/state/kiosk.log    # Chromium's own output
./install-kiosk.sh --uninstall      # undo everything
```

## Notes

- **Exiting the kiosk on the device:** `--kiosk` has no window controls and
  `KIOSK_RESPAWN=1` restarts it, so plug in a keyboard and use
  `Ctrl-Alt-F2` → login → `kiosk` → *Stop* (or SSH in). Worth knowing before
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
