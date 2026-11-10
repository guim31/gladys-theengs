// -----------------------------------------------------------------------------
// The "Theengs sensors" dashboard widget: one line per sensor added in Gladys
// (and per gateway, unless hidden), the ones that need attention first.
//
// A line: the name given in Gladys, the main readings (temperature and
// humidity, or the door, or the motion), the battery when asked, or what is
// wrong: silent for too long, battery low, gateway offline. Content budget of
// the core: one `status` list of 12 lines at most. Pre-localized from the
// viewer's `language` (the core caches the content per settings, language and
// units).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { WIDGET_KEY } from './hub.js';
import { DEFAULT_BATTERY_THRESHOLD, DEFAULT_SILENT_HOURS } from './scenes.js';
import { pick } from './texts.js';

export const WIDGET = {
  SENSORS: WIDGET_KEY,
};

export const CONTENT_TTL_SECONDS = 60;
export const MAX_LINES = 12;
const MAX_LABEL = 40;
const MAX_VALUE = 40;
const HOUR = 3_600_000;

export const TEXT = {
  en: {
    notConfigured: 'Enter the address of the MQTT broker in the integration configuration.',
    noDevice: 'Add your sensors to Gladys first (Discovery tab of the integration).',
    open: 'Open',
    closed: 'Closed',
    motion: 'Motion',
    noMotion: 'No motion',
    online: 'Online',
    offline: 'Offline',
    waiting: 'Waiting for data',
    silent: (hours) => `Silent for ${hours} h`,
    lowBattery: 'Battery low',
    battery: 'Bat.',
  },
  fr: {
    notConfigured: "Saisissez l'adresse du broker MQTT dans la configuration de l'intégration.",
    noDevice: "Ajoutez d'abord vos capteurs à Gladys (onglet Découverte de l'intégration).",
    open: 'Ouvert',
    closed: 'Fermé',
    motion: 'Mouvement',
    noMotion: 'Aucun mouvement',
    online: 'En ligne',
    offline: 'Hors ligne',
    waiting: 'En attente de données',
    silent: (hours) => `Muet depuis ${hours} h`,
    lowBattery: 'Pile faible',
    battery: 'Pile',
  },
  de: {
    notConfigured: 'Gib die Adresse des MQTT-Brokers in der Konfiguration der Integration ein.',
    noDevice: 'Füge deine Sensoren zuerst zu Gladys hinzu (Tab „Erkennung“ der Integration).',
    open: 'Offen',
    closed: 'Geschlossen',
    motion: 'Bewegung',
    noMotion: 'Keine Bewegung',
    online: 'Online',
    offline: 'Offline',
    waiting: 'Warte auf Daten',
    silent: (hours) => `Seit ${hours} h stumm`,
    lowBattery: 'Batterie schwach',
    battery: 'Batt.',
  },
  es: {
    notConfigured: 'Introduzca la dirección del broker MQTT en la configuración de la integración.',
    noDevice: 'Añada primero sus sensores a Gladys (pestaña Descubrimiento de la integración).',
    open: 'Abierto',
    closed: 'Cerrado',
    motion: 'Movimiento',
    noMotion: 'Sin movimiento',
    online: 'En línea',
    offline: 'Fuera de línea',
    waiting: 'Esperando datos',
    silent: (hours) => `Sin datos desde hace ${hours} h`,
    lowBattery: 'Pila baja',
    battery: 'Pila',
  },
};

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const format = (value, language, digits) =>
  value.toLocaleString(language, { maximumFractionDigits: digits });

/** The main readings of a sensor, as a short text ('' when none). */
export function readings(values, language, { battery = false } = {}) {
  const text = pick(TEXT, language);
  const parts = [];
  if (values.temperature !== undefined) {
    parts.push(`${format(values.temperature, language, 1)} °C`);
  }
  if (values.humidity !== undefined) {
    parts.push(`${format(values.humidity, language, 0)} %`);
  }
  if (values.opening !== undefined) {
    parts.push(values.opening ? text.open : text.closed);
  }
  if (values.motion !== undefined) {
    parts.push(values.motion ? text.motion : text.noMotion);
  }
  if (parts.length === 0) {
    for (const [key, unit, digits] of [
      ['soil_moisture', '%', 0],
      ['co2', 'ppm', 0],
      ['pm25', 'µg/m³', 0],
      ['illuminance', 'lx', 0],
    ]) {
      if (values[key] !== undefined) {
        parts.push(`${format(values[key], language, digits)} ${unit}`);
      }
    }
  }
  if (battery && values.battery !== undefined) {
    parts.push(`${pick(TEXT, language).battery} ${format(values.battery, language, 0)} %`);
  }
  return parts.join(' · ');
}

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {{ name: string, values: object|null, silentFor: number }[]} input.sensors
 *   `silentFor`: ms since the sensor was last heard
 * @param {{ name: string, online: boolean|null }[]} input.gateways
 * @param {{ showBattery: boolean }} input.options
 * @param {string} input.language
 */
export function buildSensorsContent({ sensors, gateways, options, language }) {
  const text = pick(TEXT, language);
  const lines = [];
  for (const gateway of gateways) {
    const offline = gateway.online === false;
    lines.push({
      rank: offline ? 0 : 3,
      label: clip(gateway.name, MAX_LABEL),
      value: offline ? text.offline : text.online,
      icon: offline ? 'wifi-off' : 'radio',
      color: offline ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    });
  }
  for (const sensor of sensors) {
    const values = sensor.values ?? {};
    const silentHours = Math.floor(sensor.silentFor / HOUR);
    const low =
      values.battery_low === true ||
      (values.battery !== undefined && values.battery <= DEFAULT_BATTERY_THRESHOLD);
    const shown = readings(values, language, { battery: options.showBattery });
    let line;
    if (silentHours >= DEFAULT_SILENT_HOURS) {
      line = {
        rank: 0,
        value: text.silent(silentHours),
        icon: 'alert-triangle',
        color: WIDGET_COLORS.DANGER,
      };
    } else if (low) {
      line = {
        rank: 1,
        value: shown ? `${text.lowBattery} · ${shown}` : text.lowBattery,
        icon: 'battery',
        color: WIDGET_COLORS.WARNING,
      };
    } else {
      line = {
        rank: 2,
        value: shown || text.waiting,
        icon: values.opening !== undefined ? 'square' : 'thermometer',
        color: WIDGET_COLORS.NEUTRAL,
      };
    }
    lines.push({ ...line, label: clip(sensor.name, MAX_LABEL) });
  }
  const items = lines
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, language))
    .slice(0, MAX_LINES)
    .map(({ label, value, icon, color }) => ({
      label,
      value: clip(value, MAX_VALUE),
      icon,
      color,
    }));
  return { ttl_seconds: CONTENT_TTL_SECONDS, components: [{ type: 'status', items }] };
}

const isTrue = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;

/**
 * The onWidgetGet handler of the sensors widget.
 * @param {import('./hub.js').Hub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function getSensorsWidget(hub, { settings = {}, language = 'en' } = {}) {
  const text = pick(TEXT, language);
  if (!isConfigured(hub.config)) {
    return textContent(text.notConfigured);
  }
  const now = hub.now();
  const showGateways = isTrue(settings.show_gateways, true);
  const sensors = hub.addedSensors().map(({ device, sensor }) => ({
    name: device.name || device.external_id,
    values: sensor?.values ?? null,
    silentFor: now - hub.lastHeard(sensor),
  }));
  const gateways = showGateways
    ? hub.addedGateways().map(({ name, device, gateway }) => ({
        name: device.name || name,
        online: gateway?.online ?? null,
      }))
    : [];
  if (sensors.length === 0 && gateways.length === 0) {
    return textContent(text.noDevice);
  }
  return buildSensorsContent({
    sensors,
    gateways,
    options: { showBattery: isTrue(settings.show_battery, false) },
    language,
  });
}
