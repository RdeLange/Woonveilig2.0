'use strict';

const Homey = require('homey');
const { panelModeFromHomeyMode, panelModeFromOnOff } = require('../../lib/alarm-modes');
const { capabilitiesFor, classFor, iconFor, warningFor, alarmWarningFor } = require('../../lib/accessories');

class WoonveiligDevice extends Homey.Device {
  isAlarm() {
    const data = this.getData() || {};
    return data.id === 'woonveilig-alarm' || this.getStoreValue('kind') === 'alarm';
  }

  async onInit() {
    if (this.isAlarm()) {
      this.log('WoonVeilig Alarm apparaat gestart');
      this.registerCapabilityListener('onoff', async (value) => {
        await this.homey.app.setAlarmMode(panelModeFromOnOff(value));
      });
      this.registerCapabilityListener('alarm_mode', async (value) => {
        await this.homey.app.setAlarmMode(panelModeFromHomeyMode(value));
      });
      this.homey.app.registerAlarmDevice(this);
      await this.applyAppearance('alarm');
      return;
    }

    this.log(`WoonVeilig accessoire gestart: ${this.getName()}`);
    await this.prepareAsAccessory();
    await this.applyAppearance(this.getStoreValue('kind'));
    this.homey.app.registerAccessoryDevice(this);
  }

  async prepareAsAccessory() {
    try {
      await this.setClass(classFor(this.getStoreValue('kind') || 'generic'));
    } catch (error) {
      this.error(error);
    }

    try {
      await this.setEnergy({ batteries: ['INTERNAL'] });
    } catch (error) {
      this.error(error);
    }

    for (const capability of ['onoff', 'alarm_mode']) {
      if (!this.hasCapability(capability)) continue;
      try {
        await this.removeCapability(capability);
      } catch (error) {
        this.error(error);
      }
    }
  }

  async onDeleted() {
    if (this.isAlarm()) {
      this.homey.app.unregisterAlarmDevice(this);
      return;
    }
    this.homey.app.unregisterAccessoryDevice(this);
  }

  async updateStatus(status) {
    const state = status.state || 'unknown';
    const isArmed = state === 'armed_away' || state === 'armed_home';

    try {
      await this.setCapabilityValue('onoff', isArmed);
      await this.setCapabilityValue('alarm_mode', state);
    } catch (error) {
      this.error(error);
    }
  }

  async updateFromAccessory(accessory) {
    if (!accessory) return;

    const previousStatus = this.getCapabilityValue('accessory_status');
    const wanted = capabilitiesFor(accessory);
    for (const capability of wanted) {
      if (this.hasCapability(capability)) continue;
      try {
        await this.addCapability(capability);
      } catch (error) {
        this.error(error);
      }
    }

    await this.setCapabilityIfPresent('accessory_status', accessory.statusLabel);
    await this.setCapabilityIfPresent('alarm_contact', accessory.contactAlarm);
    await this.setCapabilityIfPresent('alarm_motion', accessory.motionAlarm);
    await this.setCapabilityIfPresent('alarm_smoke', accessory.smokeAlarm);
    await this.setCapabilityIfPresent('alarm_water', accessory.waterAlarm);
    await this.setCapabilityIfPresent('alarm_heat', accessory.heatAlarm);
    await this.setCapabilityIfPresent('alarm_co', accessory.coAlarm);
    await this.setCapabilityIfPresent('alarm_generic', accessory.genericAlarm);
    await this.setCapabilityIfPresent('alarm_problem', accessory.problemAlarm);
    await this.setCapabilityIfPresent('alarm_battery', accessory.batteryAlarm);
    await this.setCapabilityIfPresent('alarm_tamper', accessory.tamperAlarm);
    await this.applyWarning(warningFor(accessory));

    try {
      await this.setStoreValue('type', accessory.type);
      await this.setStoreValue('kind', accessory.kind);
      await this.setStoreValue('zone', accessory.zone);
    } catch (error) {
      this.error(error);
    }

    await this.applyAppearance(accessory.kind);

    if (previousStatus && previousStatus !== accessory.statusLabel && this.driver.triggerStatusChanged) {
      try {
        await this.driver.triggerStatusChanged(this, accessory);
      } catch (error) {
        this.error(error);
      }
    }
  }

  async applyAlarmAccessoriesWarning(accessories) {
    await this.applyWarning(alarmWarningFor(accessories));
  }

  async applyWarning(warning) {
    try {
      if (warning) await this.setWarning(warning);
      else await this.unsetWarning();
    } catch (error) {
      this.error(error);
    }
  }

  async applyAppearance(kind) {
    if (!kind) return;

    try {
      await this.setClass(classFor(kind));
    } catch (error) {
      this.error(error);
    }

    const icon = iconFor(kind);
    try {
      await this.setIcon(icon);
    } catch (error) {
      try {
        await this.setIcon(String(icon).replace(/^\//, ''));
      } catch (retryError) {
        this.error(retryError);
      }
    }
  }

  async setCapabilityIfPresent(capability, value) {
    if (!this.hasCapability(capability) || value === undefined) return;
    if (this.getCapabilityValue(capability) === value) return;
    try {
      await this.setCapabilityValue(capability, value);
    } catch (error) {
      this.error(error);
    }
  }
}

module.exports = WoonveiligDevice;

