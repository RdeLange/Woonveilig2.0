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
      const payload = await this.requestJson('/action/sensorListGet', 'GET');
      const { normalizeAccessory } = require('./accessories');

      // Parse sensor list - handle both array and wrapped response
      const rows = Array.isArray(payload?.sensors)
        ? payload.sensors
        : Array.isArray(payload)
          ? payload
          : [];

      // Normalize legacy sensor data using standard accessory normalizer
      const accessories = rows
        .map(row => normalizeAccessory(row))
        .filter(Boolean);

      return accessories;
    } catch (error) {
      this.log(`Failed to fetch accessories: ${error.message}`);
      return [];
    }
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

      // Fix object structure: { hisrows : [ → {"hisrows":[
      cleaned = cleaned.replace(/\{\s*hisrows\s*:\s*\[/g, '{"hisrows":[');
      cleaned = cleaned.replace(/\{\s*sensors\s*:\s*\[/g, '{"sensors":[');

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
      cleaned = cleaned.replace(/\bcond\s*:/g, '"cond":');
      cleaned = cleaned.replace(/\bcond_ok\s*:/g, '"cond_ok":');
      cleaned = cleaned.replace(/\bbattery\s*:/g, '"battery":');
      cleaned = cleaned.replace(/\bbattery_ok\s*:/g, '"battery_ok":');
      cleaned = cleaned.replace(/\btamper_ok\s*:/g, '"tamper_ok":');
      cleaned = cleaned.replace(/\brssi\s*:/g, '"rssi":');
      cleaned = cleaned.replace(/\bstatus\s*:/g, '"status":');
      cleaned = cleaned.replace(/\bid\s*:/g, '"id":');

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
