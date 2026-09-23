'use strict';

const Homey = require('homey');
const { capabilitiesFor, classFor, iconFor, warningFor } = require('../../lib/accessories');

class WoonveiligAccessoryDevice extends Homey.Device {
  async onInit() {
    this.log(`WoonVeilig accessoire gestart: ${this.getName()}`);
    await this.applyAppearance(this.getStoreValue('kind'));
    this.homey.app.registerAccessoryDevice(this);
  }

  async onDeleted() {
    this.homey.app.unregisterAccessoryDevice(this);
  }

  async updateFromAccessory(accessory) {
    if (!accessory) return;

    const previousStatus = this.getCapabilityValue('accessory_status');
    const wanted = capabilitiesFor(accessory);
    for (const capability of wanted) {
      if (!this.hasCapability(capability)) {
        try {
          await this.addCapability(capability);
        } catch (error) {
          this.error(error);
        }
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

module.exports = WoonveiligAccessoryDevice;

