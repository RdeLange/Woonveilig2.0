# Handleiding WoonVeilig Lokaal voor Homey Pro

Deze handleiding is voor Homey-gebruikers die een WoonVeilig/Egardia alarmcentrale lokaal met Homey willen koppelen.

## Wat heb je nodig?

- Homey Pro
- WoonVeilig/Egardia centrale die lokaal bereikbaar is via je eigen netwerk
- Windows-computer voor de installatie
- Node.js
- Homey/Athom account waarmee je apps mag installeren
- lokale WoonVeilig gebruikersnaam en wachtwoord

## Stap 1: Node.js installeren

Ga naar:

```text
https://nodejs.org/
```

Installeer de LTS-versie. Sluit daarna PowerShell en open PowerShell opnieuw.

Controleer eventueel:

```powershell
node --version
npm --version
```

## Stap 2: Zip uitpakken

Pak `DEELBAAR-WoonVeilig-Lokaal-Homey-zonder-persoonlijke-gegevens.zip` uit naar een makkelijke map, bijvoorbeeld:

```text
C:\Users\jouwnaam\Documents\WoonVeilig-Lokaal-Homey
```

## Stap 3: Installatiescript starten

Open PowerShell in de uitgepakte map en voer uit:

```powershell
.\install-for-other-users.ps1
```

Of dubbelklik op:

```text
INSTALLEREN.bat
```

Als PowerShell scripts blokkeert, gebruik dan eenmalig:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Start daarna opnieuw:

```powershell
.\install-for-other-users.ps1
```

## Stap 4: Inloggen bij Homey

Het script opent de Homey login via de Homey CLI.

Log in met je eigen Athom/Homey account. Kies daarna jouw eigen Homey als daarom gevraagd wordt.

## Stap 5: WoonVeilig gegevens invullen

Het script vraagt om:

- lokaal adres van de WoonVeilig centrale, bijvoorbeeld `http://192.168.1.100`
- lokale WoonVeilig gebruikersnaam
- lokale WoonVeilig wachtwoord
- gebied, meestal `1`
- verversen in seconden, bijvoorbeeld `20`

Je kunt deze gegevens later wijzigen via:

```text
Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen
```

Gebruik daarna in hetzelfde scherm:

- `Test verbinding` om IP-adres, gebruikersnaam, wachtwoord en uitlezen te controleren
- `Test pushmelding` om te controleren of Homey meldingen op je telefoon kan sturen
- `Export instellingen` om instellingen zonder wachtwoord te tonen

## Stap 6: Apparaten toevoegen in Homey

Open de Homey-app:

```text
Apparaten -> plusje -> Nieuw apparaat
```

Zoek of scroll naar:

```text
WoonVeilig
```

Voeg daarna het alarm en de accessoires toe. Meestal kun je alles aanvinken en toevoegen.

## Wat zie je daarna?

Je krijgt onder andere:

- `WoonVeilig Alarm`
- deurcontacten
- bewegingsmelders
- keypads
- afstandsbedieningen
- sirene

Per onderdeel zie je waar mogelijk:

- open/dicht
- beweging/alarm
- batterij
- sabotage
- probleem

## Alarm bedienen

Op de tegel `WoonVeilig Alarm`:

- aan = volledig inschakelen
- uit = uitschakelen
- alarmstand = Uit, Aan, Thuis of Onbekend

Je kunt ook flows maken met acties:

```text
Dan -> WoonVeilig Lokaal -> Alarm volledig inschakelen
Dan -> WoonVeilig Lokaal -> Alarm in thuisstand inschakelen
Dan -> WoonVeilig Lokaal -> Alarm uitschakelen
```

## Pushmelding bij alarm

De app kan zelf pushmeldingen sturen.

Instelling:

```text
Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen
```

Zet aan:

- Pushmelding bij alarm
- Blijven melden zolang alarm afgaat
- Melding bij storing (batterij, sabotage, defect)
- Storing opnieuw melden na, standaard `6` uur
- Melding als WoonVeilig niet bereikbaar is
- Push naar gebruikers: vink aan wie telefoonpush moet krijgen
- Controleer open deuren/ramen voor inschakelen
- Inschakelen blokkeren als deur/raam open staat

Standaard stuurt Homey dan elke 30 seconden opnieuw een melding, maximaal 10 keer.

Met `Alarmmelding bevestigen` in de app-instellingen stop je de herhaalmeldingen tot er een nieuw alarm begint. Het echte WoonVeilig-alarm blijft actief tot je het alarm uitschakelt.

## Alarmgeschiedenis

In de app-instellingen staat `Alarmgeschiedenis`. Daar zie je:

- alarmen
- herhaalmeldingen
- storingen
- nieuwe onderdelen
- bevestigingen

Je kunt de lijst vernieuwen of wissen.

## Push naar gebruikers

Bij `Meldingen op je telefoon` kun je Homey-gebruikers aanvinken. Alleen aangevinkte gebruikers krijgen automatische telefoonpush.

Laat je de lijst leeg, dan stuurt de app naar alle gevonden Homey-gebruikers.

## Statusdashboard

Bovenaan de app-instellingen staat `Statusdashboard`. Daar zie je:

- alarmstand
- aantal onderdelen
- aantal storingen
- aantal open deuren/ramen
- laatste succesvolle uitlezing

Als `Inschakelen blokkeren als deur/raam open staat` aan staat, weigert Homey het inschakelen wanneer een deur- of raamcontact open is. Je krijgt dan bijvoorbeeld:

```text
Alarm niet ingeschakeld: Voordeur staat open
```

## Nieuw onderdeel gevonden

Als later een sensor of accessoire bij WoonVeilig wordt toegevoegd, kan Homey daar automatisch een melding van geven.

Instelling:

```text
Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen -> Melding bij nieuw gevonden onderdeel
```

## Externe alarm-webhook

Voor een bel- of notificatiedienst buiten Homey kun je een externe webhook invullen.

Instelling:

```text
Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen
```

Zet aan:

- Externe alarm-webhook aanroepen
- Alarm-webhook URL

De app roept die URL aan bij alarm en geeft `message` en `status` mee in de querystring.

## Push naar specifieke Homey-gebruikers

Wil je zelf kiezen welke Homey-gebruiker de push krijgt? Maak dan een Flow.

Eerste alarmmelding:

```text
Als -> WoonVeilig Lokaal -> Het alarm gaat af
Dan -> Pushmelding -> Stuur [Melding] naar gebruiker
```

Herhalende melding:

```text
Als -> WoonVeilig Lokaal -> De alarmherinnering wordt verstuurd
Dan -> Pushmelding -> Stuur [Melding] naar gebruiker
```

Maak dezelfde Flow opnieuw voor iedere extra gebruiker.

Standaard pushmeldingen via dezelfde Homey Pushmelding-actie:

```text
Als -> WoonVeilig Lokaal -> Een pushmelding is gevraagd
Dan -> Pushmelding -> Stuur [Melding] naar gebruiker
```

Deze ene Flow werkt voor testmeldingen, alarmmeldingen, herhaalde alarmmeldingen en nieuwe onderdelen. Druk daarna in de app-instellingen op `Test pushmelding`.

Herhaalmeldingen stoppen zonder het echte alarm uit te zetten:

```text
Dan -> WoonVeilig Lokaal -> Alarmmelding bevestigen
```

## Testmodus

Gebruik testmodus als je de knoppen wilt proberen zonder het echte alarm te schakelen.

```text
Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen -> Testmodus aan
```

Zet testmodus uit voordat je het echte alarm wilt bedienen.

## Veelvoorkomende problemen

### Ik zie geen apparaten

Controleer:

- staat de WoonVeilig centrale aan?
- zit Homey op hetzelfde lokale netwerk?
- klopt het IP-adres?
- klopt gebruikersnaam/wachtwoord?
- kun je de centrale openen in je browser?

### Ik krijg batterij of probleem op een apparaat

Dat komt uit WoonVeilig zelf. Vervang de batterij of controleer het onderdeel in de WoonVeilig omgeving.

### Push komt niet binnen

Controleer:

- Homey-app mag meldingen sturen op je telefoon
- je bent ingelogd met de juiste Homey-gebruiker
- `Pushmelding bij alarm` staat aan
- maak eventueel een Flow met `Het alarm gaat af`

### Alarm schakelt niet

Controleer:

- testmodus staat uit
- WoonVeilig gebruikersnaam/wachtwoord klopt
- sommige alarmsystemen weigeren inschakelen als er zones open staan of onderdelen storing hebben

## Privacy

De app werkt lokaal binnen je eigen netwerk. Je WoonVeilig wachtwoord wordt alleen opgeslagen in je eigen Homey-instellingen. Deel nooit je eigen `.env`, wachtwoorden, tokens of persoonlijke Homey-gegevens.
