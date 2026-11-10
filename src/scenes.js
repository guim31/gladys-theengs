// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `check_sensors` — the sensors added in Gladys whose battery is low, and the
// ones no gateway has heard for a while, as a sentence ready for a message
// and as counts a scene can test. BLE sensors die quietly: nothing in Gladys
// says a value stopped coming. In the language of the configuration (a scene
// action does not receive the user's). An action applies no `default`: an
// empty field takes the value below.
// -----------------------------------------------------------------------------

import { CHECK_SENSORS_TEXT, pick } from './texts.js';

export const SCENE_ACTION = {
  CHECK_SENSORS: 'check_sensors',
};

export const DEFAULT_BATTERY_THRESHOLD = 20;
export const DEFAULT_SILENT_HOURS = 2;
const HOUR = 3_600_000;

const positive = (value, fallback, max) => {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0
    ? Math.min(number, max)
    : fallback;
};

/**
 * The sensors to look at: low battery, silent.
 * @param {import('./hub.js').Hub} hub
 * @param {{ batteryThreshold: number, silentHours: number }} limits
 */
export function sensorProblems(hub, { batteryThreshold, silentHours }) {
  const now = hub.now();
  const low = [];
  const silent = [];
  for (const { device, sensor } of hub.addedSensors()) {
    const name = device.name || device.external_id;
    if (now - hub.lastHeard(sensor) > silentHours * HOUR) {
      silent.push(name);
    }
    const battery = sensor?.values.battery;
    if (
      sensor?.values.battery_low === true ||
      (battery !== undefined && battery <= batteryThreshold)
    ) {
      low.push(name);
    }
  }
  return { low: low.sort(), silent: silent.sort() };
}

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ battery_threshold?: number|string, silent_hours?: number|string }} fields
 */
export function checkSensors(hub, fields = {}) {
  const text = pick(CHECK_SENSORS_TEXT, hub.config?.language ?? 'fr');
  const silentHours = positive(fields.silent_hours, DEFAULT_SILENT_HOURS, 24 * 30);
  const batteryThreshold = positive(fields.battery_threshold, DEFAULT_BATTERY_THRESHOLD, 100);
  if (hub.addedSensors().length === 0) {
    return { summary: text.noSensor, low_battery: 0, silent: 0 };
  }
  const { low, silent } = sensorProblems(hub, { batteryThreshold, silentHours });
  const parts = [];
  if (low.length > 0) {
    parts.push(text.lowBattery(low.join(', ')));
  }
  if (silent.length > 0) {
    parts.push(text.silent(silent.join(', '), silentHours));
  }
  return {
    summary: parts.length > 0 ? parts.join(' ') : text.allGood,
    low_battery: low.length,
    silent: silent.length,
  };
}
