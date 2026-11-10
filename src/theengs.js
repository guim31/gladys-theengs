// -----------------------------------------------------------------------------
// The MQTT messages of OpenMQTTGateway and Theengs Gateway, parsed into what
// the hub needs. Both publish under `<root>/<gateway>/<module>[/...]`:
//
//   BTtoMQTT[/<MAC>]       a BLE advertisement decoded by Theengs Decoder:
//                          { id, mac?, rssi, brand, model, model_id, type,
//                            tempc, hum, batt, volt, moi, lux, pres, co2, pm25,
//                            motion, open, button… } (decoder property names)
//   RTL_433toMQTT[/...]    a 433 MHz sensor decoded by rtl_433:
//                          { model, id, channel, temperature_C, humidity,
//                            battery_ok, … } (rtl_433 data dictionary)
//   433toMQTT, IRtoMQTT    a raw code: { value, protocol, bits|length, hex? }
//   LWT                    online / offline (retained, the gateway's will)
//   SYStoMQTT              OpenMQTTGateway status: { uptime, version, … }
//
// The gateway decodes, the integration only maps: nothing here talks Bluetooth
// or radio. Undecoded advertisements (no `model_id`) and devices the decoder
// flags as random-address (`type: "RMAC"`: phones, Microsoft and Apple beacons,
// exposure notifications) are left out.
// -----------------------------------------------------------------------------

import { RELEASE_CODE } from './texts.js';

export const MODULES = {
  BLE: 'BTtoMQTT',
  RTL_433: 'RTL_433toMQTT',
  RF: '433toMQTT',
  IR: 'IRtoMQTT',
  LWT: 'LWT',
  SYS: 'SYStoMQTT',
};

/** The topics to subscribe to, for a topic root. `a/+/M/#` matches `a/x/M` too. */
export const subscriptions = (root) => [
  `${root}/+/${MODULES.BLE}/#`,
  `${root}/+/${MODULES.RTL_433}/#`,
  `${root}/+/${MODULES.RF}/#`,
  `${root}/+/${MODULES.IR}/#`,
  `${root}/+/${MODULES.LWT}`,
  `${root}/+/${MODULES.SYS}`,
];

const MAC = /^([0-9A-F]{2}:?){5}[0-9A-F]{2}$/i;

/** A MAC address as 12 upper-case hex digits, or null. */
export function normalizeMac(value) {
  if (typeof value !== 'string' || !MAC.test(value.trim())) {
    return null;
  }
  return value.trim().replace(/:/g, '').toUpperCase();
}

/** `A4C138D5D498` -> `A4:C1:38:D5:D4:98`. */
export const formatMac = (id) => id.match(/../g).join(':');

const number = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;

/** true / false, 1 / 0, "true" / "false": a two-state value; anything else is unknown. */
function flag(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return undefined;
}

const text = (value) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** Sets `values[key]` when `value` is defined. */
function put(values, key, value) {
  if (value !== undefined) {
    values[key] = value;
  }
}

// Decoder types whose `open` / `motion` are not a door or a presence: the
// position and the motor of a blind (SwitchBot Blind Tilt, `open: 30` %).
const NOT_A_SENSOR_STATE = new Set(['WCVR']);
// Tyre pressure sensors report `pres` in bar.
const PRESSURE_IN_BAR = new Set(['TIRE']);

/**
 * The values of a decoded BLE advertisement, by feature key. `opening` is
 * true for "open" (the Gladys state is inverted later, devices.js).
 * @param {object} payload
 */
export function bleValues(payload) {
  const values = {};
  const type = text(payload.type);
  put(values, 'temperature', number(payload.tempc));
  for (const n of [2, 3, 4, 5, 6]) {
    put(values, `temperature_${n}`, number(payload[`tempc${n}`]));
  }
  put(values, 'humidity', number(payload.hum));
  put(values, 'battery', number(payload.batt));
  put(values, 'battery_voltage', number(payload.volt));
  put(values, 'battery_low', flag(payload.lowbatt ?? payload.batt_low));
  put(values, 'soil_moisture', number(payload.moi));
  put(values, 'illuminance', number(payload.lux));
  if (!PRESSURE_IN_BAR.has(type)) {
    put(values, 'pressure', number(payload.pres));
  }
  put(values, 'co2', number(payload.co2));
  put(values, 'pm25', number(payload.pm25));
  put(values, 'pm10', number(payload.pm10));
  put(values, 'formaldehyde', number(payload.for));
  if (!NOT_A_SENSOR_STATE.has(type)) {
    put(values, 'motion', flag(payload.motion));
    put(values, 'opening', flag(payload.open));
  }
  return values;
}

/**
 * The button presses of a decoded advertisement (BTHome event codes: 1 press,
 * 2 double, 3 triple, 4 long…): `button` or `button1`…`button4`.
 * @returns {{ button: number, code: number }[]}
 */
export function blePresses(payload) {
  const presses = [];
  const single = number(payload.button);
  if (single !== undefined && single > 0 && single !== RELEASE_CODE) {
    presses.push({ button: 1, code: single });
  }
  for (const n of [1, 2, 3, 4]) {
    const code = number(payload[`button${n}`]);
    if (code !== undefined && code > 0 && code !== RELEASE_CODE) {
      presses.push({ button: n, code });
    }
  }
  return presses;
}

/** The values of an rtl_433 reading, by feature key. */
export function rtl433Values(payload) {
  const values = {};
  const celsius = number(payload.temperature_C);
  const fahrenheit = number(payload.temperature_F);
  put(
    values,
    'temperature',
    celsius ?? (fahrenheit === undefined ? undefined : ((fahrenheit - 32) * 5) / 9),
  );
  put(values, 'humidity', number(payload.humidity));
  const batteryOk = flag(payload.battery_ok);
  put(values, 'battery_low', batteryOk === undefined ? undefined : !batteryOk);
  put(values, 'pressure', number(payload.pressure_hPa));
  const windKmh = number(payload.wind_avg_km_h);
  const windMs = number(payload.wind_avg_m_s);
  put(values, 'wind_speed', windKmh ?? (windMs === undefined ? undefined : windMs * 3.6));
  put(values, 'illuminance', number(payload.light_lux));
  put(values, 'uv', number(payload.uv));
  put(values, 'soil_moisture', number(payload.moisture));
  put(values, 'opening', flag(payload.contact_open ?? payload.reed_open));
  return values;
}

/**
 * The identity of an rtl_433 sensor: its model, channel and id. Many cheap
 * sensors draw a new id when the battery is replaced: a new device then.
 * @returns {string|null}
 */
export function rtl433Id(payload) {
  const model = text(payload.model);
  const channel = text(payload.channel);
  const id = text(payload.id);
  if (model === '' || (channel === '' && id === '')) {
    return null;
  }
  return [model, channel === '' ? null : `c${channel}`, id === '' ? null : id]
    .filter(Boolean)
    .join('-');
}

function parseJson(payload) {
  try {
    const value = JSON.parse(payload.toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** A code as received: a long digit string must not go through a float. */
const codeText = (value) =>
  typeof value === 'string' && /^\d+$/.test(value.trim())
    ? value.trim()
    : BigInt(Math.trunc(Number(value))).toString();

// The NEC "repeat" code, sent while a key is held: not a key of its own.
const IR_REPEAT = 0xffffffff;

/**
 * @param {string} root the topic root (`home`)
 * @param {string} topic
 * @param {Buffer|string} payload
 * @returns {object|null} a message the hub understands, or null to ignore
 */
export function parseMessage(root, topic, payload) {
  if (typeof topic !== 'string' || !topic.startsWith(`${root}/`)) {
    return null;
  }
  const [gateway, module] = topic.slice(root.length + 1).split('/');
  if (!gateway || !module) {
    return null;
  }
  const raw = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ''));

  if (module === MODULES.LWT) {
    const state = raw.toString('utf8').trim().toLowerCase();
    return state === 'online' || state === 'offline'
      ? { kind: 'lwt', gateway, online: state === 'online' }
      : null;
  }

  const json = parseJson(raw);
  if (!json) {
    return null;
  }

  switch (module) {
    case MODULES.SYS: {
      const uptime = number(json.uptime);
      return {
        kind: 'sys',
        gateway,
        uptime: uptime === undefined || uptime < 0 ? null : Math.round(uptime),
        version: text(json.version),
      };
    }
    case MODULES.BLE: {
      // The address of the device: `mac` when the decoder found it in the
      // payload (the advertising address may then be random), else `id`.
      const id = normalizeMac(json.mac) ?? normalizeMac(json.id);
      const modelId = text(json.model_id);
      if (!id || modelId === '' || text(json.type) === 'RMAC') {
        return null;
      }
      return {
        kind: 'ble',
        gateway,
        id,
        brand: text(json.brand),
        model: text(json.model),
        modelId,
        type: text(json.type),
        values: bleValues(json),
        presses: blePresses(json),
        packet: number(json.packet),
      };
    }
    case MODULES.RTL_433: {
      const id = rtl433Id(json);
      if (!id) {
        return null;
      }
      const values = rtl433Values(json);
      // A remote: a non-zero button, command or code, and nothing measured
      // (a battery state does not count: remotes send one too). Many
      // thermometers send `button: 0` with every reading.
      const measured = Object.keys(values).some((key) => key !== 'battery_low');
      const code = measured
        ? ''
        : ([json.button, json.cmd, json.code, json.event]
            .map(text)
            .find((value) => value !== '' && value !== '0') ?? '');
      return { kind: 'rtl433', gateway, id, model: text(json.model), values, code };
    }
    case MODULES.RF: {
      const value = number(json.value);
      if (value === undefined || value <= 0) {
        return null;
      }
      return {
        kind: 'code',
        gateway,
        source: 'rf',
        code: codeText(json.value),
        protocol: text(json.protocol),
      };
    }
    case MODULES.IR: {
      const value = number(json.value);
      const hex = text(json.hex);
      if ((value === undefined || value <= 0 || value === IR_REPEAT) && hex === '') {
        return null;
      }
      if (value === IR_REPEAT) {
        return null;
      }
      return {
        kind: 'code',
        gateway,
        source: 'ir',
        code: hex !== '' ? hex : codeText(json.value),
        protocol: text(json.protocol_name ?? json.protocol),
      };
    }
    default:
      return null;
  }
}
