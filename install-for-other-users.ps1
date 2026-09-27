$ErrorActionPreference = 'Stop'

$AppId = 'nl.community.woonveiliglocal'
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppDir

function Read-Default {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string]$Default
  )

  $value = Read-Host "$Prompt [$Default]"
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }

  return $value.Trim()
}

function Read-SecretPlainText {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Set-HomeySetting {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)]$Value
  )

  $result = & homey api apps set-app-setting --json --id $AppId --name $Name --value $Value 2>&1

  if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ $Name ingesteld" -ForegroundColor Green
  } else {
    Write-Host "  ✗ FOUT bij $Name`: $result" -ForegroundColor Red
    Write-Host "    Probeer handmatig in te stellen via:" -ForegroundColor Yellow
    Write-Host "    homey api apps set-app-setting --json --id $AppId --name $Name --value $Value" -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'WoonVeilig Lokaal installeren op jouw Homey' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is niet gevonden. Installeer eerst Node.js: https://nodejs.org/'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is niet gevonden. Installeer eerst Node.js met npm.'
}

if (-not (Get-Command homey -ErrorAction SilentlyContinue)) {
  Write-Host 'Homey CLI is nog niet gevonden. Ik installeer hem nu...' -ForegroundColor Yellow
  npm install --global homey
}

Write-Host 'Log zo nodig in met je eigen Athom/Homey account.' -ForegroundColor Yellow
homey login

if (-not (Test-Path (Join-Path $AppDir 'node_modules'))) {
  Write-Host 'Dependencies installeren...' -ForegroundColor Yellow
  npm install
}

Write-Host 'Syntax controleren...' -ForegroundColor Yellow
npm run check

Write-Host ''
Write-Host 'Oude versie verwijderen (indien aanwezig)...' -ForegroundColor Yellow
homey app uninstall 2>$null
Start-Sleep -Seconds 2

Write-Host ''
Write-Host 'WoonVeilig instellingen invullen voor jouw eigen centrale.' -ForegroundColor Cyan
$url = Read-Default -Prompt 'Lokaal adres van WoonVeilig' -Default 'http://192.168.1.100'
$username = Read-Host 'Lokale WoonVeilig gebruikersnaam'
$password = Read-SecretPlainText -Prompt 'Lokale WoonVeilig wachtwoord'
$area = Read-Default -Prompt 'Gebied' -Default '1'
$pollSeconds = Read-Default -Prompt 'Verversen in seconden' -Default '20'

Write-Host ''
$legacyInput = Read-Host 'Heb je een legacy WV-1716 systeem? (j/n)'
$legacyMode = if ($legacyInput -eq 'j' -or $legacyInput -eq 'J' -or $legacyInput -eq 'yes') { 'true' } else { 'false' }

Write-Host ''
Write-Host 'App installeren. Kies jouw eigen Homey als daarom gevraagd wordt.' -ForegroundColor Cyan
homey app install

Write-Host ''
Write-Host 'Even wachten... instellingen opslaan...' -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host 'Instellingen configureren...' -ForegroundColor Cyan
Set-HomeySetting -Name 'url' -Value $url
Set-HomeySetting -Name 'username' -Value $username
Set-HomeySetting -Name 'password' -Value $password
Set-HomeySetting -Name 'area' -Value $area
Set-HomeySetting -Name 'poll_seconds' -Value $pollSeconds
Set-HomeySetting -Name 'legacy_mode' -Value $legacyMode
Set-HomeySetting -Name 'dry_run' -Value 'false'
Set-HomeySetting -Name 'notify_on_alarm' -Value 'true'
Set-HomeySetting -Name 'repeat_alarm_notifications' -Value 'true'
Set-HomeySetting -Name 'repeat_alarm_seconds' -Value '30'
Set-HomeySetting -Name 'repeat_alarm_max' -Value '10'

Write-Host ''
Write-Host 'Even wachten... instellingen worden opgeslagen...' -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host ''
Write-Host 'Klaar! ✓' -ForegroundColor Green
Write-Host ''
Write-Host 'BELANGRIJK - Volgende stappen:' -ForegroundColor Cyan
Write-Host ''
Write-Host '1. Wacht minimaal 15 seconden tot Homey de app volledig heeft geladen' -ForegroundColor White
Write-Host '2. Open Homey app op je telefoon/tablet' -ForegroundColor White
Write-Host '3. Ga naar: Meer → Apps → WoonVeilig Lokaal → Instellingen' -ForegroundColor White
Write-Host ''
Write-Host 'CONTROLEER: Zijn je instellingen opgeslagen?' -ForegroundColor Yellow
Write-Host ''
Write-Host 'JA - Instellingen zijn opgeslagen:' -ForegroundColor Green
Write-Host '  ✓ Voeg apparaten toe via: Apparaten → plusje → Nieuw apparaat → WoonVeilig' -ForegroundColor Green
Write-Host ''
Write-Host 'NEE - Instellingen zijn NIET opgeslagen (leeg scherm):' -ForegroundColor Red
Write-Host '  1. Vul de instellingen handmatig in op dit scherm' -ForegroundColor Yellow
Write-Host '  2. Klik op "Opslaan" of equivalent knop' -ForegroundColor Yellow
Write-Host '  3. Zet legacy mode AAN als je WV-1716 hebt' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Problemen? Controleer:' -ForegroundColor Cyan
Write-Host '  • Homey CLI is ingelogd (run: homey login)' -ForegroundColor Cyan
Write-Host '  • Verbinding met Homey Hub is OK' -ForegroundColor Cyan
Write-Host '  • Probeer handmatig instellingen in te stellen in Homey' -ForegroundColor Cyan
Write-Host ''

