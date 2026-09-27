'use strict';

const assert = require('assert');
const WoonveiligClientLegacy = require('../lib/woonveilig-client-legacy');
const fixtures = require('./fixtures');

function testJsonCleaning() {
  console.log('Testing JSON cleanup...');
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });

  // Test basic malformed JSON
  const result = client.cleanAndParseJson(fixtures.legacySystemRawResponse);
  assert.strictEqual(result.hisrows.length, 3);
  assert.strictEqual(result.hisrows[0].d, '1/12');
  assert.strictEqual(result.hisrows[0].t, '09:03:32');
  assert.strictEqual(result.hisrows[0].a, 'Arm');
  console.log('  ✓ Basic malformed JSON parsing');

  // Test variant with different whitespace
  const result2 = client.cleanAndParseJson(fixtures.legacySystemMalformedVariant);
  assert.strictEqual(result2.hisrows.length, 1);
  assert.strictEqual(result2.hisrows[0].a, 'Arm');
  console.log('  ✓ Variant whitespace handling');
}

function testModeMapping() {
  console.log('Testing mode mapping...');
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });

  // Legacy to Modern mapping
  assert.strictEqual(client.legacyModeToModern('Disarm'), 'disarmed');
  assert.strictEqual(client.legacyModeToModern('disarm'), 'disarmed');
  assert.strictEqual(client.legacyModeToModern('0'), 'disarmed');
  console.log('  ✓ Disarm mode mapping');

  assert.strictEqual(client.legacyModeToModern('Arm'), 'armed_away');
  assert.strictEqual(client.legacyModeToModern('Full Arm'), 'armed_away');
  assert.strictEqual(client.legacyModeToModern('arm'), 'armed_away');
  assert.strictEqual(client.legacyModeToModern('1'), 'armed_away');
  console.log('  ✓ Armed (full) mode mapping');

  assert.strictEqual(client.legacyModeToModern('Home'), 'armed_home');
  assert.strictEqual(client.legacyModeToModern('Home Arm 1'), 'armed_home');
  assert.strictEqual(client.legacyModeToModern('Home Arm 2'), 'armed_home');
  assert.strictEqual(client.legacyModeToModern('Home Arm 3'), 'armed_home');
  assert.strictEqual(client.legacyModeToModern('2'), 'armed_home');
  console.log('  ✓ Home (partial) mode mapping');

  assert.strictEqual(client.legacyModeToModern('unknown'), 'unknown');
  console.log('  ✓ Unknown mode handling');

  // Modern to Legacy mapping
  assert.strictEqual(client.modernModeToLegacy('0'), '0');
  assert.strictEqual(client.modernModeToLegacy('disarmed'), '0');
  console.log('  ✓ Modern to legacy: disarmed');

  assert.strictEqual(client.modernModeToLegacy('1'), '1');
  assert.strictEqual(client.modernModeToLegacy('armed_away'), '1');
  console.log('  ✓ Modern to legacy: armed away');

  assert.strictEqual(client.modernModeToLegacy('2'), '2');
  assert.strictEqual(client.modernModeToLegacy('armed_home'), '2');
  console.log('  ✓ Modern to legacy: armed home');
}

function testEventLogParsing() {
  console.log('Testing event log parsing...');
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });

  const logs = client.parseEventLogs(fixtures.legacySystemParsedLogs);
  assert.strictEqual(logs.length, 3);
  assert.strictEqual(logs[0].action, 'Arm');
  assert.strictEqual(logs[0].source, 'Zone3(Voordeur)');
  assert.strictEqual(logs[1].action, 'Disarm');
  console.log('  ✓ Event log parsing');

  // Test with empty logs
  const emptyLogs = client.parseEventLogs({ hisrows: [] });
  assert.strictEqual(emptyLogs.length, 0);
  console.log('  ✓ Empty log handling');
}

function testStateDerivation() {
  console.log('Testing state derivation...');
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });

  // Parse and derive from "Arm" mode
  const response1 = client.cleanAndParseJson(fixtures.legacySystemRawResponse);
  const logs1 = client.parseEventLogs(response1);
  const state1 = client.deriveStateFromLogs(logs1);
  assert.strictEqual(state1, 'armed_away');
  console.log('  ✓ State derivation: armed_away');

  // Parse and derive from "Home" mode
  const response2 = client.cleanAndParseJson(fixtures.legacySystemHomeMode);
  const logs2 = client.parseEventLogs(response2);
  const state2 = client.deriveStateFromLogs(logs2);
  assert.strictEqual(state2, 'armed_home');
  console.log('  ✓ State derivation: armed_home');

  // Empty logs
  const state3 = client.deriveStateFromLogs([]);
  assert.strictEqual(state3, 'unknown');
  console.log('  ✓ State derivation: unknown (no logs)');
}

function testAlarmDerivation() {
  console.log('Testing alarm derivation...');
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });

  // Alarm triggered
  const response1 = client.cleanAndParseJson(fixtures.legacySystemAlarmTriggered);
  const logs1 = client.parseEventLogs(response1);
  const alarm1 = client.deriveAlarmFromLogs(logs1);
  assert.strictEqual(alarm1, true);
  console.log('  ✓ Alarm derivation: triggered');

  // Alarm disarmed after trigger
  const response2 = client.cleanAndParseJson(fixtures.legacySystemAlarmDisarmedAfter);
  const logs2 = client.parseEventLogs(response2);
  const alarm2 = client.deriveAlarmFromLogs(logs2);
  assert.strictEqual(alarm2, false);
  console.log('  ✓ Alarm derivation: disarmed after trigger');

  // No alarm logs
  const response3 = client.cleanAndParseJson(fixtures.legacySystemRawResponse);
  const logs3 = client.parseEventLogs(response3);
  const alarm3 = client.deriveAlarmFromLogs(logs3);
  assert.strictEqual(alarm3, false);
  console.log('  ✓ Alarm derivation: no alarm');
}

function testActionDetection() {
  console.log('Testing action detection...');
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });

  // Mode change actions
  assert.strictEqual(client.isModeChangeAction('Arm'), true);
  assert.strictEqual(client.isModeChangeAction('Disarm'), true);
  assert.strictEqual(client.isModeChangeAction('Home'), true);
  assert.strictEqual(client.isModeChangeAction('arm'), true);
  console.log('  ✓ Mode change action detection');

  // Alarm actions
  assert.strictEqual(client.isAlarmAction('Burglar Alarm'), true);
  assert.strictEqual(client.isAlarmAction('Timeout'), true);
  assert.strictEqual(client.isAlarmAction('alarm'), true);
  assert.strictEqual(client.isAlarmAction('Disarm'), false);
  console.log('  ✓ Alarm action detection');
}

async function testAccessoriesNormalization() {
  console.log('Testing legacy accessory normalization...');
  const { normalizeAccessory } = require('../lib/accessories');

  // Test door contact normalization
  const doorContact = fixtures.legacySystemAccessories.sensors[0];
  const normalized1 = normalizeAccessory(doorContact);
  assert.strictEqual(normalized1.id, 'sensor-1');
  assert.strictEqual(normalized1.name, 'Voordeur');
  assert.strictEqual(normalized1.kind, 'contact');
  assert.strictEqual(normalized1.batteryOk, true);
  assert.strictEqual(normalized1.condOk, true);
  console.log('  ✓ Door contact normalization');

  // Test motion sensor with low battery
  const motionSensor = fixtures.legacySystemAccessories.sensors[1];
  const normalized2 = normalizeAccessory(motionSensor);
  assert.strictEqual(normalized2.id, 'sensor-2');
  assert.strictEqual(normalized2.name, 'Woonkamer');
  assert.strictEqual(normalized2.kind, 'motion');
  assert.strictEqual(normalized2.batteryOk, false);
  assert.strictEqual(normalized2.batteryAlarm, true);
  console.log('  ✓ Motion sensor normalization with low battery');

  // Test malformed response parsing
  const client = new WoonveiligClientLegacy({
    url: 'http://localhost',
    username: 'test',
    password: 'test',
  });
  const parsed = client.cleanAndParseJson(fixtures.legacySystemAccessoriesMalformed);
  assert.strictEqual(Array.isArray(parsed.sensors), true);
  assert.strictEqual(parsed.sensors.length, 1);
  console.log('  ✓ Malformed accessory response parsing');
}

async function run() {
  console.log('\n=== Legacy WoonVeilig Client Tests ===\n');

  try {
    testJsonCleaning();
    testModeMapping();
    testEventLogParsing();
    testStateDerivation();
    testAlarmDerivation();
    testActionDetection();
    await testAccessoriesNormalization();

    console.log('\n✅ All legacy client tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  }
}

run();
