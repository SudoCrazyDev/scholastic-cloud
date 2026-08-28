# Running a gate kiosk

How to put a gate kiosk into a school and keep it running. The companion doc,
[OFFLINE_KIOSK_V1.md](OFFLINE_KIOSK_V1.md), explains *why* it works this way; this one is the
procedure.

Two people do the work and they need different parts of this page:

- an **administrator** in the portal, who registers the device and reads the codes — [step 1](#1-register-the-kiosk-in-the-portal) and [day to day](#day-to-day-what-the-office-watches);
- a **technician** at the gate, who installs and pairs it — steps [2](#2-point-the-device-at-the-gate-page)–[4](#4-optional-load-the-campus-from-a-usb-stick).

You need both at the same time for about five minutes, because a pairing code lasts 15 minutes and
has to be read out or messaged across.

---

## Before you start

| What | Why |
|---|---|
| The school's app URL | e.g. `https://app.<school>.edu.ph`. The kiosk opens `/gate-enter` there. |
| A portal login with **Gate Entries** access | Registering a kiosk needs `gate-entries.manage`. |
| The RFID reader | It must type the card's UID and press Enter — that is all the page listens for. |
| A Raspberry Pi or a Windows PC | Either works. The Pi has the install scripts in [`kiosk/`](../../../kiosk/). |

**Students must already have their cards registered** against their student records. A card nobody
has registered will not open a gate — it lands on the *cards that could not be matched* list instead
(see [day to day](#day-to-day-what-the-office-watches)).

---

## 1. Register the kiosk in the portal

1. Open **Students → Gate Entries**.
2. Pick the tab for the gate this device stands at: **Entrance Gate** or **Exit Gate**. This matters
   — a kiosk paired to the entrance will refuse to run as an exit, on purpose, because recording
   exits as entrances would corrupt attendance while looking like it worked.
3. In **Kiosk devices on the … gate**, press **Add device**.
4. Fill in:
   - **Device name** — what you want to see beside every scan this kiosk records, e.g. *Main Gate
     Entrance*. It appears in the scan log and in the SMS to parents.
   - **Location** (optional) — e.g. *Beside the guard house*. Only for the admin's own reference.
5. Press **Register device**.

A **6-character pairing code** appears, in an indigo box. Two things about it:

- It is shown **once**. It is not stored anywhere you can read it back — if you navigate away, press
  **New code** and a fresh one is minted.
- It **expires in 15 minutes**, and it is single-use.

The characters avoid every ambiguous pair (`0/O`, `1/I/L`, `5/S`, `8/B`), so it can be read aloud
across a campus without confusion.

---

## 2. Point the device at the gate page

### Raspberry Pi

Follow [`kiosk/README.md`](../../../kiosk/README.md) for the full install. The only setting that
matters here is in `/etc/default/kiosk`:

```bash
KIOSK_URL="https://app.<school>.edu.ph/gate-enter"      # or /gate-exit
```

**No `?institution_id=` on the end.** A paired kiosk gets its school and its gate from its own
token; the query string is the old way and is only there so kiosks installed before this feature
keep working.

Then `systemctl reboot`, or `pkill chromium` to restart the browser in place.

### Windows PC

Open Chrome or Edge at the same URL, in fullscreen (`F11`). For an unattended machine, use
kiosk mode:

```
chrome.exe --kiosk "https://app.<school>.edu.ph/gate-enter"
```

---

## 3. Pair the kiosk

The gate page shows **Pair this kiosk** with a single box.

1. Type the 6-character code. It uppercases as you type.
2. Press **Pair kiosk**.
3. The screen changes to **Kiosk paired** and names the device, so check it says the one you meant.
4. Press **Start the gate** — or wait, and it starts on its own after a minute so a kiosk left
   half-installed does not sit on a setup screen forever.

The kiosk immediately downloads the campus: names, sections, card numbers, then photos in the
background. The chip at the top left shows how it is getting on — `1,240 students`, then
`380 photos to fetch`. **It is a working gate as soon as the student list lands.** Photos arrive
behind that and a kiosk that never finishes fetching them still records every scan correctly; it
just shows a grey silhouette instead of a face.

On a slow link the first sync can take a while. If it is unreasonable, use the USB route below.

---

## 4. Optional: load the campus from a USB stick

For a campus of a few thousand students the photos are roughly 90 MB, which some school links will
not deliver in an afternoon. Build the bundle somewhere with a decent connection:

```bash
cd api
php artisan gate:seed-snapshot <device-id>          # writes gate-seed-<device>.zip
php artisan gate:seed-snapshot <device-id> --out=/path/to/stick/gate-seed.zip
```

The device id is in the portal (the row you just registered). Then, on the **Kiosk paired** screen —
this is the only place the option appears, because the bundle is checked against the device it was
built for — press **Load a seed bundle** and choose the file.

It reports what it loaded. A bundle built for a different school or a different kiosk is refused: a
kiosk holding the wrong campus would resolve taps against strangers and look like it was working.

After a seed, the network only ever has to carry what changed since the stick was written.

---

## Day to day: what the office watches

Everything below is on **Students → Gate Entries**, on the tab for that gate.

### The kiosk device row

```
● Main Gate Entrance
  Beside the guard house · paired · seen 40s ago · 1,240 students cached · 3 scans waiting to upload
```

- **seen** — when it last checked in. Kiosks beat every 2 minutes; a gap means the link is down, not
  that the gate has stopped working.
- **scans waiting to upload** — taps recorded on the device and not yet on the server. Normal during
  an outage, and it should return to nothing once the link is back.
- An **amber clock line** means the device's clock is far enough out that its timestamps are
  doubtful. Chase this one — see [when something looks wrong](#when-something-looks-wrong).

### Cards that could not be matched

An amber panel, and it only appears when there is something in it. Each row is a card that tapped
and could not be matched to any student — a new enrolment whose card was never registered, a
replacement card, or a UID entered wrong.

**Register the card against the student and the row clears itself** at the next tap. **Dismiss** is
for the other endings: a visitor's card, a misread.

Nothing notifies anyone about this list; it lives on this page. Worth a look each morning.

### The scan log

The usual table. A row may carry a **`time unverified`** chip next to its timestamp: that scan came
from a kiosk that had not reached the server since it started, so it did not know the time. The scan
is real; the clock behind it is not trustworthy. On a Raspberry Pi with no network at boot this is
expected, and it clears as soon as the kiosk reaches the server once.

### Parent SMS

Set up on the same page, under the SMS card. Two windows control it:

- **Cooldown** — skip a repeat text if the same student taps the same gate again within N minutes.
- **Late cut-off** — drop the text if the scan reaches the server more than N minutes after the tap.
  **Default 15.** This is what stops a kiosk that spent the morning offline from texting every
  parent at lunchtime that their child has just arrived. The scan is still recorded; only the text is
  dropped. Set `0` to always send, however late.

---

## When something looks wrong

**The gate says "Card not recognised".** The card is not registered, or its tag was deactivated. If
the kiosk is online, the server has already checked and genuinely does not know it. Check the
*cards that could not be matched* list — the tap is waiting there.

**"Card not recognised — saved on this kiosk".** Same message, but the kiosk is offline and cannot
ask. It might be a valid card the device has not synced yet. The tap is queued and will resolve when
the link returns.

**A card shows the face but says "saved, waiting to upload".** Working as intended: the link is
down, the scan is on the device, and it will go up by itself. Nothing to do.

**The chip says `clock not set`.** The kiosk has not reached the server since it started. It still
works, but every scan it takes is stamped with a clock nobody has checked. Fix the network; the
warning clears on the next successful check-in and stops flagging new scans.

**The chip says `roster 2d old`.** The kiosk has not synced in over a day. It is still admitting
students from a two-day-old list — withdrawn students still resolve, new cards do not. Fix the link.

**The gate shows a login screen.** It should not any more, but if it does, the device has lost its
pairing. Re-pair it with a new code.

**Nothing on screen at all / the browser was closed.** On a Pi, `kiosk.sh` restarts Chromium after
3 seconds. To stop that for maintenance, `pkill -f kiosk.sh` **first**, then `pkill chromium` — the
other order just makes it come back.

---

## Moving, replacing, or retiring a kiosk

| Situation | What to do |
|---|---|
| Same kiosk, needs re-provisioning | **Unpair** in the portal. The device keeps its row and history, and you get a fresh code. The kiosk wipes its local copy and returns to the pairing screen. |
| Kiosk is being thrown away or stolen | **Delete** the device. Its token stops working at the next call and it purges the roster and photos it holds. |
| Kiosk is moving from the entrance to the exit | Unpair it, then register it on the other tab and pair again. A device serves the gate it was registered for. |

**Do not unpair a kiosk that still has scans waiting to upload.** Revoking wipes the device,
queued scans included — they cannot be uploaded by a device the server no longer trusts. Wait for
the count to reach nothing first.

---

## What this does not do

- **A kiosk still needs the network to boot.** Once it is running it survives an outage happily, but
  a power cut that reboots the device while the link is down leaves the gate down until the link
  returns — even though the whole campus is sitting in its storage.
- **Kiosks do not update themselves.** A device runs whatever the app was when its browser last
  loaded the page; a refresh picks up a new deploy.
- **Nothing chases the office.** The unmatched-cards list and the clock warnings sit on the Gate
  Entries page and nowhere else.
