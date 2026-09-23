'use strict';

module.exports = {
  async getAccessories({ homey }) {
    return homey.app.fetchAccessories();
  },

  async testConnection({ homey }) {
    return homey.app.testConnection();
  },

  async testPush({ homey, query, body }) {
    const message = (query && query.message) || (body && body.message) || undefined;
    return homey.app.testPushNotification(message);
  },

  async exportSettings({ homey }) {
    return homey.app.exportSettings();
  },

  async acknowledgeAlarm({ homey }) {
    return homey.app.acknowledgeAlarm('Instellingen');
  },

  async getAlarmHistory({ homey }) {
    return homey.app.getAlarmHistory();
  },

  async getDashboard({ homey }) {
    return homey.app.getDashboard();
  },

  async getPushUsers({ homey }) {
    return homey.app.getPushUsers();
  },

  async clearAlarmHistory({ homey }) {
    return homey.app.clearAlarmHistory();
  },
};

