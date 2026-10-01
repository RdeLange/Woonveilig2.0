'use strict';

const Homey = require('homey');
const http = require('http');
const https = require('https');
const HomeyPush = require('./lib/homey-push');
const WoonveiligClient = require('./lib/woonveilig-client');
const WoonveiligClientLegacy = require('./lib/woonveilig-client-legacy');
const { alarmPairingDevice, fingerprint, pairingDevices, warningFor } = require('./lib/accessories');

const DEFAULT_SETTINGS = {
  url: 'http://192.168.1.100',
  username: '',
  password: '',
  area: '1',
  poll_seconds: 20,
  dry_run: false,
  legacy_mode: false,
  notify_on_alarm: true,
  repeat_alarm_notifications: true,
  repeat_alarm_seconds: 30,
  repeat_alarm_max: 10,
  notify_on_new_accessory: true,
  notify_on_accessory_problem: true,
  accessory_problem_silence_hours: 6,
  push_user_ids: [],
  check_open_contacts_before_arm: true,
  block_arm_with_open_contacts: true,
  notify_on_unreachable: true,
  call_webhook_on_alarm: false,
  call_webhook_url: '',
};

class WoonveiligLocalApp extends Homey.App {
  async onInit() {
    this.log('WoonVeilig Lokaal gestart');

    this.currentStatus = 'unknown';
    this.rawMode = '';
    this.pollTimer = null;
    this.alarmNotificationTimer = null;
    this.alarmNotificationCount = 0;
    this.alarmNotificationAcknowledged = false;
    this.alarmDevices = new Set();
    this.accessoryDevices = new Set();
    this.accessories = [];
    this.accessoryById = new Map();
    this.accessoriesLoadedOnce = false;
    this.push = new HomeyPush(this);

    // Persistent storage for seen accessory IDs (survives app restarts)
    this.seenAccessoryIds = new Set(parseJsonArray(this.homey.settings.get('seen_accessory_ids') || '[]'));

    // Optimistic UI: track pending mode changes to avoid flickering
    this.pendingModeChange = {
      previousStatus: null,
      requestedStatus: null,
      initiatedAt: null,
      timeoutMs: 12000,  // 12 second timeout
    };
    this.statusChangedTrigger = this.getFlowCard('getTriggerCard', 'status_changed');
    this.accessoryChangedTrigger = this.getFlowCard('getTriggerCard', 'accessory_changed');
    this.alarmTriggeredTrigger = this.getFlowCard('getTriggerCard', 'alarm_triggered');
    this.alarmRepeatTrigger = this.getFlowCard('getTriggerCard', 'alarm_repeat');
    this.testNotificationTrigger = this.getFlowCard('getTriggerCard', 'test_notification_requested');

    this.registerFlowCard('getConditionCard', 'status_is', async (args) => {
      return this.currentStatus === args.status;
    });

    this.registerFlowCard('getActionCard', 'refresh_now', async () => {
      await this.poll(true);
    });

    this.registerFlowCard('getActionCard', 'set_disarmed', async () => {
      await this.setAlarmMode('0');
    });

    this.registerFlowCard('getActionCard', 'set_armed_away', async () => {
      await this.setAlarmMode('1');
    });

    this.registerFlowCard('getActionCard', 'set_armed_home', async () => {
      await this.setAlarmMode('2');
    });

    this.registerFlowCard('getActionCard', 'set_alarm_mode', async (args) => {
      await this.setAlarmMode(args.mode);
    });

    this.registerFlowCard('getActionCard', 'acknowledge_alarm', async () => {
      await this.acknowledgeAlarm('Flow');
    });

    this.statusToken = await this.createOrGetToken('woonveilig_status', {
      type: 'string',
      title: 'WoonVeilig status',
      value: this.currentStatus,
    });
    this.pushMessageToken = await this.createOrGetToken('woonveilig_push_message', {
      type: 'string',
      title: 'WoonVeilig melding',
      value: '',
    });

    this.homey.settings.on('set', (key) => {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
        this.log(`Instelling gewijzigd: ${key}`);
        this.restartPolling();
      }
    });

    this.restartPolling();
  }

  getSettings() {
    return {
      url: this.homey.settings.get('url') || DEFAULT_SETTINGS.url,
      username: this.homey.settings.get('username') || DEFAULT_SETTINGS.username,
      password: this.homey.settings.get('password') || DEFAULT_SETTINGS.password,
      area: String(this.homey.settings.get('area') || DEFAULT_SETTINGS.area),
      pollSeconds: Number(this.homey.settings.get('poll_seconds') || DEFAULT_SETTINGS.poll_seconds),
      dryRun: boolSetting(this.homey.settings.get('dry_run'), DEFAULT_SETTINGS.dry_run),
      legacyMode: boolSetting(this.homey.settings.get('legacy_mode'), DEFAULT_SETTINGS.legacy_mode),
      notifyOnAlarm: boolSetting(this.homey.settings.get('notify_on_alarm'), DEFAULT_SETTINGS.notify_on_alarm),
      repeatAlarmNotifications: boolSetting(this.homey.settings.get('repeat_alarm_notifications'), DEFAULT_SETTINGS.repeat_alarm_notifications),
      repeatAlarmSeconds: Number(this.homey.settings.get('repeat_alarm_seconds') || DEFAULT_SETTINGS.repeat_alarm_seconds),
      repeatAlarmMax: Number(this.homey.settings.get('repeat_alarm_max') || DEFAULT_SETTINGS.repeat_alarm_max),
      notifyOnNewAccessory: boolSetting(this.homey.settings.get('notify_on_new_accessory'), DEFAULT_SETTINGS.notify_on_new_accessory),
      notifyOnAccessoryProblem: boolSetting(this.homey.settings.get('notify_on_accessory_problem'), DEFAULT_SETTINGS.notify_on_accessory_problem),
      accessoryProblemSilenceHours: Number(this.homey.settings.get('accessory_problem_silence_hours') || DEFAULT_SETTINGS.accessory_problem_silence_hours),
      pushUserIds: parseJsonArray(this.homey.settings.get('push_user_ids')),
      checkOpenContactsBeforeArm: boolSetting(this.homey.settings.get('check_open_contacts_before_arm'), DEFAULT_SETTINGS.check_open_contacts_before_arm),
      blockArmWithOpenContacts: boolSetting(this.homey.settings.get('block_arm_with_open_contacts'), DEFAULT_SETTINGS.block_arm_with_open_contacts),
      notifyOnUnreachable: boolSetting(this.homey.settings.get('notify_on_unreachable'), DEFAULT_SETTINGS.notify_on_unreachable),
      callWebhookOnAlarm: boolSetting(this.homey.settings.get('call_webhook_on_alarm'), DEFAULT_SETTINGS.call_webhook_on_alarm),
      callWebhookUrl: this.homey.settings.get('call_webhook_url') || DEFAULT_SETTINGS.call_webhook_url,
    };
  }

  restartPolling() {
    if (this.pollTimer) {
      this.homey.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    const settings = this.getSettings();
    const intervalSeconds = Math.max(settings.pollSeconds || DEFAULT_SETTINGS.poll_seconds, 10);

    this.poll(true).catch((error) => this.recordPollError('Eerste poll mislukt', error));
    this.pollTimer = this.homey.setInterval(() => {
      this.poll(false).catch((error) => this.recordPollError('Poll mislukt', error));
    }, intervalSeconds * 1000);
  }

  async poll(forceTrigger) {
    const client = this.getClient();
    const status = await client.getStatus();
    await this.applyStatus(status, forceTrigger);
    await this.homey.settings.set('last_error', '');
    await this.homey.settings.set('last_ok', new Date().toISOString());
    this.log(`WoonVeilig status: ${status.state} (${status.rawMode})`);

    try {
      await this.fetchAccessories();
    } catch (error) {
      this.error('Accessoires uitlezen mislukt:', error.message);
    }
  }

  async recordPollError(prefix, error) {
    const message = `${prefix}: ${friendlyError(error)}`;
    this.error(message);
    try {
      await this.homey.settings.set('last_error', message);
      if (this.getSettings().notifyOnUnreachable) {
        await this.notifyUnreachable(message);
      }
    } catch (settingsError) {
      this.error('Foutmelding opslaan mislukt:', settingsError.message);
    }
  }

  async fetchAccessories() {
    const client = this.getClient();
    const accessories = await client.getAccessories();
    await this.applyAccessories(accessories);
    this.log(`WoonVeilig accessoires: ${accessories.length}`);
    return accessories;
  }

  async listAccessoriesForPairing() {
    let accessories = this.accessories;
    if (!accessories.length) {
      accessories = await this.fetchAccessories();
    }

    if (!accessories.length) {
      throw new Error('Geen accessoires gevonden. Open eerst Apps → WoonVeilig Lokaal → Instellingen en sla de inloggegevens op.');
    }

    return pairingDevices(accessories);
  }

  async listAllDevicesForPairing() {
    this.log('Pairinglijst opbouwen');
    const existingIds = await this.getPairedDeviceIds();
    const devices = [];

    const alarm = alarmPairingDevice();
    if (!existingIds.has(alarm.data.id)) {
      devices.push(alarm);
    }

    let accessories = Array.isArray(this.accessories) ? this.accessories : [];
    if (!accessories.length) {
      try {
        accessories = await this.fetchAccessories();
      } catch (error) {
        this.error('Accessoires ophalen voor pairing mislukt:', error.message);
        if (!devices.length) {
          throw new Error(error.message || 'Kon WoonVeilig niet uitlezen. Controleer de inloggegevens via het tandwiel bij Apps → WoonVeilig Lokaal.');
        }
      }
    }

      for (const device of pairingDevices(accessories)) {
      if (!existingIds.has(device.data.id)) {
        devices.push(device);
      }
    }

    this.log(`Pairinglijst: ${devices.length} apparaten`);
    return devices;
  }

  async getPairedDeviceIds() {
    const ids = new Set();
    for (const driverId of ['alarm', 'accessory']) {
      try {
        const driver = this.homey.drivers.getDriver(driverId);
        for (const device of driver.getDevices()) {
          ids.add(device.getData().id);
        }
      } catch (error) {
        this.error(`Apparaten van driver ${driverId} ophalen mislukt:`, error.message);
      }
    }
    return ids;
  }

  async setAlarmMode(mode) {
    const settings = this.getSettings();
    const modeText = String(mode);

    // Get the status that corresponds to this mode for optimistic UI
    const expectedStatus = statusFromMode(modeText);

    if (settings.dryRun) {
      this.log(`Testmodus: alarmcommando ${modeText} gesimuleerd als ${expectedStatus.state}`);
      await this.applyStatus(expectedStatus, true);
      return;
    }

    if (settings.checkOpenContactsBeforeArm && ['1', '2'].includes(modeText)) {
      const openContacts = await this.getOpenContactsForArming();
      if (openContacts.length) {
        const names = openContacts.slice(0, 5).map((item) => item.name).join(', ');
        const rest = openContacts.length > 5 ? ` en ${openContacts.length - 5} extra` : '';
        const message = `Alarm niet ingeschakeld: ${names}${rest} staat open`;
        await this.addHistory('arming_blocked', message, {
          openContacts: openContacts.map((item) => item.name),
          mode: modeText,
        });
        await this.sendPushNotification(message);
        if (settings.blockArmWithOpenContacts) {
          throw new Error(message);
        }
      }
    }

    try {
      // Set pending mode change BEFORE sending to device (optimistic UI)
      this.pendingModeChange = {
        previousStatus: this.currentStatus,
        requestedStatus: expectedStatus.state,
        initiatedAt: Date.now(),
        timeoutMs: 12000,
      };

      // Immediately show the requested mode in the UI (optimistic update)
      await this.applyStatus(expectedStatus, true);

      // Send the command to the device
      const client = this.getClient();
      await client.setMode(modeText);

      // Poll immediately to confirm the change
      await this.poll(true);
    } catch (error) {
      // On error, revert to the previous status
      this.log(`Fout bij modewijziging: ${error.message}. Terugkeren naar vorige status.`);
      if (this.pendingModeChange.previousStatus) {
        const revertStatus = {
          state: this.pendingModeChange.previousStatus,
          rawMode: this.rawMode,
          alarm: false,
        };
        await this.applyStatus(revertStatus, true);
      }
      // Clear pending state
      this.pendingModeChange = {
        previousStatus: null,
        requestedStatus: null,
        initiatedAt: null,
        timeoutMs: 12000,
      };
      throw error;
    }
  }

  async applyStatus(status, forceTrigger) {
    // Optimistic UI: handle pending mode changes
    let effectiveStatus = status;
    let changed = status.state !== this.currentStatus || status.rawMode !== this.rawMode;

    if (this.pendingModeChange.requestedStatus) {
      const elapsed = Date.now() - this.pendingModeChange.initiatedAt;
      const isStillPending = elapsed < this.pendingModeChange.timeoutMs;

      if (isStillPending) {
        // Still within pending window: ignore polled mode, keep showing requested mode
        effectiveStatus = {
          state: this.pendingModeChange.requestedStatus,
          rawMode: status.rawMode,
          alarm: status.alarm,
        };
        changed = effectiveStatus.state !== this.currentStatus;
      } else {
        // Pending timeout expired: check if device confirmed or reverted
        if (status.state === this.pendingModeChange.requestedStatus) {
          // Device confirmed the change - clear pending state
          this.pendingModeChange = {
            previousStatus: null,
            requestedStatus: null,
            initiatedAt: null,
            timeoutMs: 12000,
          };
        } else if (status.state === this.pendingModeChange.previousStatus) {
          // Device reverted to previous mode (error case) - clear pending and show revert
          this.log(`Modewijziging getimd uit. Teruggekeerd naar vorige status.`);
          this.pendingModeChange = {
            previousStatus: null,
            requestedStatus: null,
            initiatedAt: null,
            timeoutMs: 12000,
          };
        } else {
          // Device is in unexpected state - clear pending but use actual status
          this.log(`Modewijziging getimd uit. Device staat in onverwachte status: ${status.state}`);
          this.pendingModeChange = {
            previousStatus: null,
            requestedStatus: null,
            initiatedAt: null,
            timeoutMs: 12000,
          };
        }
        effectiveStatus = status;
        changed = status.state !== this.currentStatus || status.rawMode !== this.rawMode;
      }
    }

    const previousStatus = this.currentStatus;

    this.currentStatus = effectiveStatus.state;
    this.rawMode = effectiveStatus.rawMode;
    await this.statusToken.setValue(effectiveStatus.state);
    await this.syncAlarmDevices();

    if (forceTrigger || changed) {
      if (this.statusChangedTrigger) {
        await this.statusChangedTrigger.trigger({
          status: effectiveStatus.state,
          raw_mode: String(effectiveStatus.rawMode || ''),
        });
      }
      if (changed) {
        await this.addHistory('status', `Status gewijzigd naar ${statusLabel(effectiveStatus.state)}`, {
          status: effectiveStatus.state,
          rawMode: String(effectiveStatus.rawMode || ''),
        });
      }
    }

    if (effectiveStatus.state === 'triggered') {
      if (changed) {
        this.alarmNotificationAcknowledged = false;
        const message = this.alarmCauseMessage('WoonVeilig alarm gaat af');
        await this.addHistory('alarm', message, {
          status: effectiveStatus.state,
          rawMode: String(effectiveStatus.rawMode || ''),
        });
        if (this.getSettings().notifyOnAlarm) {
          await this.sendPushNotification(message);
          await this.callAlarmWebhook(message);
        }
        await this.triggerAlarmFlow(this.alarmTriggeredTrigger, {
          message,
          status: effectiveStatus.state,
          raw_mode: String(effectiveStatus.rawMode || ''),
        });
      }
      this.startAlarmNotificationLoop();
    } else {
      if (changed && previousStatus === 'triggered') {
        await this.addHistory('alarm_resolved', `Alarm niet meer actief: ${statusLabel(effectiveStatus.state)}`, {
          status: effectiveStatus.state,
          rawMode: String(effectiveStatus.rawMode || ''),
        });
      }
      this.alarmNotificationAcknowledged = false;
      this.stopAlarmNotificationLoop();
    }
  }

  async applyAccessories(accessories) {
    this.accessories = accessories;
    const newAccessories = [];

    for (const accessory of accessories) {
      const previous = this.accessoryById.get(accessory.id);
      const changed = previous && fingerprint(previous) !== fingerprint(accessory);
      // Check if this is truly a new accessory (not seen before, even across app restarts)
      if (!this.seenAccessoryIds.has(accessory.id)) {
        newAccessories.push(accessory);
        this.seenAccessoryIds.add(accessory.id);
      }
      this.accessoryById.set(accessory.id, accessory);

      const device = this.findAccessoryDevice(accessory.id);
      if (device) {
        await device.updateFromAccessory(accessory);
      }

      if (changed && this.accessoryChangedTrigger) {
        await this.accessoryChangedTrigger.trigger({
          name: accessory.name,
          type: accessory.typeLabel,
          status: accessory.statusLabel,
          battery: accessory.batteryOk ? 'OK' : 'Laag',
          tamper: accessory.tamperOk ? 'OK' : 'Sabotage',
        });
      }

      if (changed && this.currentStatus === 'triggered' && this.getSettings().notifyOnAlarm) {
        const previousAlarm = previous && hasActiveAlarm(previous);
        if (!previousAlarm && hasActiveAlarm(accessory)) {
          const message = `WoonVeilig alarm: ${accessory.name} - ${accessory.statusLabel}`;
          await this.addHistory('alarm_sensor', message, {
            accessoryId: accessory.id,
            accessoryName: accessory.name,
            status: accessory.statusLabel,
          });
          await this.sendPushNotification(message);
          await this.callAlarmWebhook(message);
        }
      }

      if (this.accessoriesLoadedOnce && previous && this.getSettings().notifyOnAccessoryProblem) {
        const before = warningFor(previous);
        const after = warningFor(accessory);
        if (after && after !== before) {
          const message = `${accessory.name}: ${after}`;
          await this.addHistory('problem', message, {
            accessoryId: accessory.id,
            accessoryName: accessory.name,
            status: accessory.statusLabel,
          });
          if (await this.shouldNotifyAccessoryProblem(accessory, after)) {
            await this.sendPushNotification(message);
          }
        }
      }
    }

    this.pruneAccessoryMap(accessories);
    await this.saveAccessoriesOverview(accessories);
    await this.syncAlarmAccessoryWarnings();
    await this.notifyNewAccessories(newAccessories);
    // Persist seen accessory IDs to survive app restarts
    await this.homey.settings.set('seen_accessory_ids', JSON.stringify(Array.from(this.seenAccessoryIds)));
    this.accessoriesLoadedOnce = true;
  }

  async syncAlarmAccessoryWarnings() {
    for (const device of this.alarmDevices) {
      if (!device.applyAlarmAccessoriesWarning) continue;
      try {
        await device.applyAlarmAccessoriesWarning(this.accessories);
      } catch (error) {
        this.error('Alarmwaarschuwing bijwerken mislukt:', error.message);
      }
    }
  }

  async saveAccessoriesOverview(accessories) {
    const overview = accessories.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      typeLabel: item.typeLabel,
      statusLabel: item.statusLabel,
      batteryOk: item.batteryOk,
      tamperOk: item.tamperOk,
      rssi: item.rssi,
    }));

    try {
      await this.homey.settings.set('accessories_overview', JSON.stringify(overview));
    } catch (error) {
      this.error('Accessoirelijst opslaan mislukt:', error.message);
    }
  }

  pruneAccessoryMap(accessories) {
    const ids = new Set(accessories.map((item) => item.id));
    for (const id of this.accessoryById.keys()) {
      if (!ids.has(id)) this.accessoryById.delete(id);
    }
  }

  findAccessoryDevice(id) {
    return [...this.accessoryDevices].find((device) => device.getData().id === id);
  }

  registerAlarmDevice(device) {
    this.alarmDevices.add(device);
    this.syncAlarmDevice(device).catch((error) => this.error('Device sync mislukt:', error.message));
    if (device.applyAlarmAccessoriesWarning) {
      device.applyAlarmAccessoriesWarning(this.accessories).catch((error) => {
        this.error('Alarmwaarschuwing bijwerken mislukt:', error.message);
      });
    }
  }

  unregisterAlarmDevice(device) {
    this.alarmDevices.delete(device);
  }

  registerAccessoryDevice(device) {
    this.accessoryDevices.add(device);
    const accessory = this.accessoryById.get(device.getData().id);
    if (accessory) {
      device.updateFromAccessory(accessory).catch((error) => this.error('Accessoire-sync mislukt:', error.message));
    }
  }

  unregisterAccessoryDevice(device) {
    this.accessoryDevices.delete(device);
  }

  async syncAlarmDevices() {
    await Promise.all([...this.alarmDevices].map((device) => this.syncAlarmDevice(device)));
  }

  async syncAlarmDevice(device) {
    if (!device || !device.updateStatus) return;
    await device.updateStatus({
      state: this.currentStatus,
      rawMode: this.rawMode,
    });
  }

  getClient() {
    const settings = this.getSettings();
    if (!settings.username || !settings.password) {
      throw new Error('Vul eerst WoonVeilig gebruikersnaam en wachtwoord in bij de app-instellingen.');
    }

    const clientConfig = {
      url: settings.url,
      username: settings.username,
      password: settings.password,
      area: settings.area,
    };

    if (settings.legacyMode) {
      this.log('Using legacy WV-1716 client');
      return new WoonveiligClientLegacy(clientConfig);
    }

    return new WoonveiligClient(clientConfig);
  }

  getFlowCard(method, id) {
    try {
      return this.homey.flow[method](id);
    } catch (error) {
      this.error(`Flow-kaart ${id} niet beschikbaar:`, error.message);
      return null;
    }
  }

  registerFlowCard(method, id, listener) {
    const card = this.getFlowCard(method, id);
    if (!card) return;
    card.registerRunListener(listener);
  }

  async createOrGetToken(id, options) {
    try {
      return await this.homey.flow.createToken(id, options);
    } catch (error) {
      const token = this.homey.flow.getToken(id);
      if (token) return token;
      throw error;
    }
  }

  async sendPushNotification(message, options = {}) {
    const text = String(message || '').trim() || 'WoonVeilig melding';
    try {
      if (this.pushMessageToken) {
        await this.pushMessageToken.setValue(text);
      }
      await this.triggerAlarmFlow(this.testNotificationTrigger, { message: text });
      const result = await this.push.send(text);
      const how = result.push
        ? 'Telefoon-push verstuurd'
        : 'Homey-melding gezet. Kijk op je telefoon; er is een Homey-flow voor de push.';
      await this.homey.settings.set('last_push_status', `${how}: ${new Date().toLocaleString('nl-NL')}`);
      return { ok: true, message: text, ...result };
    } catch (error) {
      const friendly = `Melding versturen mislukt: ${error.message}`;
      this.error(friendly);
      try {
        await this.homey.settings.set('last_push_status', friendly);
      } catch (settingsError) {
        this.error('Pushstatus opslaan mislukt:', settingsError.message);
      }
      if (options.throwOnError) throw error;
      return { ok: false, error: error.message };
    }
  }

  async callAlarmWebhook(message) {
    const settings = this.getSettings();
    if (!settings.callWebhookOnAlarm || !settings.callWebhookUrl) return;

    try {
      const url = new URL(settings.callWebhookUrl);
      url.searchParams.set('message', message);
      url.searchParams.set('status', this.currentStatus);
      await requestUrl(url);
    } catch (error) {
      this.error('Alarm-webhook aanroepen mislukt:', error.message);
    }
  }

  async notifyNewAccessories(accessories) {
    if (!accessories.length || !this.getSettings().notifyOnNewAccessory) return;

    const names = accessories.slice(0, 5).map((item) => item.name).join(', ');
    const rest = accessories.length > 5 ? ` en ${accessories.length - 5} extra` : '';
    const message = `WoonVeilig nieuw onderdeel gevonden: ${names}${rest}`;
    await this.addHistory('new_accessory', message, {
      count: accessories.length,
      names: accessories.map((item) => item.name),
    });
    await this.sendPushNotification(message);
  }

  alarmCauseMessage(fallback) {
    const active = (this.accessories || []).filter((accessory) => hasActiveAlarm(accessory));
    if (!active.length) return fallback;

    const first = active[0];
    return `${fallback}: ${first.name} - ${first.statusLabel}`;
  }

  async getOpenContactsForArming() {
    let accessories = this.accessories || [];
    if (!accessories.length) {
      accessories = await this.fetchAccessories();
    }
    return openContactsForArming(accessories);
  }

  async shouldNotifyAccessoryProblem(accessory, warning) {
    const settings = this.getSettings();
    const hours = Math.max(settings.accessoryProblemSilenceHours || DEFAULT_SETTINGS.accessory_problem_silence_hours, 0);
    if (hours === 0) return true;

    const key = `${accessory.id}:${warning}`;
    const now = Date.now();
    const notified = parseJsonObject(this.homey.settings.get('problem_notification_times'));
    const last = Number(notified[key] || 0);
    if (last && now - last < hours * 60 * 60 * 1000) {
      return false;
    }
    notified[key] = now;
    await this.homey.settings.set('problem_notification_times', JSON.stringify(pruneRecentTimestamps(notified, now, 14 * 24 * 60 * 60 * 1000)));
    return true;
  }

  async notifyUnreachable(message) {
    const now = Date.now();
    const last = Number(this.homey.settings.get('last_unreachable_notification_at') || 0);
    if (last && now - last < 60 * 60 * 1000) return;

    await this.homey.settings.set('last_unreachable_notification_at', now);
    await this.addHistory('unreachable', message, { status: this.currentStatus });
    await this.sendPushNotification(message);
  }

  async testConnection() {
    const status = await this.getClient().getStatus();
    const accessories = await this.fetchAccessories();
    return {
      ok: true,
      status: status.state,
      rawMode: status.rawMode,
      accessories: accessories.length,
    };
  }

  async testPushNotification(message = 'WoonVeilig Lokaal testmelding') {
    const result = await this.sendPushNotification(String(message || 'WoonVeilig Lokaal testmelding'), { throwOnError: true });
    return {
      ok: true,
      message: result.message,
      hint: result.push
        ? 'Kijk op je telefoon. Er is geen Flow nodig die je zelf moet maken.'
        : 'De Homey-melding is gezet. Als je geen push ziet, kijk onder het belletje in Homey of bij de meldingen van de Homey-app.',
    };
  }

  async getPushUsers() {
    const users = await this.push.listUsers();
    const selectedIds = new Set(this.getSettings().pushUserIds);
    return users.map((user) => ({
      id: user.id,
      athomId: user.athomId,
      name: user.name || user.id,
      selected: selectedIds.size === 0 || selectedIds.has(user.id),
    }));
  }

  async acknowledgeAlarm(source = 'Homey') {
    this.alarmNotificationAcknowledged = true;
    this.stopAlarmNotificationLoop();
    await this.homey.settings.set('alarm_acknowledged_at', new Date().toISOString());
    await this.addHistory('acknowledged', `Alarmmelding bevestigd via ${source}`, {
      status: this.currentStatus,
      rawMode: String(this.rawMode || ''),
    });
    return { ok: true, acknowledged: true };
  }

  getAlarmHistory() {
    return parseJsonArray(this.homey.settings.get('alarm_history'));
  }

  getDashboard() {
    const accessories = Array.isArray(this.accessories) ? this.accessories : [];
    const problems = accessories
      .map((accessory) => {
        const warning = warningFor(accessory);
        return warning ? { id: accessory.id, name: accessory.name, warning } : null;
      })
      .filter(Boolean);
    const openContacts = openContactsForArming(accessories);

    return {
      status: this.currentStatus,
      statusLabel: statusLabel(this.currentStatus),
      rawMode: String(this.rawMode || ''),
      accessories: accessories.length,
      problems: problems.length,
      openContacts: openContacts.length,
      openContactNames: openContacts.slice(0, 6).map((item) => item.name),
      problemNames: problems.slice(0, 6).map((item) => `${item.name}: ${item.warning}`),
      lastOk: this.homey.settings.get('last_ok') || '',
      lastError: this.homey.settings.get('last_error') || '',
      alarmAcknowledged: this.alarmNotificationAcknowledged,
    };
  }

  async clearAlarmHistory() {
    await this.homey.settings.set('alarm_history', JSON.stringify([]));
    return { ok: true };
  }

  async addHistory(type, message, data = {}) {
    const entry = {
      at: new Date().toISOString(),
      type,
      message,
      status: this.currentStatus,
      ...data,
    };
    const history = [entry, ...this.getAlarmHistory()].slice(0, 75);
    try {
      await this.homey.settings.set('alarm_history', JSON.stringify(history));
    } catch (error) {
      this.error('Alarmgeschiedenis opslaan mislukt:', error.message);
    }
  }

  exportSettings() {
    const settings = this.getSettings();
    return {
      url: settings.url,
      username: settings.username,
      area: settings.area,
      poll_seconds: settings.pollSeconds,
      dry_run: settings.dryRun,
      notify_on_alarm: settings.notifyOnAlarm,
      repeat_alarm_notifications: settings.repeatAlarmNotifications,
      repeat_alarm_seconds: settings.repeatAlarmSeconds,
      repeat_alarm_max: settings.repeatAlarmMax,
      notify_on_new_accessory: settings.notifyOnNewAccessory,
      notify_on_accessory_problem: settings.notifyOnAccessoryProblem,
      accessory_problem_silence_hours: settings.accessoryProblemSilenceHours,
      push_user_ids: settings.pushUserIds,
      check_open_contacts_before_arm: settings.checkOpenContactsBeforeArm,
      block_arm_with_open_contacts: settings.blockArmWithOpenContacts,
      notify_on_unreachable: settings.notifyOnUnreachable,
      call_webhook_on_alarm: settings.callWebhookOnAlarm,
      call_webhook_url: settings.callWebhookUrl,
      password_included: false,
    };
  }

  async triggerAlarmFlow(card, tokens) {
    try {
      if (!card) return;
      await card.trigger(tokens);
    } catch (error) {
      this.error('Alarmflow triggeren mislukt:', error.message);
    }
  }

  startAlarmNotificationLoop() {
    const settings = this.getSettings();
    if (!settings.notifyOnAlarm || !settings.repeatAlarmNotifications) return;
    if (this.alarmNotificationAcknowledged) return;
    if (this.alarmNotificationTimer) return;

    const intervalSeconds = Math.max(settings.repeatAlarmSeconds || DEFAULT_SETTINGS.repeat_alarm_seconds, 10);
    const maxNotifications = Math.max(settings.repeatAlarmMax || DEFAULT_SETTINGS.repeat_alarm_max, 1);
    this.alarmNotificationCount = 0;

    this.alarmNotificationTimer = this.homey.setInterval(() => {
      if (this.currentStatus !== 'triggered') {
        this.stopAlarmNotificationLoop();
        return;
      }
      if (this.alarmNotificationAcknowledged) {
        this.stopAlarmNotificationLoop();
        return;
      }

      this.alarmNotificationCount += 1;
      if (this.alarmNotificationCount > maxNotifications) {
        this.stopAlarmNotificationLoop();
        return;
      }

      const message = `WoonVeilig alarm gaat nog steeds af (${this.alarmNotificationCount}/${maxNotifications})`;
      this.addHistory('alarm_repeat', message, {
        count: this.alarmNotificationCount,
        max: maxNotifications,
      });
      this.sendPushNotification(message);
      this.callAlarmWebhook(message);
      this.triggerAlarmFlow(this.alarmRepeatTrigger, {
        message,
        count: this.alarmNotificationCount,
        max: maxNotifications,
      });
    }, intervalSeconds * 1000);
  }

  stopAlarmNotificationLoop() {
    if (!this.alarmNotificationTimer) return;
    this.homey.clearInterval(this.alarmNotificationTimer);
    this.alarmNotificationTimer = null;
    this.alarmNotificationCount = 0;
  }
}

function requestUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, { method: 'POST', timeout: 10000 }, (response) => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }

        reject(new Error(`HTTP ${response.statusCode}`));
      });
    });

    request.on('timeout', () => request.destroy(new Error('Timeout bij externe alarm-webhook')));
    request.on('error', reject);
    request.end();
  });
}

function friendlyError(error) {
  const message = String(error && error.message ? error.message : error || '');
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return 'Inloggen mislukt. Controleer WoonVeilig gebruikersnaam en wachtwoord.';
  }
  if (/timeout/i.test(message)) {
    return 'Geen antwoord van WoonVeilig. Controleer IP-adres en netwerk.';
  }
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH/i.test(message)) {
    return 'WoonVeilig centrale niet bereikbaar. Controleer IP-adres en netwerk.';
  }
  return message || 'Onbekende fout';
}

function boolSetting(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'ja', 'on'].includes(String(value).toLowerCase());
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function pruneRecentTimestamps(values, now, maxAgeMs) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => now - Number(value || 0) <= maxAgeMs)
      .slice(-150),
  );
}

function statusLabel(status) {
  return {
    disarmed: 'Uit',
    armed_away: 'Aan',
    armed_home: 'Thuis',
    triggered: 'Alarm',
    unknown: 'Onbekend',
  }[status] || String(status || 'Onbekend');
}

function openContactsForArming(accessories) {
  return (accessories || []).filter((accessory) => (
    accessory
      && accessory.kind === 'contact'
      && accessory.contactAlarm
      && accessory.condOk
      && !accessory.bypass
  ));
}

function hasActiveAlarm(accessory) {
  return Boolean(
    accessory.contactAlarm
      || accessory.motionAlarm
      || accessory.smokeAlarm
      || accessory.waterAlarm
      || accessory.heatAlarm
      || accessory.coAlarm
      || accessory.genericAlarm
      || accessory.tamperAlarm,
  );
}

function statusFromMode(mode) {
  const text = String(mode);
  if (text === '0') return { state: 'disarmed', rawMode: '0' };
  if (text === '1') return { state: 'armed_away', rawMode: '1' };
  if (['2', '3', '4'].includes(text)) return { state: 'armed_home', rawMode: text };
  return { state: 'unknown', rawMode: text };
}

module.exports = WoonveiligLocalApp;

