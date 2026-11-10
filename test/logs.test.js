// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle (sensors advertising
// every few seconds through two gateways, a door, a remote), one line when a
// failure starts and one when it ends, never a password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idsOf } from '../src/devices.js';
import { addDiscovered, ble, createWorld, flush, readMessages } from './helpers/world.js';

const SECOND = 1000;

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

async function addedWorld(t, config) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld(config ? { config } : {});
  t.after(() => world.app.stop());
  world.broker.accept();
  world.broker.sendAll();
  await tick(t, 0);
  for (const [type, id] of [
    ['ble', 'A4C138000001'],
    ['ble', '582D34000004'],
    ['gateway', 'OpenMQTTGateway'],
  ]) {
    await addDiscovered(world, idsOf(world.gladys, type, id).device);
  }
  return world;
}

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  const fixtures = readMessages();
  for (let i = 1; i <= 60; i += 1) {
    for (const gateway of ['TheengsGateway', 'OpenMQTTGateway']) {
      world.broker.send(
        `home/${gateway}/BTtoMQTT/A4C138000001`,
        ble('A4:C1:38:00:00:01', {
          model_id: 'LYWSD03MMC/MJWSD05MMC_ATC',
          type: 'THB',
          tempc: 20 + (i % 7) / 10,
          hum: 50 + (i % 3),
          batt: 80,
        }),
      );
    }
    world.broker.send(
      'home/TheengsGateway/BTtoMQTT/582D34000004',
      JSON.stringify({ id: '58:2D:34:00:00:04', model_id: 'CGH1', type: 'CTMO', open: i % 10 < 5 }),
    );
    world.broker.sendAll(fixtures.filter((m) => /433toMQTT|IRtoMQTT|SYStoMQTT/.test(m.topic)));
    await tick(t, 5 * SECOND);
  }
  assert.deepEqual(lines, []);
});

test('a broker outage is told once, its end once, without the password', async (t) => {
  const world = await addedWorld(t, {
    broker_url: 'mqtt://alice:hunter2@broker.example:1883',
  });
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    world.broker.drop();
    world.broker.client.emit('error', new Error('connect ECONNREFUSED'));
    await tick(t, 15 * SECOND);
  }
  world.broker.accept();
  await flush();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /unreachable/);
  assert.match(lines[1], /Connected to the MQTT broker mqtt:\/\/broker\.example:1883/);
  assert.doesNotMatch(lines.join('\n'), /hunter2|alice:/);
});

test('a gateway going offline and back is one line each', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  world.broker.send('home/OpenMQTTGateway/LWT', 'offline');
  world.broker.send('home/OpenMQTTGateway/LWT', 'offline');
  world.broker.send('home/OpenMQTTGateway/LWT', 'online');
  await flush();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /OpenMQTTGateway is offline/);
  assert.match(lines[1], /OpenMQTTGateway is online again/);
});
