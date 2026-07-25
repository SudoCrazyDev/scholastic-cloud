# ScholasticCloud SMS Gateway (kiosk agent)

A small **headless** agent that turns a Raspberry Pi (Pi OS Lite) or a Windows PC
with a **USB GSM modem** into an SMS gateway for ScholasticCloud. It sends and
receives SMS over a local prepaid SIM and is managed entirely from the
ScholasticCloud portal — there is no local UI.

```
Portal (Laravel API)  ──►  queued messages  ──►  Agent  ──►  USB GSM modem  ──►  SMS
Portal (Laravel API)  ◄──  status / inbound  ◄──  Agent  ◄──  USB GSM modem  ◄──  SMS
```

The agent only makes **outbound HTTPS** calls (pull-based), so it works behind
NAT with no inbound ports. One agent drives **one modem**; run multiple installs
for multiple SIMs/branches.

## How it works

- **Pairing** — an admin registers a gateway in the portal (SMS Gateway → Gateways
  → Add) and gets a 6-char pairing code. The agent exchanges it once for a
  long-lived token (`POST /api/sms-gateway/pair`).
- **Heartbeat** (~45s) — reports online status, signal (`AT+CSQ`), operator
  (`AT+COPS?`), SIM number, and optional prepaid balance (USSD).
- **Outbox** (~5s) — claims queued messages (`GET /api/sms-gateway/outbox`),
  sends each via `AT+CMGS`, and reports `sent`/`failed` with the modem message
  reference (`provider_ref`).
- **Inbox** (~10s) — polls stored PDUs (`AT+CMGL`), decodes incoming SMS and
  delivery receipts, posts them (`/inbox`, `/delivery-reports`), and deletes them
  from the modem.

Messages use **PDU mode** by default (Unicode + long/concatenated messages).
Set `SMS_MODE=text` for a simpler ASCII-only path during bring-up.

## Requirements

- Node.js 18+
- A USB GSM modem that exposes an AT command serial port (e.g. Huawei E353x,
  SIMCom SIM7600). Some dongles ship in "storage/CD-ROM" mode — switch them to
  modem mode first (e.g. `usb-modeswitch` on Linux).
- A SIM with SMS capability and (for delivery receipts) delivery-report support.

## Quick start (development)

```bash
cd sms_gateway
cp .env.example .env      # set API_BASE_URL; leave SERIAL_PORT blank to auto-detect
npm install

# See which serial ports look like a modem
npm run list-ports

# Pair using the code from the portal
npm run pair -- ABC123

# Run
npm run dev
```

## Production install

### Linux / Raspberry Pi OS Lite
```bash
sudo ./deploy/install.sh      # installs build tools + usb-modeswitch, builds, adds the service
# pair, then:
sudo -u smsgw node /opt/sms_gateway/dist/index.js --pair <CODE>
sudo systemctl enable --now sms-gateway
journalctl -u sms-gateway -f
```
The modem is **auto-detected**, so `SERIAL_PORT` can stay blank and no udev
symlink is required. If you'd still like a stable `/dev/gsm-modem` path, see
`deploy/99-gsm-modem.rules`.

### Modem auto-detection
Leave `SERIAL_PORT` blank and the agent finds the modem on startup: it ranks
serial ports by known cellular-modem USB vendor (Huawei, SIMCom, Quectel, ZTE,
…) and confirms each really is a modem by checking it answers `AT` and
`AT+CGMM`. At boot it retries for ~30s so a slow-to-enumerate USB modem is still
found. Run `npm run list-ports` to see what's detected (likely modems are
flagged). Set `SERIAL_PORT` explicitly only to override.

### Windows
```powershell
# Elevated PowerShell, Node 18+ required. No third-party tools needed:
# the installer registers a native Scheduled Task (starts at boot, restarts on failure).
.\deploy\install.ps1
# set SERIAL_PORT (e.g. COM3) in .env / sms-gateway.env if auto-detect fails, pair, then:
npm run pair -- <CODE>
Start-ScheduledTask -TaskName ScholasticCloudSmsGateway
Get-Content .\agent.log -Wait
```
Prefer a real Windows service? Install [NSSM](https://nssm.cc), put it on PATH,
and run `.\deploy\install.ps1 -UseNssm`.

## Get the installer from the portal (recommended)

You don't need to clone this folder manually. In the portal (SMS Gateway →
Gateways) click **Download installer** on the gateway. You get a
`sms-gateway-<name>.zip` containing the full agent **plus** a ready
`sms-gateway.env` with `API_BASE_URL` set to your institution's API and a valid
pairing code baked in. On the kiosk:

```bash
unzip sms-gateway-<name>.zip && cd sms_gateway
sudo ./deploy/install.sh          # or deploy\install.ps1 on Windows
npm run pair -- <CODE>            # code is printed at the bottom of sms-gateway.env
```

> The zip does **not** include `node_modules` — the installer runs `npm install`
> on the device. It also omits the long-lived token (that's created at pairing
> and stays on the device).

## Configuration (`.env`)

| Key | Meaning |
| --- | --- |
| `API_BASE_URL` | Portal API base, incl. `/api` |
| `SMS_GATEWAY_TOKEN` | Written automatically after pairing |
| `SERIAL_PORT` | Modem AT port; blank = auto-detect |
| `SERIAL_BAUD` | Default 115200 |
| `SMS_MODE` | `pdu` (default) or `text` |
| `OUTBOX_POLL_MS` / `INBOX_POLL_MS` / `HEARTBEAT_MS` | Loop cadences |
| `OUTBOX_BATCH` | Messages claimed per poll |
| `USSD_BALANCE_CODE` | e.g. `*143#` to report prepaid balance (optional) |
| `LOG_LEVEL` | `debug`/`info`/`warn`/`error` |

## Notes & limitations

- Delivery receipts depend on the SIM/carrier honoring report requests; without
  them, outbound messages stay at `sent` (never `delivered`) — this is expected.
- USSD balance parsing is carrier-specific; treat it as best-effort.
- Multi-part **inbound** reassembly is best-effort (buffered by concat ref).
- The modem is driven one command at a time; throughput is bounded by the SIM
  and the portal's per-institution rate limit.
