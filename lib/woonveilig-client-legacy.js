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
    return [];
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

      // Fix object structure from {	hisrows : [ to {"hisrows":[
      cleaned = cleaned.replace('{	hisrows : [', '{"hisrows":[');
      cleaned = cleaned.replace('{ hisrows : [', '{"hisrows":[');

      // Remove all whitespace and newlines
      cleaned = cleaned.replace(/ {4}|[\t\n\r]/gm, '');

      // Quote unquoted property names: d:, t:, a:, s: → "d":, "t":, "a":, "s":
      const properties = ['d', 't', 'a', 's'];
      for (const prop of properties) {
        cleaned = this.replaceAll(cleaned, prop + ' :', `"${prop}":`);
      }

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

      return new Date(`${year}-${month}-${day}T${cleanTime}`);
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
    return text.includes('alarm') || text.includes('burglary') || text.includes('timeout');
  }

  modernModeToLegacy(modernMode) {
    const mode = String(modernMode || '').trim().toLowerCase();

    if (['0', 'disarm', 'disarmed', 'uit', 'off'].includes(mode)) return '0';
    if (['1', 'arm', 'armed', 'away', 'aan'].includes(mode)) return '1';
    if (['2', '3', '4', 'home', 'partial', 'thuis'].includes(mode)) return '2';

    return '0';
  }

  legacyModeToModern(legacyMode) {
    const text = String(legacyMode || '').trim().toLowerCase();

    if (['disarm', '0'].includes(text)) return 'disarmed';
    if (['arm', 'full arm', '1'].includes(text)) return 'armed_away';
    if (['home', 'home arm 1', 'home arm 2', 'home arm 3', '2', '3', '4'].includes(text)) return 'armed_home';

    return 'unknown';
  }

  replaceAll(str, find, replace) {
    return str.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
  }
}

module.exports = WoonveiligClientLegacy;
