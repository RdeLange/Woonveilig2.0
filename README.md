# WoonVeilig Lokaal voor Homey Pro

Deze Homey Pro app leest een WoonVeilig/Egardia alarmcentrale lokaal uit via het LAN. Er is geen betaald WoonVeilig API-abonnement nodig zolang de centrale lokaal bereikbaar is.

## Installeren

1. Installeer Node.js: https://nodejs.org/
2. Pak deze zip uit.
3. Open PowerShell in deze map.
4. Start:

```powershell
.\install-for-other-users.ps1
```

Makkelijker voor minder technische gebruikers: dubbelklik op `INSTALLEREN.bat`. Die start hetzelfde installatiescript.

Het script vraagt om:

- jouw Homey account login
- jouw Homey om de app op te installeren
- lokaal adres van je WoonVeilig centrale, bijvoorbeeld `http://192.168.1.100`
- lokale WoonVeilig gebruikersnaam
- lokale WoonVeilig wachtwoord
- gebied, meestal `1`

## Apparaten toevoegen

Open daarna Homey:

```text
Apparaten -> plusje -> Nieuw apparaat -> WoonVeilig
```

Voeg het alarm en de accessoires toe.

## Wat werkt

- alarmstatus uitlezen
- alarm aan, uit en thuisstand schakelen
- deurcontacten, bewegingsmelders, keypads, sirene en andere accessoires tonen
- batterij, sabotage en probleemmeldingen op apparaten tonen
- optionele pushmelding bij alarm
- optionele herhaalde pushmelding zolang alarm afgaat
- alarmmelding bevestigen zodat herhaalmeldingen stoppen
- pushmelding bij batterij laag, sabotage of storing
- stilteperiode voor storingsmeldingen, standaard 6 uur
- waarschuwing/blokkade als een deur of raam open staat bij inschakelen
- melding als de WoonVeilig centrale niet bereikbaar is
- alarmgeschiedenis in de app-instellingen
- Homey-gebruikers aanvinken die pushmeldingen moeten krijgen
- testknop voor WoonVeilig-verbinding
- testknop voor Homey-pushmelding
- instellingen exporteren zonder wachtwoord
- melding bij nieuw gevonden WoonVeilig onderdeel
- optionele externe alarm-webhook voor bijvoorbeeld een bel- of notificatiedienst
- standaard Flow-trigger voor pushmeldingen naar specifieke Homey-gebruikers
- Flow-triggers voor alarm en accessoirestatus

## Privacy

Deze deelversie bevat geen persoonlijke `.env`, geen Homey token en geen WoonVeilig wachtwoord. Iedereen vult zijn eigen gegevens lokaal in tijdens installatie of via:

```text
Homey -> Meer -> Apps -> WoonVeilig Lokaal -> Instellingen
```
