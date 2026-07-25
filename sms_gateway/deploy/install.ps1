# Install the SMS gateway agent as a Windows service using NSSM.
# Run in an elevated PowerShell from the sms_gateway directory:  .\deploy\install.ps1
# Prerequisites: Node.js 18+ and NSSM (https://nssm.cc) on PATH.

$ErrorActionPreference = 'Stop'
$SrcDir = Split-Path -Parent $PSScriptRoot
$ServiceName = 'ScholasticCloudSmsGateway'

Write-Host '==> Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js not found. Install Node 18+ first.'
}
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
  throw 'NSSM not found on PATH. Download from https://nssm.cc and add it to PATH.'
}

Write-Host '==> Installing dependencies and building'
Push-Location $SrcDir
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
npm install --omit=dev
npm install --no-save typescript
npx tsc -p tsconfig.json
Pop-Location

$nodePath = (Get-Command node).Source
$entry = Join-Path $SrcDir 'dist\index.js'

Write-Host "==> Registering Windows service '$ServiceName'"
if (nssm status $ServiceName 2>$null) { nssm remove $ServiceName confirm }
nssm install $ServiceName $nodePath $entry
nssm set $ServiceName AppDirectory $SrcDir
nssm set $ServiceName AppStdout (Join-Path $SrcDir 'agent.log')
nssm set $ServiceName AppStderr (Join-Path $SrcDir 'agent.log')
nssm set $ServiceName Start SERVICE_AUTO_START

Write-Host ''
Write-Host 'Installed. Next steps:'
Write-Host "  1. Edit $SrcDir\.env  (set API_BASE_URL; SERIAL_PORT e.g. COM3)"
Write-Host "  2. Pair the kiosk:   node dist\index.js --pair <PAIRING_CODE>"
Write-Host "  3. Start service:    nssm start $ServiceName"
Write-Host "  4. Logs:             Get-Content $SrcDir\agent.log -Wait"
