'use strict';

// Mock responses for testing without real hardware

const modernSystemStatus = {
  forms: {
    pcondform1: {
      mode: '1',
    },
  },
  updates: {
    mode_a1: '1',
  },
};

const modernSystemAccessories = {
  senrows: [
    {
      area: '1',
      zone: '6',
      type: 4,
      type_f: 'Door Contact',
      name: 'Voordeur',
      cond_ok: '1',
      battery_ok: '1',
      tamper_ok: '1',
      rssi: 'Strong, 9',
      status: 'Door Close',
      id: 'RF:00f4fa99',
    },
    {
      area: '1',
      zone: '3',
      type: 9,
      type_f: 'IR',
      name: 'Woonkamer',
      cond_ok: '1',
      battery_ok: '0',
      tamper_ok: '1',
      status: '',
      id: 'RF:0409d999',
    },
  ],
};

const legacySystemRawResponse = `/*-secure-{
  hisrows : [
    {d: "1/12", t: "09:03:32", a: "Arm", s: "Zone3(Voordeur)"},
    {d: "1/12", t: "08:30:15", a: "Disarm", s: "Zone2(Hal)"},
    {d: "1/11", t: "19:14:01", a: "Burglary Alarm", s: "Zone4(Trap)"}
  ]
}*/`;

const legacySystemParsedLogs = {
  hisrows: [
    { d: '1/12', t: '09:03:32', a: 'Arm', s: 'Zone3(Voordeur)' },
    { d: '1/12', t: '08:30:15', a: 'Disarm', s: 'Zone2(Hal)' },
    { d: '1/11', t: '19:14:01', a: 'Burglary Alarm', s: 'Zone4(Trap)' },
  ],
};

const legacySystemHomeMode = `/*-secure-{
  hisrows : [
    {d: "1/12", t: "09:03:32", a: "Home", s: "Zone3(Voordeur)"},
    {d: "1/12", t: "08:30:15", a: "Disarm", s: "Zone2(Hal)"}
  ]
}*/`;

const legacySystemAlarmTriggered = `/*-secure-{
  hisrows : [
    {d: "1/12", t: "09:03:32", a: "Arm", s: "Zone3(Voordeur)"},
    {d: "1/12", t: "09:05:15", a: "Burglar Alarm", s: "Zone4(Trap)"}
  ]
}*/`;

const legacySystemAlarmDisarmedAfter = `/*-secure-{
  hisrows : [
    {d: "1/12", t: "09:03:32", a: "Arm", s: "Zone3(Voordeur)"},
    {d: "1/12", t: "09:05:15", a: "Burglar Alarm", s: "Zone4(Trap)"},
    {d: "1/12", t: "09:06:00", a: "Disarm", s: "Zone2(Hal)"}
  ]
}*/`;

const legacySystemMalformedVariant = `/*-secure-{	hisrows : [{d: "1/12", t: "09:03", a: "Arm", s: "test"}]}*/`;

const legacySystemAccessories = {
  sensors: [
    {
      no: 1,
      type: 4,
      type_f: 'Door Contact',
      area: '1',
      zone: '6',
      name: 'Voordeur',
      cond: 'Close',
      cond_ok: '1',
      battery: '95',
      battery_ok: '1',
      tamper_ok: '1',
      rssi: 'Strong, 9',
      status: 'Door Close',
      id: 'sensor-1',
    },
    {
      no: 2,
      type: 9,
      type_f: 'IR',
      area: '1',
      zone: '3',
      name: 'Woonkamer',
      cond: 'OK',
      cond_ok: '1',
      battery: '20',
      battery_ok: '0',
      tamper_ok: '1',
      rssi: 'Weak, 3',
      status: '',
      id: 'sensor-2',
    },
  ],
};

const legacySystemAccessoriesMalformed = `/*-secure-{ sensors : [{ no: 1, type: 4, type_f: "Door Contact", area: 1, zone: 6, name: "Voordeur", cond: "Close", cond_ok: 1, battery: 95, battery_ok: 1, tamper_ok: 1, rssi: "Strong" }] }*/`;

module.exports = {
  modernSystemStatus,
  modernSystemAccessories,
  legacySystemRawResponse,
  legacySystemParsedLogs,
  legacySystemHomeMode,
  legacySystemAlarmTriggered,
  legacySystemAlarmDisarmedAfter,
  legacySystemMalformedVariant,
  legacySystemAccessories,
  legacySystemAccessoriesMalformed,
};
