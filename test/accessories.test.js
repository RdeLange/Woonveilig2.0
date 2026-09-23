'use strict';

const assert = require('assert');
const { parseDeviceList, pairingDevices, capabilitiesFor, warningFor, alarmWarningFor } = require('../lib/accessories');

const payload = {
  senrows: [
    {
      area: 1,
      zone: 6,
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
      area: 1,
      zone: 3,
      type: 4,
      type_f: 'Door Contact',
      name: 'Schuifpui rechts',
      cond_ok: '1',
      battery_ok: '1',
      tamper_ok: '1',
      status: 'Door Open',
      id: 'RF:00e76001',
    },
    {
      area: 1,
      zone: 5,
      type: 15,
      type_f: 'Keypad',
      name: 'Voordeur',
      cond_ok: '1',
      battery_ok: '1',
      tamper_ok: '1',
      status: '',
      id: 'RF:0279a099',
    },
    {
      area: 1,
      zone: 2,
      type: 9,
      type_f: 'IR',
      name: 'Woonkamer achterzijde',
      cond_ok: '1',
      battery_ok: '0',
      tamper_ok: '1',
      status: '',
      id: 'RF:0409d999',
    },
    {
      area: 1,
      zone: 99,
      type: 45,
      type_f: 'Siren',
      name: '',
      cond: 'Out Of Order',
      cond_ok: '0',
      battery_ok: '0',
      tamper_ok: '1',
      status: '',
      id: 'RF:siren01',
    },
  ],
};

function run() {
  const accessories = parseDeviceList(payload);
  assert.strictEqual(accessories.length, 5);

  const door = accessories.find((item) => item.id === 'RF:00f4fa99');
  assert.strictEqual(door.kind, 'contact');
  assert.strictEqual(door.contactAlarm, false);
  assert.strictEqual(door.batteryAlarm, false);
  assert.ok(capabilitiesFor(door).includes('alarm_contact'));

  const openDoor = accessories.find((item) => item.id === 'RF:00e76001');
  assert.strictEqual(openDoor.contactAlarm, true);

  const keypad = accessories.find((item) => item.id === 'RF:0279a099');
  assert.strictEqual(keypad.kind, 'keypad');
  assert.ok(!capabilitiesFor(keypad).includes('alarm_contact'));

  const motion = accessories.find((item) => item.id === 'RF:0409d999');
  assert.strictEqual(motion.kind, 'motion');
  assert.strictEqual(motion.motionAlarm, false);
  assert.strictEqual(motion.problemAlarm, true);
  assert.strictEqual(motion.batteryAlarm, true);
  assert.ok(capabilitiesFor(motion).includes('alarm_motion'));

  const siren = accessories.find((item) => item.id === 'RF:siren01');
  assert.strictEqual(siren.kind, 'siren');
  assert.strictEqual(siren.name, 'Sirene');
  assert.strictEqual(siren.statusLabel, 'Out Of Order · Buiten werking · Batterij laag');
  assert.strictEqual(siren.genericAlarm, false);
  assert.strictEqual(siren.problemAlarm, true);
  assert.ok(capabilitiesFor(siren).includes('alarm_generic'));
  assert.ok(capabilitiesFor(siren).includes('alarm_problem'));

  const devices = pairingDevices(accessories);
  const names = devices.map((device) => device.name);
  assert.ok(names.includes('Voordeur (Deurcontact)'));
  assert.ok(names.includes('Voordeur (Keypad)'));
  assert.ok(names.includes('Schuifpui rechts'));
  assert.ok(!Object.prototype.hasOwnProperty.call(devices[0], 'capabilities'));
  assert.ok(devices.find((device) => device.name === 'Schuifpui rechts').icon.includes('contact'));
  assert.ok(devices.find((device) => device.name === 'Voordeur (Keypad)').icon.includes('keypad'));
  assert.ok(devices.find((device) => device.name === 'Woonkamer achterzijde').icon.includes('motion'));
  assert.ok(devices.find((device) => device.name === 'Sirene').icon.includes('siren'));

  const withCaps = pairingDevices(accessories, { includeCapabilities: true });
  assert.ok(Array.isArray(withCaps[0].capabilities));
  assert.ok(!withCaps.some((device) => device.data.id === 'woonveilig-alarm'));

  assert.strictEqual(warningFor(door), null);
  assert.strictEqual(warningFor(openDoor), null);
  assert.strictEqual(warningFor(motion), 'Batterij laag');
  assert.ok(warningFor(siren).includes('Buiten werking'));
  assert.ok(warningFor(siren).includes('Batterij laag'));
  const alarmWarning = alarmWarningFor(accessories);
  assert.ok(alarmWarning.includes('meldingen'));
  assert.ok(alarmWarning.includes('Woonkamer achterzijde'));
  assert.ok(alarmWarning.includes('Sirene'));

  console.log('Accessoiremapping klopt: deur, keypad, bewegingssensor en sirene.');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

