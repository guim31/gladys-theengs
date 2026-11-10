// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake broker
// carrying messages in the exact format of the gateways.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { idsOf } from '../src/devices.js';
import { subscriptions } from '../src/theengs.js';
import {
  BROKER_URL,
  addDiscovered,
  ble,
  createWorld,
  flush,
  lastState,
  readMessages,
} from './helpers/world.js';

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A world on a manual clock, the fixtures sent, nothing added yet. */
async function startedWorld(t, { config, send = true } = {}) {
  let now = T0;
  const world = await createWorld({
    config: { broker_url: BROKER_URL, ...config },
    now: () => now,
  });
  t.after(() => world.app.stop());
  world.advance = (ms) => {
    now += ms;
  };
  world.broker.accept();
  if (send) {
    world.broker.sendAll();
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  await flush();
  world.ids = (type, id) => idsOf(world.gladys, type, id);
  world.add = (type, id) => addDiscovered(world, world.ids(type, id).device);
  return world;
}

const action = async (world, key, fields) =>
  (await world.gladys.fake.action(key, fields)).data.message;
const sceneAction = async (world, key, fields) =>
  (await world.gladys.fake.sceneAction(key, fields)).data.outputs;

const featureKeys = (device) => device.features.map((f) => f.external_id.split(':').pop());

test('subscribes to the gateway modules under the topic root', async (t) => {
  const world = await startedWorld(t, { config: { topic_root: '/omg/' }, send: false });
  assert.deepEqual(world.broker.client.subscriptions, subscriptions('omg'));
  assert.deepEqual(subscriptions('home'), [
    'home/+/BTtoMQTT/#',
    'home/+/RTL_433toMQTT/#',
    'home/+/433toMQTT/#',
    'home/+/IRtoMQTT/#',
    'home/+/LWT',
    'home/+/SYStoMQTT',
  ]);
});

test('offers the gateways and the decoded sensors, not the random or undecoded ones', async (t) => {
  const world = await startedWorld(t);
  const devices = world.gladys.fake.discoveredDevices;
  const byId = Object.fromEntries(
    devices.map((d) => [d.external_id.split(':').slice(2).join(':'), d]),
  );
  assert.deepEqual(Object.keys(byId).sort(), [
    'ble:492200000003',
    'ble:582D34000004',
    'ble:7CC6B6000005',
    'ble:A4C138000001',
    'ble:BC026E000006',
    'ble:D40000000002',
    'ble:E1000000000A',
    'gateway:OpenMQTTGateway',
    'gateway:TheengsGateway',
    'rtl433:Acurite-Tower-cA-2041',
    'rtl433:Oregon-THGR122N-c1-166',
  ]);
  // The battery voltage only without a percentage.
  assert.deepEqual(featureKeys(byId['ble:A4C138000001']), ['temperature', 'humidity', 'battery']);
  assert.equal(byId['ble:A4C138000001'].name, 'Xiaomi TH Sensor 0001');
  assert.equal(byId['ble:A4C138000001'].model, 'LYWSD03MMC/MJWSD05MMC_ATC');
  assert.deepEqual(byId['ble:A4C138000001'].params, [
    { name: 'mac', value: 'A4:C1:38:00:00:01' },
    { name: 'model_id', value: 'LYWSD03MMC/MJWSD05MMC_ATC' },
  ]);
  assert.deepEqual(featureKeys(byId['ble:7CC6B6000005']), ['battery', 'illuminance', 'motion']);
  // A blind's `open` (%) and `motion` (motor) are not a door nor a presence.
  assert.deepEqual(featureKeys(byId['ble:E1000000000A']), ['battery']);
  assert.deepEqual(featureKeys(byId['rtl433:Acurite-Tower-cA-2041']), [
    'temperature',
    'humidity',
    'battery_low',
  ]);
  // Only OpenMQTTGateway reports a status (SYStoMQTT).
  assert.deepEqual(featureKeys(byId['gateway:OpenMQTTGateway']), ['online', 'devices', 'uptime']);
  assert.deepEqual(featureKeys(byId['gateway:TheengsGateway']), ['online', 'devices']);
  assert.ok(devices.every((d) => d.should_poll === false));
});

test('the rtl_433 sensors can be left out of the Discovery tab', async (t) => {
  const world = await startedWorld(t, { config: { offer_rtl_433: false } });
  const ids = world.gladys.fake.discoveredDevices.map((d) => d.external_id);
  assert.ok(
    ids.every((id) => !id.includes(':rtl433:')),
    ids.join(', '),
  );
});

test('a value seen later grows the device and is offered again', async (t) => {
  const world = await startedWorld(t);
  const mac = 'A4:C1:38:00:00:01';
  world.broker.send(
    'home/TheengsGateway/BTtoMQTT/A4C138000001',
    ble(mac, { model_id: 'LYWSD03MMC/MJWSD05MMC_ATC', type: 'THB', tempc2: 30 }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  const device = world.gladys.fake.discoveredDevices.find(
    (d) => d.external_id === world.ids('ble', 'A4C138000001').device,
  );
  assert.deepEqual(featureKeys(device), ['temperature', 'temperature_2', 'humidity', 'battery']);
});

test('measures go out at the tick, rounded, and only when they change', async (t) => {
  const world = await startedWorld(t);
  await world.add('ble', 'A4C138000001');
  await world.add('rtl433', 'Acurite-Tower-cA-2041');
  const atc = world.ids('ble', 'A4C138000001');
  const acurite = world.ids('rtl433', 'Acurite-Tower-cA-2041');
  // Published at once on creation (republish).
  assert.equal(lastState(world, atc.feature('temperature')), 21.4);
  assert.equal(lastState(world, atc.feature('humidity')), 48);
  assert.equal(lastState(world, atc.feature('battery')), 77);
  // 53.6 °F is 12 °C; battery_ok 0 is a low battery.
  assert.equal(lastState(world, acurite.feature('temperature')), 12);
  assert.equal(lastState(world, acurite.feature('battery_low')), 1);

  const count = world.gladys.fake.states.length;
  world.broker.send(
    'home/TheengsGateway/BTtoMQTT/A4C138000001',
    ble('A4:C1:38:00:00:01', {
      model_id: 'LYWSD03MMC/MJWSD05MMC_ATC',
      type: 'THB',
      tempc: 21.43,
      hum: 48.2,
      batt: 77,
    }),
  );
  await flush();
  assert.equal(world.gladys.fake.states.length, count, 'a measure waits for the tick');
  await world.hub.tick();
  assert.equal(world.gladys.fake.states.length, count, 'rounded to the same values: nothing sent');
  world.broker.send(
    'home/TheengsGateway/BTtoMQTT/A4C138000001',
    ble('A4:C1:38:00:00:01', { model_id: 'LYWSD03MMC/MJWSD05MMC_ATC', type: 'THB', tempc: -0.04 }),
  );
  await world.hub.tick();
  assert.equal(world.gladys.fake.states.length, count + 1);
  assert.equal(lastState(world, atc.feature('temperature')), 0);
});

test('a door goes out at once, open as 0 (the Gladys opening-sensor state)', async (t) => {
  const world = await startedWorld(t);
  await world.add('ble', '582D34000004');
  const ids = world.ids('ble', '582D34000004');
  assert.equal(lastState(world, ids.feature('opening')), 0, 'the fixture says open: true');
  const contact = (open) =>
    world.broker.send(
      'home/TheengsGateway/BTtoMQTT/582D34000004',
      JSON.stringify({
        id: '58:2D:34:00:00:04',
        brand: 'Qingping',
        model: 'Contact Sensor',
        model_id: 'CGH1',
        type: 'CTMO',
        open,
      }),
    );
  contact(false);
  await flush();
  assert.equal(lastState(world, ids.feature('opening')), 1, 'closed is 1');
  contact(true);
  await flush();
  assert.equal(lastState(world, ids.feature('opening')), 0);
  // BTHome reports 0 / 1.
  contact(0);
  await flush();
  assert.equal(lastState(world, ids.feature('opening')), 1);
});

test('a button press fires once, however many gateways relay it', async (t) => {
  const world = await startedWorld(t);
  await world.add('ble', 'BC026E000006');
  const device = world.ids('ble', 'BC026E000006').device;
  const events = () => world.gladys.fake.sceneEvents.filter((e) => e.key === 'button_pressed');
  // The fixture press (packet 41) came before the device was added: no trigger.
  assert.equal(events().length, 0);
  const press = (packet, fields) =>
    JSON.stringify({
      id: 'BC:02:6E:00:00:06',
      brand: 'Shelly',
      model: 'ShellyBLU Button1',
      model_id: 'SBBT-002C',
      type: 'BTN',
      packet,
      batt: 100,
      ...fields,
    });
  for (const gateway of ['TheengsGateway', 'OpenMQTTGateway', 'TheengsGateway']) {
    world.broker.send(`home/${gateway}/BTtoMQTT/BC026E000006`, press(42, { button: 2 }));
  }
  world.broker.send('home/TheengsGateway/BTtoMQTT/BC026E000006', press(43, { button: 9 }));
  // A battery-only advertisement and a release are no press.
  world.broker.send('home/TheengsGateway/BTtoMQTT/BC026E000006', press(44, {}));
  world.broker.send('home/TheengsGateway/BTtoMQTT/BC026E000006', press(45, { button: 10 }));
  // The same packet id long after: a new press (counter wrapped).
  world.advance(MINUTE);
  world.broker.send('home/TheengsGateway/BTtoMQTT/BC026E000006', press(45, { button: 1 }));
  await flush();
  const fired = events();
  assert.equal(fired.length, 3);
  assert.equal(fired[2].data.press, 'single');
  const [double, long] = fired.map((e) => e.data);
  assert.deepEqual(double, {
    device,
    press: 'double',
    button: 1,
    code: 2,
    device_name: 'Shelly ShellyBLU Button1 0006',
  });
  assert.equal(long.press, 'long');
});

test('a button not added to Gladys fires nothing', async (t) => {
  const world = await startedWorld(t);
  world.broker.send(
    'home/TheengsGateway/BTtoMQTT/BC026E000006',
    JSON.stringify({
      id: 'BC:02:6E:00:00:06',
      model_id: 'SBBT-002C',
      type: 'BTN',
      packet: 50,
      button: 1,
    }),
  );
  await flush();
  assert.equal(world.gladys.fake.sceneEvents.filter((e) => e.key === 'button_pressed').length, 0);
});

test('a thermometer sending button 0 is no remote; a remote is', async (t) => {
  const world = await startedWorld(t, { send: false });
  const reading = JSON.stringify({
    model: 'Prologue-TH',
    id: 116,
    channel: 2,
    button: 0,
    battery_ok: 1,
    temperature_C: 18.2,
    humidity: 55,
  });
  world.broker.send('home/OMG/RTL_433toMQTT', reading);
  world.advance(MINUTE);
  world.broker.send('home/OMG/RTL_433toMQTT', reading);
  world.broker.send(
    'home/OMG/RTL_433toMQTT',
    JSON.stringify({ model: 'Generic-Remote', id: 9, cmd: 0 }),
  );
  await flush();
  assert.equal(world.gladys.fake.sceneEvents.length, 0);
  // Digit strings keep every digit.
  world.broker.send(
    'home/OMG/433toMQTT',
    JSON.stringify({ value: '123456789012345678901', protocol: 1 }),
  );
  await flush();
  assert.deepEqual(
    world.gladys.fake.sceneEvents.map((e) => e.data.code),
    ['123456789012345678901'],
  );
});

test('implausible values are dropped, a battery voltage stays fed', async (t) => {
  const world = await startedWorld(t, { send: false });
  const send = (fields) =>
    world.broker.send(
      'home/TheengsGateway/BTtoMQTT/C00000000001',
      JSON.stringify({
        id: 'C0:00:00:00:00:01',
        brand: 'Ruuvi',
        model: 'RuuviTag',
        model_id: 'RuuviTag_RAWv2',
        type: 'THBX',
        ...fields,
      }),
    );
  send({ tempc: 163.835, hum: 163.835, volt: 3.01, pres: 1e308 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await world.add('ble', 'C00000000001');
  const ids = world.ids('ble', 'C00000000001');
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === ids.device);
  assert.deepEqual(featureKeys(device), ['battery_voltage']);
  send({ tempc: 21.5, batt: 80, volt: 2.95 });
  await world.hub.tick();
  assert.equal(lastState(world, ids.feature('battery_voltage')), 2.95);
});

test('long gone sensors and gateways are forgotten, added ones kept', async (t) => {
  const world = await startedWorld(t);
  await world.add('ble', 'A4C138000001');
  world.advance(25 * HOUR);
  await world.hub.tick();
  assert.deepEqual([...world.hub.sensors.keys()], ['ble:A4C138000001']);
  assert.equal(world.hub.gateways.size, 2);
  world.advance(7 * 24 * HOUR);
  await world.hub.tick();
  assert.equal(world.hub.gateways.size, 0);
});

test('a 433 MHz or infrared code fires code_received once per press, and is listed', async (t) => {
  const world = await startedWorld(t);
  const events = () => world.gladys.fake.sceneEvents.filter((e) => e.key === 'code_received');
  assert.deepEqual(
    events().map((e) => [e.data.source, e.data.code, e.data.protocol, e.data.gateway_name]),
    [
      ['rf', '5592405', '1', 'OpenMQTTGateway'],
      ['ir', '0xFFA25D', 'NEC', 'OpenMQTTGateway'],
    ],
  );
  assert.equal(events()[0].data.gateway, world.ids('gateway', 'OpenMQTTGateway').device);
  const rf = JSON.stringify({ value: 5592405, protocol: 1, length: 24, delay: 350 });
  // A remote repeats its code: one press.
  world.broker.send('home/OpenMQTTGateway/433toMQTT', rf);
  world.advance(1000);
  world.broker.send('home/OpenMQTTGateway/433toMQTT', rf);
  await flush();
  assert.equal(events().length, 2);
  world.advance(2000);
  world.broker.send('home/OpenMQTTGateway/433toMQTT', rf);
  // The NEC repeat code is no key.
  world.broker.send(
    'home/OpenMQTTGateway/IRtoMQTT',
    JSON.stringify({ value: 4294967295, protocol: 3, bits: 0 }),
  );
  // A remote decoded by rtl_433.
  world.broker.send(
    'home/OpenMQTTGateway/RTL_433toMQTT',
    JSON.stringify({ model: 'Smoke-GS558', id: 1234, unit: 1, learn: 0, code: '7a1b2c' }),
  );
  await flush();
  assert.deepEqual(
    events()
      .slice(2)
      .map((e) => [e.data.source, e.data.code]),
    [
      ['rf', '5592405'],
      ['rtl_433', 'Smoke-GS558-1234/7a1b2c'],
    ],
  );
  const message = await action(world, 'last_codes', {});
  assert.match(message, /^Derniers codes : rtl_433 Smoke-GS558-1234\/7a1b2c \(OpenMQTTGateway\)/);
  assert.match(message, /rf 5592405 \(OpenMQTTGateway\)/);
  assert.equal(message.match(/5592405/g).length, 1, 'each code listed once');
});

test('a gateway reports online, offline, its uptime and the devices it hears', async (t) => {
  const world = await startedWorld(t);
  await world.add('gateway', 'OpenMQTTGateway');
  await world.add('gateway', 'TheengsGateway');
  const omg = world.ids('gateway', 'OpenMQTTGateway');
  const theengs = world.ids('gateway', 'TheengsGateway');
  assert.equal(lastState(world, omg.feature('online')), 1);
  assert.equal(lastState(world, omg.feature('uptime')), 7260);
  // ATC sensor and the two rtl_433 ones.
  assert.equal(lastState(world, omg.feature('devices')), 3);
  // Seven decoded, the encrypted one included (heard, even if not offered).
  assert.equal(lastState(world, theengs.feature('devices')), 8);
  world.broker.send('home/TheengsGateway/LWT', 'offline');
  await flush();
  assert.equal(lastState(world, theengs.feature('online')), 0, 'at once, not at the tick');
  world.advance(11 * MINUTE);
  await world.hub.tick();
  assert.equal(lastState(world, theengs.feature('devices')), 0);
});

test('check_sensors tells the low batteries and the silent sensors', async (t) => {
  const world = await startedWorld(t);
  assert.match((await sceneAction(world, 'check_sensors', {})).summary, /^Aucun capteur/);
  await world.add('ble', 'A4C138000001');
  await world.add('rtl433', 'Acurite-Tower-cA-2041');
  await world.add('ble', '492200000003');
  let result = await sceneAction(world, 'check_sensors', {});
  assert.equal(result.summary, 'Pile faible : Acurite-Tower-cA-2041.');
  assert.deepEqual([result.low_battery, result.silent], [1, 0]);
  result = await sceneAction(world, 'check_sensors', { battery_threshold: 80 });
  assert.equal(result.low_battery, 3, 'the ATC at 77 % and the Inkbird at 63 % too');
  world.advance(3 * HOUR);
  world.broker.send(
    'home/TheengsGateway/BTtoMQTT/A4C138000001',
    ble('A4:C1:38:00:00:01', { model_id: 'LYWSD03MMC/MJWSD05MMC_ATC', type: 'THB', tempc: 20 }),
  );
  result = await sceneAction(world, 'check_sensors', { silent_hours: '2' });
  assert.equal(
    result.summary,
    'Pile faible : Acurite-Tower-cA-2041. Muets depuis plus de 2 h : Acurite-Tower-cA-2041, Inkbird T(H) Sensor 0003.',
  );
  assert.equal(result.silent, 2);
});

test('the sensors widget shows what needs attention first, valid for the core', async (t) => {
  const world = await startedWorld(t);
  const get = async (settings = {}, language = 'en') =>
    (await world.gladys.fake.widgetGet('sensors', { settings, language })).data.content;
  assert.match((await get()).components[0].text, /^Add your sensors/);
  await world.add('gateway', 'TheengsGateway');
  await world.add('ble', 'A4C138000001');
  await world.add('ble', '582D34000004');
  await world.add('rtl433', 'Acurite-Tower-cA-2041');
  world.broker.send('home/TheengsGateway/LWT', 'offline');
  await flush();
  const content = await get({ show_battery: true });
  validateWidgetContent(content);
  assert.deepEqual(
    content.components[0].items.map((item) => [item.label, item.value]),
    [
      ['TheengsGateway', 'Offline'],
      ['Acurite-Tower-cA-2041', 'Battery low · 12 °C · 64 %'],
      ['Qingping Contact Sensor 0004', 'Open'],
      ['Xiaomi TH Sensor 0001', '21.4 °C · 48 % · Bat. 77 %'],
    ],
  );
  const french = await get({ show_gateways: false }, 'fr');
  validateWidgetContent(french);
  assert.deepEqual(
    french.components[0].items.map((item) => item.value),
    ['Pile faible · 12 °C · 64 %', 'Ouvert', '21,4 °C · 48 %'],
  );
  // The name given in Gladys, and a sensor gone silent.
  world.advance(3 * HOUR);
  const renamed = (await get({ show_gateways: false })).components[0].items;
  assert.equal(renamed[0].value, 'Silent for 3 h');
  assert.ok(world.gladys.fake.widgetRefreshes.length > 0);
});

test('check_connection tells the broker state and what was heard', async (t) => {
  const world = await startedWorld(t, { config: { language: 'en' } });
  assert.equal(
    await action(world, 'check_connection', {}),
    'Connected to mqtt://broker.example:1883: 2 gateway(s), 2 online, 10 decoded device(s) heard.',
  );
  world.broker.drop();
  await flush();
  assert.match(await action(world, 'check_connection', {}), /does not answer/);
});

test('an unconfigured integration says so, in the four languages', async () => {
  const world = await createWorld({ config: {} });
  try {
    const status = world.gladys.fake.connectionStatus;
    assert.equal(status.connected, false);
    assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
  } finally {
    world.app.stop();
  }
});

test('the fixtures cover both gateways and every module', () => {
  const modules = new Set(readMessages().map((m) => m.topic.split('/').slice(1, 3).join('/')));
  assert.deepEqual([...modules].sort(), [
    'OpenMQTTGateway/433toMQTT',
    'OpenMQTTGateway/BTtoMQTT',
    'OpenMQTTGateway/IRtoMQTT',
    'OpenMQTTGateway/LWT',
    'OpenMQTTGateway/RTL_433toMQTT',
    'OpenMQTTGateway/SYStoMQTT',
    'TheengsGateway/BTtoMQTT',
    'TheengsGateway/LWT',
  ]);
});
