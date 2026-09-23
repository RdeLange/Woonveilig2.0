'use strict';

const Homey = require('homey');

class WoonveiligAccessoryDriver extends Homey.Driver {
  async onInit() {
    this.log('WoonVeilig Accessoire driver gestart');
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
    try {
      return await this.homey.app.listAccessoriesForPairing();
    } catch (error) {
      this.error('Accessoires ophalen voor pairing mislukt:', error.message);
      throw new Error(error.message || 'Accessoires ophalen mislukt.');
    }
  }
}

module.exports = WoonveiligAccessoryDriver;

