'use strict';

const Homey = require('homey');

class WoonveiligAlarmDriver extends Homey.Driver {
  async onInit() {
    this.log('WoonVeilig driver gestart');
    try {
      this.statusChangedTrigger = this.homey.flow.getDeviceTriggerCard('accessory_status_changed');
    } catch (error) {
      this.error('Flow-kaart accessory_status_changed niet beschikbaar:', error.message);
    }
  }

  async triggerStatusChanged(device, accessory) {
    if (!this.statusChangedTrigger) return;
    await this.statusChangedTrigger.trigger(device, {
      status: accessory.statusLabel,
      type: accessory.type,
    });
  }

  async onPairListDevices() {
    this.log('WoonVeilig pairinglijst ophalen');
    return this.homey.app.listAllDevicesForPairing();
  }
}

module.exports = WoonveiligAlarmDriver;

