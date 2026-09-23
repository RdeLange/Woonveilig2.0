'use strict';

const PUSH_CARDS = [
  { uri: 'homey:flowcardaction:homey:manager:mobile:push_text_critical', id: 'homey:manager:mobile:push_text_critical' },
  { uri: 'homey:manager:mobile', id: 'homey:manager:mobile:push_text_critical' },
  { uri: 'homey:flowcardaction:homey:manager:mobile:push_text', id: 'homey:manager:mobile:push_text' },
  { uri: 'homey:manager:mobile', id: 'homey:manager:mobile:push_text' },
];

class HomeyPush {
  constructor(app) {
    this.app = app;
    this.api = null;
    this.ownerPushReady = false;
  }

  async send(message) {
    const text = String(message || '').trim() || 'WoonVeilig melding';
    const errors = [];
    let timeline = false;
    let push = false;

    try {
      await this.enableOwnerPush();
    } catch (error) {
      errors.push(this.friendlyError(error));
    }

    try {
      await this.app.homey.notifications.createNotification({
        excerpt: `**WoonVeilig** ${text}`,
      });
      timeline = true;
    } catch (error) {
      errors.push(`Homey-tijdlijn: ${error.message}`);
    }

    try {
      push = await this.sendPhonePush(text);
    } catch (error) {
      errors.push(this.friendlyError(error));
    }

    if (!timeline && !push) {
      throw new Error(errors.join(' | ') || 'Melding versturen mislukt.');
    }

    return { ok: true, timeline, push, errors };
  }

  async sendPhonePush(text) {
    const api = await this.getApi();
    const users = await this.getSelectedUsers(api);
    if (!users.length) {
      throw new Error('Geen Homey-gebruiker geselecteerd of gevonden voor push.');
    }

    let sent = 0;
    let lastError = null;
    for (const user of users) {
      try {
        const ok = await this.sendToUser(api, user, text);
        if (ok) sent += 1;
      } catch (error) {
        lastError = error;
        this.app.error(`Push naar ${user.name || user.id} mislukt:`, error.message);
      }
    }

    if (sent > 0) return true;
    throw lastError || new Error('Telefoon-push is niet beschikbaar.');
  }

  async sendToUser(api, user, text) {
    const athomId = user.athomId;
    const id = user.id;
    if (!athomId || !id) return false;

    let lastError = null;
    for (const card of PUSH_CARDS) {
      try {
        await api.flow.runFlowCardAction({
          uri: card.uri,
          id: card.id,
          args: {
            user: {
              athomId,
              id,
              name: user.name,
              image: user.image || `https://api.athom.com/user/${athomId}/avatar`,
            },
            text,
          },
        });
        this.app.log(`Telefoon-push verstuurd naar ${user.name || id}`);
        return true;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Push-kaart niet gevonden.');
  }

  async enableOwnerPush() {
    if (this.ownerPushReady) return;
    const api = await this.getApi();
    const uri = `homey:app:${this.app.homey.manifest.id}`;

    try {
      await api.notifications.setOwnerEnabled({ uri, enabled: true });
    } catch (error) {
      this.app.error('Meldingen inschakelen mislukt:', error.message);
    }

    await api.notifications.setOwnerPush({ uri, push: true });
    this.ownerPushReady = true;
    this.app.log('Push voor WoonVeilig Lokaal ingeschakeld');
  }

  async getSelectedUsers(api) {
    const users = await this.listUsers(api);
    const selectedIds = new Set(parseJsonArray(this.app.homey.settings.get('push_user_ids')));
    if (!selectedIds.size) return users;
    return users.filter((user) => selectedIds.has(user.id));
  }

  async listUsers(api) {
    const homeyApi = api || await this.getApi();
    const users = [];
    try {
      const all = await homeyApi.users.getUsers();
      users.push(...Object.values(all || {}));
    } catch (error) {
      this.app.error('Gebruikers ophalen mislukt:', error.message);
    }

    if (!users.length) {
      try {
        const me = await homeyApi.users.getUserMe();
        if (me) users.push(me);
      } catch (error) {
        this.app.error('Eigen gebruiker ophalen mislukt:', error.message);
      }
    }

    return users
      .filter((user) => user && user.athomId && user.id)
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'nl'));
  }

  async getApi() {
    if (this.api) return this.api;
    try {
      const { HomeyAPI } = require('homey-api');
      this.api = await HomeyAPI.createAppAPI({ homey: this.app.homey });
      return this.api;
    } catch (error) {
      this.api = null;
      throw error;
    }
  }

  friendlyError(error) {
    const message = String(error && error.message || error || '');
    if (/permission|scope|token|not allowed|forbidden|unauthorized/i.test(message)) {
      return 'Homey vroeg om toestemming. Kies Toestaan en tik daarna opnieuw op Test melding.';
    }
    return message || 'Onbekende fout';
  }
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

module.exports = HomeyPush;

