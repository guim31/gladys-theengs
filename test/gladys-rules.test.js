// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from messages in
// the exact format of Theengs Gateway and OpenMQTTGateway (test/fixtures),
// plus one device reporting every value the integration maps, in every
// feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BROKER_URL, createWorld, flush } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const LANGUAGES = [undefined, 'en', 'de', 'es'];

function checkDevice(device) {
  const where = device.name;
  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

for (const language of LANGUAGES) {
  test(`every discovered device follows the Gladys rules (${language ?? 'default language, French'})`, async () => {
    const config = { broker_url: BROKER_URL, ...(language ? { language } : {}) };
    const world = await createWorld({ config });
    try {
      world.broker.accept();
      world.broker.sendAll();
      // Every BLE value at once, and every rtl_433 one.
      world.broker.send(
        'home/TheengsGateway/BTtoMQTT/0A0000000099',
        JSON.stringify({
          id: '0A:00:00:00:00:99',
          brand: 'Test',
          model: 'All',
          model_id: 'ALL',
          type: 'THBX',
          tempc: 20,
          tempc2: 80,
          tempc3: 81,
          tempc4: 82,
          tempc5: 83,
          tempc6: 84,
          hum: 40,
          batt: 90,
          volt: 3,
          lowbatt: false,
          moi: 30,
          lux: 200,
          pres: 1013.2,
          co2: 600,
          pm25: 8,
          pm10: 12,
          for: 0.02,
          motion: false,
          open: false,
        }),
      );
      world.broker.send(
        'home/OpenMQTTGateway/RTL_433toMQTT',
        JSON.stringify({
          model: 'Fineoffset-WH65B',
          id: 77,
          battery_ok: 1,
          temperature_C: 4.5,
          humidity: 90,
          wind_avg_m_s: 2.5,
          light_lux: 12000,
          uv: 3,
          pressure_hPa: 1001,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      await flush();
      const devices = world.gladys.fake.discoveredDevices;
      // 2 gateways, 9 sensors of the fixtures, the two above.
      assert.equal(devices.length, 13, devices.map((d) => d.name).join(', '));
      for (const device of devices) {
        checkDevice(device);
      }
    } finally {
      world.app.stop();
    }
  });
}
