// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker the test
// publishes gateway messages on, and the integration wired on top through
// registerHandlers — the same wiring as index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const BROKER_URL = 'mqtt://broker.example:1883';
export const CLIENT_ID = 'gladys-theengs-0a1b2c3d';

/**
 * Messages in the exact format of Theengs Gateway and OpenMQTTGateway (one
 * `{ topic, payload }` per line), anonymized: MAC addresses invented, values
 * changed. Two gateways: TheengsGateway (BLE) and OpenMQTTGateway (BLE,
 * rtl_433, 433 MHz, infrared, status).
 */
export function readMessages(name = 'gateways.jsonl') {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/** A decoded BLE advertisement, as Theengs Gateway publishes it. */
export const ble = (mac, fields) =>
  JSON.stringify({ id: mac, rssi: -70, brand: 'Xiaomi', model: 'TH Sensor', ...fields });

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    grantedQos: 0,
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.ended = false;
      client.subscribe = (topics, opts, callback) => {
        const list = [].concat(topics);
        client.subscriptions.push(...list);
        callback?.(
          null,
          list.map((topic) => ({ topic, qos: broker.grantedQos })),
        );
      };
      client.publish = () => {
        throw new Error('the integration never publishes');
      };
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    accept() {
      broker.client.emit('connect');
    },
    send(topic, payload) {
      broker.client.emit('message', topic, Buffer.from(String(payload)));
    },
    sendAll(messages = readMessages()) {
      for (const { topic, payload } of messages) {
        broker.send(topic, payload);
      }
    },
    drop() {
      broker.client.emit('close');
      broker.client.emit('offline');
    },
  };
  return broker;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {object} [options.timings]
 * @param {() => number} [options.now]
 */
export async function createWorld({
  config = { broker_url: BROKER_URL },
  devices = [],
  timings,
  now,
} = {}) {
  const broker = createFakeBroker();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    loadClientId: async () => ({ clientId: CLIENT_ID, persisted: true }),
    timings: { discoveryDelayMs: 0, ...timings },
    now,
  });
  await gladys.connect();
  await flush();
  return { gladys, broker, app, hub: app.hub };
}

/** Let the pending promise callbacks and zero-delay timers run. */
export const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Add the discovered device with that external id, as the user would. */
export async function addDiscovered(world, externalId) {
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  if (!device) {
    throw new Error(`${externalId} was not discovered`);
  }
  await world.gladys.fake.deviceCreated(device);
  await flush();
  return device;
}

/** The last published state of a feature. */
export function lastState(world, featureExternalId) {
  const states = world.gladys.fake.states.filter(
    (s) => s.device_feature_external_id === featureExternalId,
  );
  const last = states[states.length - 1];
  return last === undefined ? undefined : (last.text ?? last.state);
}
