'use strict';

const HOMEY_TO_PANEL_MODE = {
  disarmed: '0',
  armed_away: '1',
  armed_home: '2',
};

function panelModeFromHomeyMode(value) {
  const mode = HOMEY_TO_PANEL_MODE[value];
  if (!mode) throw new Error(`Onbekende alarmstand: ${value}`);
  return mode;
}

function panelModeFromOnOff(value) {
  return value ? '1' : '0';
}

module.exports = {
  HOMEY_TO_PANEL_MODE,
  panelModeFromHomeyMode,
  panelModeFromOnOff,
};

