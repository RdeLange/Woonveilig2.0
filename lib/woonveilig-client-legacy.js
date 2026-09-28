'use strict';

const net = require('net');

class WoonveiligClientLegacy {
  constructor({ url, username, password, area }) {
    this.baseUrl = new URL(String(url || '').replace(/\/$/, ''));
    this.username = username;
    this.password = password;
    this.area = String(area || '1');
    this.lastLogDate = new Date(1970, 0, 1);
  }

  async getStatus() {
    const payload = await this.requestJson('/action/historyGet', 'GET');
    const logs = this.parseEventLogs(payload);

    const state = this.deriveStateFromLogs(logs);
    const alarm = this.deriveAlarmFromLogs(logs);

    return {
      state,
      rawMode: String(state),
      alarm,
    };
  }

  async setMode(mode) {
    const legacyMode = this.modernModeToLegacy(mode);
    const body = `area=${encodeURIComponent(this.area)}&mode=${encodeURIComponent(legacyMode)}`;
    await this.requestJson('/action/panelCondPost', 'POST', body);
    return this.getStatus();
  }

  async getAccessories() {
    try {
      const { normalizeAccessory } = require('./accessories');

      // Fetch sensor list from sensorListGet
      const sensorPayload = await this.requestJson('/action/sensorListGet', 'GET');
      const rows = Array.isArray(sensorPayload?.senrows)
        ? sensorPayload.senrows
        : Array.isArray(sensorPayload?.sensors)
          ? sensorPayload.sensors
          : Array.isArray(sensorPayload)
            ? sensorPayload
            : [];

      // Fetch real-time status from panelCondGet (includes door open/close via tamper field)
      let panelStatus = {};
      try {
        const panelPayload = await this.requestJson('/action/panelCondGet', 'GET');
        panelStatus = panelPayload?.updates || panelPayload || {};
      } catch (panelError) {
        this.log(`Could not fetch panelCondGet, using sensorListGet only: ${panelError.message}`);
      }

      // Normalize sensor data with real-time status from panelCondGet
      const accessories = rows
        .map(row => this.normalizeLegacySensorWithStatus(row, panelStatus))
        .map(row => normalizeAccessory(row))
        .filter(Boolean);

      return accessories;
    } catch (error) {
      this.log(`Failed to fetch accessories: ${error.message}`);
      return [];
    }
  }

  normalizeLegacySensorWithStatus(row, panelStatus) {
    if (!row || typeof row !== 'object') return null;

    // First normalize the sensor data
    const normalized = this.normalizeLegacySensor(row);

    // Then overlay real-time status from panelCondGet
    if (panelStatus) {
      // tamper field in panelCondGet indicates door/contact state
      // "Close" = door closed/contact ok, "Open" = door open
      if (panelStatus.tamper) {
        normalized.cond = panelStatus.tamper;  // "Close" or "Open"
        normalized.cond_ok = panelStatus.tamper === 'Close' ? '1' : '';
      }

      // Battery status from panelCondGet
      if (panelStatus.battery) {
        normalized.battery_ok = panelStatus.battery === 'Normal' ? '1' : '';
      }

      // Signal strength if available
      if (panelStatus.rssi) {
        normalized.rssi = String(panelStatus.rssi);
      }
    }

    return normalized;
  }

  normalizeLegacySensor(row) {
    if (!row || typeof row !== 'object') return null;

    // Convert legacy field names to standard format expected by normalizeAccessory
    // Important: boolean flags must be either '1'/'ok' (true) or empty string (use fallback)
    // NOT boolean true/false, as isOkFlag() converts to string and matches '1'/'ok' only
    const normalized = {
      id: String(row.id || row.no || row.zone || 'unknown').trim(),
      area: String(row.area || '1'),
      zone: String(row.zone || '').trim(),
      name: String(row.name || row.type || 'Accessoire').trim(),
      type: this.parseType(row.type),
      type_f: String(row.type || '').trim(),
      status: String(row.status || row.cond || '').trim(),
      cond: String(row.cond || '').trim(),
      // Keep raw values - let normalizeAccessory's isOkFlag() interpret them
      // Empty string with fallback=true means "use default (true)"
      cond_ok: row.cond_ok || '',
      battery_ok: row.battery_ok || '',
      battery: String(row.battery || '').trim(),
      tamper_ok: row.tamper_ok || '',
      rssi: String(row.rssi || row.signal || '').trim(),
      bypass: (String(row.bypass || '').toLowerCase() === 'yes'),
    };
    return normalized;
  }

  parseType(typeValue) {
    if (typeof typeValue === 'number') return typeValue;
    // Map type names to numbers (legacy systems return strings)
    // Includes alternatives found in python-egardia, Domoticz, and other WV-1716 implementations
    const typeMap = {
      // Door/Window Contacts (type 4)
      'door contact': 4,
      'door': 4,
      'deur contact': 4,
      'deurcontact': 4,
      'window contact': 4,
      'window': 4,
      'raam contact': 4,
      'raamcontact': 4,
      'contact': 4,
      'reed': 4,

      // Motion Detectors / IR (type 9)
      'ir': 9,
      'pir': 9,
      'motion': 9,
      'motion detector': 9,
      'bewegingssensor': 9,
      'beweging': 9,
      'infrared': 9,

      // Remote Controls (type 2)
      'remote': 2,
      'remote control': 2,
      'afstandsbediening': 2,

      // Panic Buttons (type 3, 6)
      'panic': 3,
      'panic button': 3,
      'panic alarm': 3,
      'paniekknop': 3,
      'paniek': 3,

      // Water Sensors (type 5)
      'water': 5,
      'water sensor': 5,
      'water leak': 5,
      'watersensor': 5,
      'lekkage': 5,

      // Gas Sensors (type 7)
      'gas': 7,
      'gas sensor': 7,
      'gassensor': 7,

      // Heat/Fire Sensors (type 8)
      'heat': 8,
      'heat sensor': 8,
      'fire': 8,
      'hittemelder': 8,
      'hitte': 8,
      'brand': 8,

      // Smoke Detectors (type 11)
      'smoke': 11,
      'smoke detector': 11,
      'smoke sensor': 11,
      'rookmelder': 11,
      'rook': 11,

      // CO Detectors (type 12)
      'co': 12,
      'co detector': 12,
      'co sensor': 12,
      'co-melder': 12,
      'koolmonoxide': 12,

      // Medical Buttons (type 13)
      'medical': 13,
      'medical alert': 13,

      // Glass Break (type 14)
      'glass': 14,
      'glass break': 14,
      'glasbreuk': 14,

      // Keypad (type 15)
      'keypad': 15,
      'keyboard': 15,
      'toetsenbord': 15,

      // Vibration (type 16)
      'vibration': 16,
      'vibration sensor': 16,
      'trilling': 16,

      // Siren (type 45)
      'siren': 45,
      'sirene': 45,
      'alarm': 45,
    };
    const key = String(typeValue || '').toLowerCase().trim();
    return typeMap[key] || 0;
  }


  async requestJson(path, method, body) {
    // Challenge-response authentication for older Mongoose webserver
    await this.requestRaw(path, method, null, body).catch(() => null);
    const response = await this.requestRaw(path, method, this.authHeader(), body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`WoonVeilig HTTP ${response.statusCode}: ${response.body.trim()}`);
    }

    return this.cleanAndParseJson(response.body);
  }

  requestRaw(path, method, authorization, body) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        {
          host: this.baseUrl.hostname,
          port: Number(this.baseUrl.port || 80),
        },
        () => {
          const lines = [
            `${method} ${path} HTTP/1.0`,
            `Host: ${this.baseUrl.host}`,
            'Accept: application/json',
            'Connection: close',
          ];

          if (authorization) lines.push(`Authorization: ${authorization}`);
          if (body) {
            lines.push('Content-Type: application/x-www-form-urlencoded');
            lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
          }

          lines.push('', body || '');
          socket.write(lines.join('\r\n'));
        },
      );

      let data = '';
      socket.setEncoding('utf8');
      socket.setTimeout(10000, () => socket.destroy(new Error('WoonVeilig timeout')));
      socket.on('data', (chunk) => {
        data += chunk;
      });
      socket.on('error', reject);
      socket.on('end', () => {
        const separator = data.indexOf('\r\n\r\n');
        const head = separator === -1 ? data : data.slice(0, separator);
        const responseBody = separator === -1 ? '' : data.slice(separator + 4);
        const statusLine = head.split('\r\n')[0] || '';
        const statusCode = Number(statusLine.split(' ')[1]);

        if (!Number.isFinite(statusCode)) {
          reject(new Error(`Invalid WoonVeilig response: ${statusLine || 'empty response'}`));
          return;
        }

        resolve({ statusCode, body: responseBody });
      });
    });
  }

  authHeader() {
    const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return `Basic ${token}`;
  }

  cleanAndParseJson(input) {
    try {
      // Remove security wrapper comments
      let cleaned = input.replace('/*-secure-', '').replace('*/', '');

      // Remove all unnecessary whitespace/newlines/tabs
      cleaned = cleaned.replace(/[\n\r\t]/gm, '').replace(/\s+/g, ' ').trim();

      // Fix object structure: { hisrows : [ → {"hisrows":[, etc.
      cleaned = cleaned.replace(/\{\s*hisrows\s*:\s*\[/g, '{"hisrows":[');
      cleaned = cleaned.replace(/\{\s*senrows\s*:\s*\[/g, '{"senrows":[');
      cleaned = cleaned.replace(/\{\s*sensors\s*:\s*\[/g, '{"sensors":[');
      cleaned = cleaned.replace(/\{\s*updates\s*:\s*\{/g, '{"updates":{');
      cleaned = cleaned.replace(/\{\s*forms\s*:\s*\{/g, '{"forms":{');

      // Quote unquoted property names using regex
      // Matches: d: or d : or d  : and replaces with "d":
      cleaned = cleaned.replace(/\bd\s*:/g, '"d":');
      cleaned = cleaned.replace(/\bt\s*:/g, '"t":');
      cleaned = cleaned.replace(/\ba\s*:/g, '"a":');
      cleaned = cleaned.replace(/\bs\s*:/g, '"s":');
      cleaned = cleaned.replace(/\bno\s*:/g, '"no":');
      cleaned = cleaned.replace(/\btype\s*:/g, '"type":');
      cleaned = cleaned.replace(/\btype_f\s*:/g, '"type_f":');
      cleaned = cleaned.replace(/\barea\s*:/g, '"area":');
      cleaned = cleaned.replace(/\bzone\s*:/g, '"zone":');
      cleaned = cleaned.replace(/\bname\s*:/g, '"name":');
      cleaned = cleaned.replace(/\battr\s*:/g, '"attr":');
      cleaned = cleaned.replace(/\bcond\s*:/g, '"cond":');
      cleaned = cleaned.replace(/\bcond_ok\s*:/g, '"cond_ok":');
      cleaned = cleaned.replace(/\bbattery\s*:/g, '"battery":');
      cleaned = cleaned.replace(/\bbattery_ok\s*:/g, '"battery_ok":');
      cleaned = cleaned.replace(/\btamper_ok\s*:/g, '"tamper_ok":');
      cleaned = cleaned.replace(/\btamp\s*:/g, '"tamp":');
      cleaned = cleaned.replace(/\btamper\s*:/g, '"tamper":');
      cleaned = cleaned.replace(/\brssi\s*:/g, '"rssi":');
      cleaned = cleaned.replace(/\bsignal\s*:/g, '"signal":');
      cleaned = cleaned.replace(/\bstatus\s*:/g, '"status":');
      cleaned = cleaned.replace(/\bid\s*:/g, '"id":');
      cleaned = cleaned.replace(/\bbypass\s*:/g, '"bypass":');
      // panelCondGet fields
      cleaned = cleaned.replace(/\bupdates\s*:/g, '"updates":');
      cleaned = cleaned.replace(/\bforms\s*:/g, '"forms":');
      cleaned = cleaned.replace(/\bmode_st\s*:/g, '"mode_st":');
      cleaned = cleaned.replace(/\binterference\s*:/g, '"interference":');
      cleaned = cleaned.replace(/\bac_activation\s*:/g, '"ac_activation":');
      cleaned = cleaned.replace(/\bpcondform\s*:/g, '"pcondform":');
      cleaned = cleaned.replace(/\bmode\s*:/g, '"mode":');
      cleaned = cleaned.replace(/\brssi\s*:/g, '"rssi":');

      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Failed to parse WoonVeilig response: ${error.message}`);
    }
  }

  parseEventLogs(payload) {
    try {
      const rows = Array.isArray(payload?.hisrows) ? payload.hisrows : [];

      return rows.map((row) => {
        if (!row || typeof row !== 'object') return null;

        return {
          date: String(row.d || '').trim(),
          time: String(row.t || '').trim(),
          action: String(row.a || '').trim(),
          source: String(row.s || '').trim(),
          logTime: this.parseLogTime(row.d, row.t),
        };
      }).filter(Boolean);
    } catch (error) {
      this.error(`Failed to parse event logs: ${error.message}`);
      return [];
    }
  }

  parseLogTime(date, time) {
    try {
      const d = new Date();
      const year = d.getFullYear();
      const [month, day] = String(date || '').split('/');
      const cleanTime = String(time || '').includes(':') ? time : `${time}:00`;

      // Pad month and day to 2 digits for ISO 8601 format
      const paddedMonth = String(month).padStart(2, '0');
      const paddedDay = String(day).padStart(2, '0');

      const dateString = `${year}-${paddedMonth}-${paddedDay}T${cleanTime}`;
      const result = new Date(dateString);

      if (isNaN(result.getTime())) {
        return new Date(0);
      }

      return result;
    } catch (error) {
      return new Date(0);
    }
  }

  deriveStateFromLogs(logs) {
    const modeChangedLogs = logs
      .filter((log) => this.isModeChangeAction(log.action))
      .sort((a, b) => b.logTime.getTime() - a.logTime.getTime());

    if (modeChangedLogs.length === 0) {
      return 'unknown';
    }

    const lastModeChange = modeChangedLogs[0];
    return this.legacyModeToModern(lastModeChange.action);
  }

  deriveAlarmFromLogs(logs) {
    const alarmLogs = logs.filter((log) => this.isAlarmAction(log.action));
    const modeChangedLogs = logs
      .filter((log) => this.isModeChangeAction(log.action))
      .sort((a, b) => b.logTime.getTime() - a.logTime.getTime());

    if (alarmLogs.length === 0) {
      return false;
    }

    const lastAlarm = alarmLogs[alarmLogs.length - 1];

    if (modeChangedLogs.length > 0) {
      const lastModeChange = modeChangedLogs[0];
      if (lastModeChange.logTime > lastAlarm.logTime) {
        return false;
      }
    }

    return true;
  }

  isModeChangeAction(action) {
    const text = String(action || '').trim().toLowerCase();
    return ['arm', 'disarm', 'home'].includes(text);
  }

  isAlarmAction(action) {
    const text = String(action || '').trim().toLowerCase();
    return text.includes('alarm') || text.includes('burglar') || text.includes('timeout');
  }

  modernModeToLegacy(modernMode) {
    const mode = String(modernMode || '').trim().toLowerCase();

    if (/^(0|disarm|disarmed|uit|off)$/.test(mode)) return '0';
    if (/^(1|arm|armed|armed_away|away|aan)$/.test(mode)) return '1';
    if (/^(2|3|4|armed_home|home|partial|thuis)$/.test(mode)) return '2';

    return '0';
  }

  legacyModeToModern(legacyMode) {
    const text = String(legacyMode || '').trim().toLowerCase();

    if (['disarm', '0'].includes(text)) return 'disarmed';
    if (['arm', 'full arm', '1'].includes(text)) return 'armed_away';
    if (['home', 'home arm 1', 'home arm 2', 'home arm 3', '2', '3', '4'].includes(text)) return 'armed_home';

    return 'unknown';
  }

  replaceAll(str, findOrRegex, replace) {
    if (typeof findOrRegex === 'string') {
      return str.replace(new RegExp(findOrRegex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
    }
    return str.replace(findOrRegex, replace);
  }
}

module.exports = WoonveiligClientLegacy;
