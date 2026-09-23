'use strict';

const assert = require('assert');
const { panelModeFromHomeyMode, panelModeFromOnOff } = require('../lib/alarm-modes');

function run() {
  assert.strictEqual(panelModeFromOnOff(true), '1');
  assert.strictEqual(panelModeFromOnOff(false), '0');
  assert.strictEqual(panelModeFromHomeyMode('armed_home'), '2');
  assert.strictEqual(panelModeFromHomeyMode('armed_away'), '1');
  assert.strictEqual(panelModeFromHomeyMode('disarmed'), '0');
  console.log('Knopmapping klopt: aan=1, uit=0, thuis=2.');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

