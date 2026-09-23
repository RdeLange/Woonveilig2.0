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

  homey api apps set-app-setting --json --id $AppId --name $Name --value $Value | Out-Null
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
Write-Host 'App installeren. Kies jouw eigen Homey als daarom gevraagd wordt.' -ForegroundColor Cyan
homey app install

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
Write-Host 'Klaar. Open Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen om te controleren.' -ForegroundColor Green
Write-Host 'Voeg daarna de apparaten toe via Apparaten -> plusje -> Nieuw apparaat -> WoonVeilig.' -ForegroundColor Green

