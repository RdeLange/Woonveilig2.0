'use strict';

const AthomApi = require('../node_modules/homey/lib/AthomApi');

function userArg(user) {
  return {
    id: user.id,
    name: user.name,
    image: `https://api.athom.com/user/${user.athomId}/avatar`,
    athomId: user.athomId,
  };
}

function pushAction(user, text, critical) {
  const id = critical
    ? 'homey:manager:mobile:push_text_critical'
    : 'homey:manager:mobile:push_text';
  return {
    id,
    uri: 'homey:manager:mobile',
    group: 'then',
    args: {
      user: userArg(user),
      text,
    },
  };
}

async function ensureFlow(api, name, trigger, actions) {
  const flows = Object.values(await api.flow.getFlows());
  const existing = flows.find((flow) => flow.name === name);
  const body = {
    name,
    enabled: true,
    trigger,
    conditions: [],
    actions,
  };
  if (existing) {
    await api.flow.updateFlow({ id: existing.id, flow: body });
    return { id: existing.id, updated: true };
  }
  const created = await api.flow.createFlow({ flow: body });
  return { id: created.id, updated: false };
}

async function main() {
  const athom = new AthomApi();
  const api = await athom.getActiveHomey();

  await api.notifications.setOwnerEnabled({
    uri: 'homey:app:nl.community.woonveiliglocal',
    enabled: true,
  });
  await api.notifications.setOwnerPush({
    uri: 'homey:app:nl.community.woonveiliglocal',
    push: true,
  });

  const users = Object.values(await api.users.getUsers()).filter((user) => user.athomId && user.id);
  const trigger = {
    id: 'homey:app:nl.community.woonveiliglocal:test_notification_requested',
    uri: 'homey:flowcardtrigger:homey:app:nl.community.woonveiliglocal:test_notification_requested',
    args: {},
  };
  const tokenText = '[[homey:app:nl.community.woonveiliglocal:woonveilig_push_message]]';
  const actions = [];
  for (const user of users) {
    actions.push(pushAction(user, tokenText, true));
  }

  try {
    const result = await ensureFlow(api, 'WoonVeilig telefoonmelding', trigger, actions);
    console.log('FLOW', result);
  } catch (error) {
    console.error('FLOW_ERROR', error.message);
  }

  const target = users.find((user) => user.role === 'owner') || users[0];
  const sent = await api.flow.runFlowCardAction({
    uri: 'homey:flowcardaction:homey:manager:mobile:push_text_critical',
    id: 'homey:manager:mobile:push_text_critical',
    args: {
      user: userArg(target),
      text: 'WoonVeilig test: dit moet nu op je telefoon komen',
    },
  });
  console.log('CRITICAL_PUSH', sent);

  const normal = await api.flow.runFlowCardAction({
    uri: 'homey:flowcardaction:homey:manager:mobile:push_text',
    id: 'homey:manager:mobile:push_text',
    args: {
      user: userArg(target),
      text: 'WoonVeilig test: gewone push',
    },
  });
  console.log('NORMAL_PUSH', normal);
}

main().catch((error) => {
  console.error('FATAL', error.message);
  if (error.stack) console.error(error.stack.split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
});

