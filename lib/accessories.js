'use strict';

const TYPE_LABELS = {
  2: { en: 'Remote', nl: 'Afstandsbediening', kind: 'remote' },
  3: { en: 'Panic', nl: 'Paniek', kind: 'panic' },
  4: { en: 'Door contact', nl: 'Deurcontact', kind: 'contact' },
  5: { en: 'Water sensor', nl: 'Watersensor', kind: 'water' },
  6: { en: 'Panic button', nl: 'Paniekknop', kind: 'panic' },
  7: { en: 'Gas sensor', nl: 'Gassensor', kind: 'gas' },
  8: { en: 'Heat sensor', nl: 'Hittemelder', kind: 'heat' },
  9: { en: 'Motion sensor', nl: 'Bewegingssensor', kind: 'motion' },
  11: { en: 'Smoke sensor', nl: 'Rookmelder', kind: 'smoke' },
  12: { en: 'CO sensor', nl: 'CO-melder', kind: 'co' },
  13: { en: 'Medical', nl: 'Medisch', kind: 'panic' },
  14: { en: 'Glass break', nl: 'Glasbreuk', kind: 'generic' },
  15: { en: 'Keypad', nl: 'Keypad', kind: 'keypad' },
  16: { en: 'Vibration', nl: 'Trilling', kind: 'generic' },
  45: { en: 'Siren', nl: 'Sirene', kind: 'siren' },
};

const KIND_BY_TEXT = [
  { kind: 'contact', match: /door|contact|raam|window/i },
  { kind: 'motion', match: /\bir\b|pir|motion|beweging/i },
  { kind: 'smoke', match: /smoke|rook/i },
  { kind: 'water', match: /water|leak|lekkage/i },
  { kind: 'heat', match: /heat|hitte|fire|brand/i },
  { kind: 'co', match: /\bco\b|koolmonoxide/i },
  { kind: 'keypad', match: /keypad|toetsenbord/i },
  { kind: 'remote', match: /remote|afstand/i },
  { kind: 'siren', match: /siren|sirene/i },
  { kind: 'panic', match: /panic|paniek|medical|medisch/i },
];

function parseDeviceList(payload) {
  const rows = Array.isArray(payload?.senrows)
    ? payload.senrows
    : Array.isArray(payload)
      ? payload
      : [];

  return rows
    .map((row) => normalizeAccessory(row))
    .filter(Boolean);
}

function normalizeAccessory(row) {
  if (!row || typeof row !== 'object') return null;

  const typeId = Number(row.type);
  const typeText = String(row.type_f || '').trim();
  const kind = kindFromType(typeId, typeText);
  const typeInfo = TYPE_LABELS[typeId] || {};
  const status = String(row.status || '').trim();
  const cond = String(row.cond || '').trim();
  const condOk = isOkFlag(row.cond_ok, true);
  const batteryOk = isOkFlag(row.battery_ok, true);
  const tamperOk = isOkFlag(row.tamper_ok, true);
  const id = String(row.id || '').trim() || `zone-${row.zone || row.name || 'unknown'}`;
  const notOk = !condOk;
  const baseStatusLabel = statusLabel(kind, status, cond, condOk);
  const statusProblems = accessoryProblemLabels({ cond, condOk, batteryOk, tamperOk });

  return {
    id,
    area: String(row.area || '1'),
    zone: String(row.zone || ''),
    name: String(row.name || typeInfo.nl || typeText || id).trim(),
    typeId: Number.isFinite(typeId) ? typeId : null,
    type: typeText || typeInfo.en || 'Unknown',
    typeLabel: typeInfo.nl || typeText || 'Accessoire',
    kind,
    status,
    cond,
    statusLabel: statusProblems.length ? `${baseStatusLabel} · ${statusProblems.join(' · ')}` : baseStatusLabel,
    condOk,
    batteryOk,
    tamperOk,
    contactAlarm: kind === 'contact' && (isOpenStatus(status) || notOk),
    motionAlarm: kind === 'motion' && (isTriggeredStatus(status) || notOk),
    smokeAlarm: kind === 'smoke' && (isTriggeredStatus(status) || notOk),
    waterAlarm: kind === 'water' && (isTriggeredStatus(status) || notOk),
    heatAlarm: kind === 'heat' && (isTriggeredStatus(status) || notOk),
    coAlarm: kind === 'co' && (isTriggeredStatus(status) || notOk),
    genericAlarm: ['generic', 'panic', 'gas', 'siren'].includes(kind) && isTriggeredStatus(status),
    problemAlarm: statusProblems.length > 0,
    batteryAlarm: !batteryOk,
    tamperAlarm: !tamperOk,
    rssi: String(row.rssi || '').trim(),
    bypass: String(row.bypass || '').toLowerCase() === 'yes',
  };
}

function kindFromType(typeId, typeText) {
  if (TYPE_LABELS[typeId]) return TYPE_LABELS[typeId].kind;

  const matched = KIND_BY_TEXT.find((entry) => entry.match.test(typeText));
  return matched ? matched.kind : 'generic';
}

function isOkFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1' || String(value).toLowerCase() === 'ok';
}

function isOpenStatus(status) {
  return /open|ajar/i.test(status);
}

function isTriggeredStatus(status) {
  return /alarm|trigger|motion|detect|smoke|fire|leak|water|panic/i.test(status);
}

function statusLabel(kind, status, cond, condOk) {
  if (status) return status;
  if (cond) return cond;
  if (!condOk) return 'Niet OK';
  if (kind === 'contact') return 'Door Close';
  return 'OK';
}

function capabilitiesFor(accessory) {
  const capabilities = ['accessory_status'];

  if (accessory.kind === 'contact') capabilities.push('alarm_contact');
  if (accessory.kind === 'motion') capabilities.push('alarm_motion');
  if (accessory.kind === 'smoke') capabilities.push('alarm_smoke');
  if (accessory.kind === 'water') capabilities.push('alarm_water');
  if (accessory.kind === 'heat') capabilities.push('alarm_heat');
  if (accessory.kind === 'co') capabilities.push('alarm_co');
  if (['generic', 'panic', 'gas', 'siren'].includes(accessory.kind)) capabilities.push('alarm_generic');

  capabilities.push('alarm_problem', 'alarm_battery', 'alarm_tamper');
  return capabilities;
}

function warningFor(accessory) {
  if (!accessory) return null;

  const parts = accessoryProblemLabels(accessory);
  if (accessory.smokeAlarm && accessory.condOk) parts.push('Rookalarm');
  if (accessory.waterAlarm && accessory.condOk) parts.push('Wateralarm');
  if (accessory.heatAlarm && accessory.condOk) parts.push('Hittealarm');
  if (accessory.coAlarm && accessory.condOk) parts.push('CO-alarm');

  return parts.length ? parts.join(' · ') : null;
}

function accessoryProblemLabels(accessory) {
  const parts = [];
  if (!accessory.tamperOk) parts.push('Sabotage');
  if (!accessory.condOk) parts.push(condLabel(accessory.cond));
  if (!accessory.batteryOk) parts.push('Batterij laag');
  return parts;
}

function condLabel(cond) {
  const text = String(cond || '').trim();
  if (/out of order|offline|fail/i.test(text)) return 'Buiten werking';
  return text || 'Niet OK';
}

function alarmWarningFor(accessories) {
  const problems = (accessories || [])
    .map((item) => {
      const warning = warningFor(item);
      return warning ? { name: item.name, warning } : null;
    })
    .filter(Boolean);

  if (!problems.length) return null;
  if (problems.length === 1) return `${problems[0].name}: ${problems[0].warning}`;

  const preview = problems
    .slice(0, 4)
    .map((problem) => `${problem.name}: ${problem.warning}`)
    .join('; ');
  const remaining = problems.length - 4;

  if (remaining > 0) {
    return `${problems.length} meldingen: ${preview}; +${remaining} meer`;
  }

  return `${problems.length} meldingen: ${preview}`;
}

function pairingName(accessory, accessories) {
  const sameName = accessories.filter((item) => item.name === accessory.name).length > 1;
  if (sameName) return `${accessory.name} (${accessory.typeLabel})`;
  return accessory.name;
}

function pairingDevices(accessories, options = {}) {
  return accessories.map((accessory) => {
    const device = {
      name: pairingName(accessory, accessories) || accessory.typeLabel || accessory.id,
      icon: iconFor(accessory.kind),
      data: {
        id: String(accessory.id),
      },
      store: {
        type: accessory.type,
        kind: accessory.kind,
        zone: accessory.zone,
      },
    };

    if (options.includeCapabilities) {
      device.capabilities = capabilitiesFor(accessory);
    }

    return device;
  });
}

function alarmPairingDevice() {
  return {
    name: 'WoonVeilig Alarm',
    icon: iconFor('alarm'),
    data: {
      id: 'woonveilig-alarm',
    },
    store: {
      kind: 'alarm',
    },
  };
}

function iconFor(kind) {
  const icons = {
    alarm: '/icons/alarm.svg',
    contact: '/icons/contact.svg',
    motion: '/icons/motion.svg',
    smoke: '/icons/smoke.svg',
    water: '/icons/water.svg',
    heat: '/icons/heat.svg',
    remote: '/icons/remote.svg',
    keypad: '/icons/keypad.svg',
    siren: '/icons/siren.svg',
    panic: '/icons/panic.svg',
    co: '/icons/smoke.svg',
    gas: '/icons/gas.svg',
  };
  return icons[kind] || '/icons/sensor.svg';
}

function classFor(kind) {
  if (kind === 'alarm') return 'homealarm';
  if (kind === 'smoke') return 'smokealarm';
  if (kind === 'siren') return 'siren';
  if (kind === 'remote') return 'remote';
  if (kind === 'keypad' || kind === 'panic') return 'button';
  return 'sensor';
}

function fingerprint(accessory) {
  return [
    accessory.id,
    accessory.status,
    accessory.cond,
    accessory.condOk,
    accessory.batteryOk,
    accessory.tamperOk,
    accessory.rssi,
  ].join('|');
}

module.exports = {
  TYPE_LABELS,
  parseDeviceList,
  normalizeAccessory,
  capabilitiesFor,
  warningFor,
  alarmWarningFor,
  pairingDevices,
  alarmPairingDevice,
  iconFor,
  classFor,
  fingerprint,
};

