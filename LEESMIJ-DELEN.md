# WoonVeilig Lokaal delen

Deze map bevat geen WoonVeilig wachtwoord, geen Homey token en geen persoonlijke `.env`.

Installeren:

```powershell
cd pad\naar\WoonVeilig-Lokaal-Homey
.\install-for-other-users.ps1
```

Of dubbelklik op `INSTALLEREN.bat`.

De gebruiker vult tijdens installatie zelf in:

- lokaal IP-adres van de WoonVeilig/Egardia centrale
- lokale gebruikersnaam
- lokaal wachtwoord
- gebied, meestal `1`

Na installatie:

```text
Homey -> Apparaten -> plusje -> Nieuw apparaat -> WoonVeilig
```

In de app-instellingen zitten testknoppen voor de WoonVeilig-verbinding en voor een Homey-pushmelding. Met `Export instellingen` kan de gebruiker instellingen delen zonder wachtwoord.
