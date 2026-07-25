# Install the ScholasticCloud SMS gateway agent on Windows.
# Run in an ELEVATED PowerShell from the extracted sms_gateway folder:
#   .\deploy\install.ps1
#
# By default this installs a native Scheduled Task that starts the agent at boot
# and restarts it on failure - no third-party tools needed. Pass -UseNssm to
# install a Windows service via NSSM instead (only if NSSM is already on PATH).

param(
  [switch]$UseNssm
)

$ErrorActionPreference = 'Stop'
$SrcDir = Split-Path -Parent $PSScriptRoot
$TaskName = 'ScholasticCloudSmsGateway'

Write-Host '==> Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js not found. Install Node 18+ first (https://nodejs.org).'
}
$nodePath = (Get-Command node).Source

Write-Host '==> Installing dependencies and building'
Push-Location $SrcDir
# The agent reads either .env or the portal-downloaded sms-gateway.env. Only seed
# from the example when neither exists.
if ((-not (Test-Path '.env')) -and (-not (Test-Path 'sms-gateway.env'))) {
  Copy-Item '.env.example' '.env'
}
npm install
npx tsc -p tsconfig.json
Pop-Location

$entry = Join-Path $SrcDir 'dist\index.js'
$logPath = Join-Path $SrcDir 'agent.log'

if ($UseNssm) {
  if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    throw 'NSSM not found on PATH. Install it (https://nssm.cc) or re-run without -UseNssm to use a Scheduled Task.'
  }
  Write-Host "==> Registering Windows service '$TaskName' via NSSM"
  if (nssm status $TaskName 2>$null) { nssm remove $TaskName confirm }
  nssm install $TaskName $nodePath $entry
  nssm set $TaskName AppDirectory $SrcDir
  nssm set $TaskName AppStdout $logPath
  nssm set $TaskName AppStderr $logPath
  nssm set $TaskName Start SERVICE_AUTO_START
} else {
  Write-Host "==> Registering Scheduled Task '$TaskName' (starts at boot, restarts on failure)"
  # A small wrapper keeps the working directory correct and captures logs.
  $wrapper = Join-Path $SrcDir 'run-agent.cmd'
  $wrapperLines = @(
    '@echo off',
    'cd /d "%~dp0"',
    ('"' + $nodePath + '" "dist\index.js" >> "agent.log" 2>&1')
  )
  Set-Content -Path $wrapper -Value $wrapperLines -Encoding ascii

  $action = New-ScheduledTaskAction -Execute $wrapper -WorkingDirectory $SrcDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
}

Write-Host ''
Write-Host 'Installed. Next steps:'
Write-Host ('  1. Check config: ' + $SrcDir + '\sms-gateway.env (or .env). API_BASE_URL is preset; add SERIAL_PORT (e.g. COM3) or leave blank to auto-detect.')
Write-Host ('  2. Pair the kiosk:   cd ' + $SrcDir + ' ; npm run pair -- YOUR_PAIRING_CODE')
if ($UseNssm) {
  Write-Host ('  3. Start now:        nssm start ' + $TaskName)
  Write-Host ('  4. Logs:             Get-Content ' + $logPath + ' -Wait')
} else {
  Write-Host ('  3. Start now:        Start-ScheduledTask -TaskName ' + $TaskName)
  Write-Host ('  4. Logs:             Get-Content ' + $logPath + ' -Wait')
  Write-Host ('     Stop / remove:    Stop-ScheduledTask -TaskName ' + $TaskName + ' ; Unregister-ScheduledTask -TaskName ' + $TaskName + ' -Confirm:$false')
}
