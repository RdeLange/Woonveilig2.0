'use strict';

const net = require('net');
const { parseDeviceList } = require('./accessories');

class WoonveiligClient {
  constructor({ url, username, password, area }) {
    this.baseUrl = new URL(String(url || '').replace(/\/$/, ''));
    this.username = username;
    this.password = password;
    this.area = String(area || '1');
  }

  async getStatus() {
    const payload = await this.requestJson('/action/panelCondGet', 'GET');
    const formMode = payload?.forms?.[`pcondform${this.area}`]?.mode;
    const updateMode = payload?.updates?.[`mode_a${this.area}`];
    const rawMode = formMode ?? updateMode ?? '';

    return {
      state: this.normalizeMode(rawMode),
      rawMode: String(rawMode),
    };
  }

  async setMode(mode) {
    const body = `area=${encodeURIComponent(this.area)}&mode=${encodeURIComponent(mode)}`;
    await this.requestJson('/action/panelCondPost', 'POST', body);
    return this.getStatus();
  }

  async getAccessories() {
    const payload = await this.requestJson('/action/deviceListGet', 'GET');
    return parseDeviceList(payload).filter((item) => !item.area || item.area === this.area);
  }

  async requestJson(path, method, body) {
    // This older Mongoose webserver expects a challenge before Basic auth.
    await this.requestRaw(path, method, null, body).catch(() => null);
    const response = await this.requestRaw(path, method, this.authHeader(), body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`WoonVeilig HTTP ${response.statusCode}: ${response.body.trim()}`);
    }

    return JSON.parse(response.body);
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
      socket.setTimeout(10000, () => socket.destroy(new Error('Timeout bij WoonVeilig')));
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
          reject(new Error(`Ongeldig WoonVeilig antwoord: ${statusLine || 'leeg antwoord'}`));
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

  normalizeMode(value) {
    const text = String(value || '').trim().toLowerCase();

    if (['0', 'disarm', 'disarmed', 'uit', 'off'].includes(text)) return 'disarmed';
    if (['1', 'arm', 'full arm', 'armed', 'away', 'aan'].includes(text)) return 'armed_away';
    if (['2', '3', '4', 'home', 'home arm 1', 'home arm 2', 'home arm 3', 'partial', 'partial arm', 'partially armed', 'thuis'].includes(text)) return 'armed_home';
    if (['trigger', 'triggered', 'alarm'].includes(text)) return 'triggered';

    return 'unknown';
  }
}

module.exports = WoonveiligClient;

