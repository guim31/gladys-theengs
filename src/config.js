// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  broker_url: '',
  username: '',
  password: '',
  tls_insecure: false,
  topic_root: 'home',
  offer_rtl_433: true,
  language: 'fr',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const bool = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;

/**
 * The broker address, with its scheme: users type `192.0.2.10`,
 * `192.0.2.10:1883` or a full `mqtt://` / `mqtts://` URL.
 * @returns {string} '' when absent or not a broker URL
 */
export function normalizeBrokerUrl(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `mqtt://${raw}`;
  try {
    const url = new URL(withScheme);
    return ['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname
      ? withScheme
      : '';
  } catch {
    return '';
  }
}

/**
 * The root of the gateway topics (`home` in OpenMQTTGateway and Theengs
 * Gateway, `home/TheengsGateway/BTtoMQTT` being `<root>/<gateway>/<module>`):
 * no wildcard, no leading or trailing slash.
 */
export function normalizeRoot(value) {
  const raw = text(value).replace(/^\/+|\/+$/g, '');
  return raw === '' || /[#+]/.test(raw) ? DEFAULT_CONFIG.topic_root : raw;
}

/**
 * @param {object} [raw] the values received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  return {
    broker_url: normalizeBrokerUrl(source.broker_url),
    username: text(source.username),
    // A password may legitimately start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    tls_insecure: bool(source.tls_insecure, false),
    topic_root: normalizeRoot(source.topic_root),
    offer_rtl_433: bool(source.offer_rtl_433, DEFAULT_CONFIG.offer_rtl_433),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

export const isConfigured = (config) => Boolean(config?.broker_url);

/**
 * An address safe for the logs and the messages: no user name, no password,
 * no path or query string.
 */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '(invalid address)';
  }
}
