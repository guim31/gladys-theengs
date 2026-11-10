// -----------------------------------------------------------------------------
// Gateway messages -> Gladys devices.
//
// - One "ble" device per decoded BLE device the user adds, keyed by its MAC
//   address (12 hex digits): the sensors the decoder found in its
//   advertisements (temperature, humidity, battery, motion, opening…).
// - One "rtl433" device per 433 MHz sensor decoded by rtl_433, keyed by its
//   model, channel and id.
// - One "gateway" device per OpenMQTTGateway / Theengs Gateway, keyed by its
//   name in the topics:
//     online   input/binary, its last will (LWT) or any message heard;
//     uptime   duration/integer in s, from OpenMQTTGateway's SYStoMQTT only;
//     devices  counter-sensor/integer, decoded devices heard in 10 minutes.
// Pushed, never polled. Feature keys are forever: never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { formatMac } from './theengs.js';
import { FEATURE_NAMES, pick } from './texts.js';

export const BLE_TYPE = 'ble';
export const RTL_433_TYPE = 'rtl433';
export const GATEWAY_TYPE = 'gateway';

const temperature = (max) => ({
  category: CAT.TEMPERATURE_SENSOR,
  type: TYPE.SENSOR.DECIMAL,
  unit: UNIT.CELSIUS,
  min: -40,
  max,
  decimals: 1,
});

/**
 * The sensor features, in the order of a device's feature list. `decimals`:
 * the rounding of the published value (the readings jitter); `binary`:
 * published at once, the others at the next tick.
 */
export const SENSOR_FEATURES = {
  temperature: temperature(100),
  // Probes (barbecue thermometers): up to 300 °C.
  temperature_2: temperature(300),
  temperature_3: temperature(300),
  temperature_4: temperature(300),
  temperature_5: temperature(300),
  temperature_6: temperature(300),
  humidity: {
    category: CAT.HUMIDITY_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
    decimals: 0,
  },
  battery: {
    category: CAT.BATTERY,
    type: TYPE.BATTERY.INTEGER,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
    decimals: 0,
  },
  // Only for a device that does not report a percentage.
  battery_voltage: {
    category: CAT.ENERGY_SENSOR,
    type: TYPE.ENERGY_SENSOR.VOLTAGE,
    unit: UNIT.VOLT,
    min: 0,
    max: 5,
    decimals: 2,
  },
  battery_low: { category: CAT.BATTERY_LOW, type: 'binary', min: 0, max: 1, binary: true },
  soil_moisture: {
    category: CAT.SOIL_MOISTURE_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.PERCENT,
    min: 0,
    max: 100,
    decimals: 0,
  },
  illuminance: {
    category: CAT.LIGHT_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.LUX,
    min: 0,
    max: 100000,
    decimals: 0,
  },
  pressure: {
    category: CAT.PRESSURE_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: 'hPa',
    min: 800,
    max: 1100,
    decimals: 1,
  },
  co2: {
    category: CAT.CO2_SENSOR,
    type: TYPE.SENSOR.INTEGER,
    unit: UNIT.PPM,
    min: 0,
    max: 5000,
    decimals: 0,
  },
  pm25: {
    category: CAT.PM25_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 500,
    decimals: 0,
  },
  pm10: {
    category: CAT.PM10_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 500,
    decimals: 0,
  },
  formaldehyde: {
    category: CAT.FORMALDEHYD_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.MILLIGRAM_PER_CUBIC_METER,
    min: 0,
    max: 5,
    decimals: 2,
  },
  motion: { category: CAT.MOTION_SENSOR, type: TYPE.SENSOR.BINARY, min: 0, max: 1, binary: true },
  opening: {
    category: CAT.OPENING_SENSOR,
    type: TYPE.SENSOR.BINARY,
    min: 0,
    max: 1,
    binary: true,
  },
  uv: {
    category: CAT.UV_SENSOR,
    type: TYPE.SENSOR.INTEGER,
    unit: UNIT.UV_INDEX,
    min: 0,
    max: 15,
    decimals: 0,
  },
  wind_speed: {
    category: CAT.SPEED_SENSOR,
    type: TYPE.SENSOR.DECIMAL,
    unit: UNIT.KILOMETER_PER_HOUR,
    min: 0,
    max: 250,
    decimals: 1,
  },
};

export const MAX_UPTIME_S = 10 * 365 * 24 * 3600;
export const MAX_COUNT = 1000;

// The Gladys opening-sensor says 0 = open, 1 = closed (OPENING_SENSOR_STATE),
// the reverse of the motion and leak sensors.
export const OPENING_STATE = { OPEN: 0, CLOSED: 1 };

/** The Gladys state of a feature, from the value parsed out of a message. */
export function stateOf(key, value) {
  if (key === 'opening') {
    return value ? OPENING_STATE.OPEN : OPENING_STATE.CLOSED;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const spec = SENSOR_FEATURES[key];
  const factor = 10 ** (spec?.decimals ?? 0);
  const rounded = Math.round(value * factor) / factor;
  // -0 reads oddly in Gladys.
  return Object.is(rounded, -0) ? 0 : rounded;
}

const part = (text) => encodeURIComponent(text).replace(/\./g, '%2E');

export const idsOf = (gladys, type, id) => gladys.externalIds(type, part(id));

/** The platform id (MAC, rtl_433 id, gateway name) of a device external id of that type. */
export function platformIdOf(gladys, externalId, type) {
  const prefix = gladys.externalIds(type, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  if (rest === '' || rest.includes(':')) {
    return null;
  }
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** The feature key of a feature external id (`...:ble:A4C138D5D498:humidity` -> `humidity`). */
export const featureKeyOf = (externalId) => externalId.slice(externalId.lastIndexOf(':') + 1);

function featureMaker(ids, language) {
  const names = pick(FEATURE_NAMES, language);
  return (key, fields) => ({
    name: names[key],
    external_id: ids.feature(key),
    selector: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
}

/**
 * The feature keys a sensor gets, in a stable order: every value it reported
 * so far, the battery voltage only when no percentage comes.
 * @param {Iterable<string>} keys
 */
export function sensorFeatureKeys(keys) {
  const seen = new Set(keys);
  return Object.keys(SENSOR_FEATURES).filter(
    (key) => seen.has(key) && !(key === 'battery_voltage' && seen.has('battery')),
  );
}

/** The display name of a sensor before the user renames it. */
export function sensorName(sensor) {
  if (sensor.kind === BLE_TYPE) {
    const label = [sensor.brand, sensor.model].filter(Boolean).join(' ') || sensor.modelId;
    return `${label} ${sensor.id.slice(-4)}`;
  }
  return sensor.id;
}

/**
 * @param {object} gladys
 * @param {{ kind: string, id: string, brand?: string, model?: string, modelId?: string, keys: Iterable<string> }} sensor
 * @param {string} language
 */
export function buildSensorDevice(gladys, sensor, language) {
  const type = sensor.kind === BLE_TYPE ? BLE_TYPE : RTL_433_TYPE;
  const ids = idsOf(gladys, type, sensor.id);
  const feature = featureMaker(ids, language);
  const params =
    type === BLE_TYPE
      ? [
          { name: 'mac', value: formatMac(sensor.id) },
          { name: 'model_id', value: sensor.modelId },
        ]
      : [{ name: 'rtl_433_id', value: sensor.id }];
  return {
    name: sensorName(sensor),
    external_id: ids.device,
    selector: ids.device,
    model: type === BLE_TYPE ? sensor.modelId : sensor.model || 'rtl_433',
    should_poll: false,
    params,
    features: sensorFeatureKeys(sensor.keys).map((key) => {
      // eslint-disable-next-line no-unused-vars
      const { decimals, binary, ...fields } = SENSOR_FEATURES[key];
      return feature(key, fields);
    }),
  };
}

/**
 * @param {object} gladys
 * @param {{ name: string, sys: boolean }} gateway `sys`: an OpenMQTTGateway status was heard
 * @param {string} language
 */
export function buildGatewayDevice(gladys, gateway, language) {
  const ids = idsOf(gladys, GATEWAY_TYPE, gateway.name);
  const feature = featureMaker(ids, language);
  const features = [
    feature('online', { category: CAT.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 }),
    feature('devices', {
      category: CAT.COUNTER_SENSOR,
      type: TYPE.SENSOR.INTEGER,
      min: 0,
      max: MAX_COUNT,
    }),
  ];
  if (gateway.sys) {
    features.push(
      feature('uptime', {
        category: CAT.DURATION,
        type: TYPE.DURATION.INTEGER,
        unit: UNIT.SECONDS,
        min: 0,
        max: MAX_UPTIME_S,
      }),
    );
  }
  return {
    name: gateway.name,
    external_id: ids.device,
    selector: ids.device,
    model: 'OpenMQTTGateway / Theengs Gateway',
    should_poll: false,
    params: [{ name: 'gateway', value: gateway.name }],
    features,
  };
}
