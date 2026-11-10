// -----------------------------------------------------------------------------
// The hub: the MQTT client, what the gateways report, and everything Gladys
// sees from it — discovered devices, states, scene events, connection status.
//
// A BLE sensor advertises every few seconds, and every gateway that hears it
// relays it: the readings are kept in memory and the measures published every
// TICK_MS, only when they changed (publishChangedStates, with a heartbeat so a
// steady value never looks stale). Two-state values (opening, motion, low
// battery) go out at once: a door must not wait half a minute.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, safeUrl } from './config.js';
import {
  BLE_TYPE,
  GATEWAY_TYPE,
  RTL_433_TYPE,
  SENSOR_FEATURES,
  buildGatewayDevice,
  buildSensorDevice,
  idsOf,
  isPlausible,
  platformIdOf,
  sensorFeatureKeys,
  sensorName,
  stateOf,
} from './devices.js';
import { createIssueLog } from './issues.js';
import { createClient } from './mqtt.js';
import { CHECK_TEXT, MESSAGES, pick, pressKind } from './texts.js';
import { parseMessage, subscriptions } from './theengs.js';

const logger = createLogger({ name: 'theengs-hub' });

export const WIDGET_KEY = 'sensors';
export const TRIGGER = {
  BUTTON_PRESSED: 'button_pressed',
  CODE_RECEIVED: 'code_received',
};

export const DEFAULT_TIMINGS = {
  tickMs: 30_000,
  // A discovery list that changed is sent again after this quiet time.
  discoveryDelayMs: 5_000,
  // Devices heard in that window are offered in the Discovery tab, and
  // counted by their gateways.
  discoveryWindowMs: 10 * 60_000,
  // A steady state is published again after that long.
  heartbeatMs: 6 * 60 * 60_000,
  // The same code or button press relayed by several gateways, or repeated by
  // a remote, within that time is one press.
  repeatMs: 1_500,
  // The same packet id after that long is a new press (counter wrapped or
  // restarted by a battery swap).
  packetMs: 10_000,
  // Sensors not added in Gladys and not heard for that long are forgotten,
  // gateways after a week.
  forgetSensorMs: 24 * 60 * 60_000,
  forgetGatewayMs: 7 * 24 * 60 * 60_000,
};
export const MAX_DISCOVERED = 100;
export const MAX_RECENT_CODES = 5;

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {() => Promise<{ clientId: string }>} options.loadClientId
   * @param {object} [options.timings]
   */
  constructor({ gladys, now = () => Date.now(), connectMqtt, loadClientId, timings = {} }) {
    this.gladys = gladys;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.loadClientId = loadClientId;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    this.#reset();
    this.discoveryTimer = null;
    this.tickTimer = null;
    this.generation = 0;
  }

  #reset() {
    /** @type {Map<string, object>} name -> { name, online, uptime, version, sys, lastSeen } */
    this.gateways = new Map();
    /** @type {Map<string, object>} `${kind}:${id}` -> sensor */
    this.sensors = new Map();
    /** @type {Map<string, number>} event key -> when it was last fired */
    this.lastEvents = new Map();
    /** @type {{ at: number, source: string, code: string, gateway: string }[]} */
    this.recentCodes = [];
    this.startedAt = this.now();
    this.discoveryKey = '';
  }

  // --- lifecycle --------------------------------------------------------------

  async configure(config) {
    // Any newer configuration, even an empty one, cancels a connection still
    // waiting for its client id.
    const generation = ++this.generation;
    const previous = this.config;
    this.config = config;
    const sameLink =
      previous &&
      previous.broker_url === config.broker_url &&
      previous.username === config.username &&
      previous.password === config.password &&
      previous.tls_insecure === config.tls_insecure &&
      previous.topic_root === config.topic_root;
    if (sameLink && this.client) {
      // Only the language or the Discovery options changed.
      this.discoveryKey = '';
      this.scheduleDiscovery();
      return;
    }
    this.#stopClient();
    this.#reset();
    if (!isConfigured(config)) {
      await this.#status(false, MESSAGES.notConfigured);
      // The broker is gone: so are the devices it offered.
      await this.publishDiscovery();
      return;
    }
    const { clientId } = await this.loadClientId();
    if (generation !== this.generation) {
      return;
    }
    logger.info(`Connecting to the MQTT broker ${safeUrl(config.broker_url)}`);
    this.client = createClient({
      url: config.broker_url,
      username: config.username,
      password: config.password,
      clientId,
      tlsInsecure: config.tls_insecure,
      topics: subscriptions(config.topic_root),
      onMessage: (topic, payload) => this.onMessage(topic, payload),
      onState: (state, detail) => this.onLinkState(state, detail),
      ...(this.connectMqtt ? { connect: this.connectMqtt } : {}),
    });
    this.#startTick();
  }

  stop() {
    this.generation += 1;
    this.#stopClient();
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = null;
  }

  #stopClient() {
    this.client?.stop();
    this.client = null;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  #startTick() {
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => logger.error(`Update failed: ${err.message}`));
    }, this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  async #status(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async onLinkState(state, detail) {
    const url = safeUrl(this.config.broker_url);
    if (state === 'connected') {
      logger.info(`Connected to the MQTT broker ${url}`);
      await this.#status(true);
      return;
    }
    logger.warn(`MQTT broker ${url}: ${state} (${detail ?? 'no detail'})`);
    await this.#status(false, state === 'refused' ? MESSAGES.refused : MESSAGES.unreachable);
  }

  // --- messages ---------------------------------------------------------------

  onMessage(topic, payload) {
    const message = parseMessage(this.config.topic_root, topic, payload);
    if (!message) {
      return;
    }
    const now = this.now();
    const gateway = this.#gateway(message.gateway, now);
    switch (message.kind) {
      case 'lwt':
        this.#setOnline(gateway, message.online);
        return;
      case 'sys':
        if (!gateway.sys) {
          gateway.sys = true;
          this.scheduleDiscovery();
        }
        gateway.uptime = message.uptime;
        gateway.version = message.version;
        this.#setOnline(gateway, true);
        return;
      case 'ble':
      case 'rtl433':
        this.#setOnline(gateway, true);
        this.#onReading(message, gateway, now);
        return;
      case 'code':
        this.#setOnline(gateway, true);
        this.#onCode(message, gateway, now);
        return;
      default:
    }
  }

  #gateway(name, now) {
    let gateway = this.gateways.get(name);
    if (!gateway) {
      gateway = { name, online: null, uptime: null, version: '', sys: false, lastSeen: now };
      this.gateways.set(name, gateway);
      this.scheduleDiscovery();
    }
    gateway.lastSeen = now;
    return gateway;
  }

  #setOnline(gateway, online) {
    if (gateway.online === online) {
      return;
    }
    const was = gateway.online;
    gateway.online = online;
    if (was !== null) {
      // A gateway lost or back: lifecycle, worth an info line.
      logger.info(`Gateway ${gateway.name} is ${online ? 'online again' : 'offline'}`);
    }
    const ids = idsOf(this.gladys, GATEWAY_TYPE, gateway.name);
    this.#publish([{ device_feature_external_id: ids.feature('online'), state: online ? 1 : 0 }]);
    this.requestWidgetRefresh();
  }

  #onReading(message, gateway, now) {
    const kind = message.kind === 'ble' ? BLE_TYPE : RTL_433_TYPE;
    const key = `${kind}:${message.id}`;
    let sensor = this.sensors.get(key);
    if (!sensor) {
      sensor = {
        kind,
        id: message.id,
        brand: message.brand ?? '',
        model: message.model ?? '',
        modelId: message.modelId ?? '',
        keys: new Set(),
        values: {},
        gateways: new Map(),
        lastSeen: now,
        lastPacket: undefined,
      };
      this.sensors.set(key, sensor);
    }
    sensor.lastSeen = now;
    sensor.gateways.set(gateway.name, now);
    const before = sensorFeatureKeys(sensor.keys).join();
    const binary = [];
    for (const [feature, value] of Object.entries(message.values)) {
      if (!isPlausible(feature, value)) {
        continue;
      }
      sensor.keys.add(feature);
      if (SENSOR_FEATURES[feature]?.binary && sensor.values[feature] !== value) {
        binary.push(feature);
      }
      sensor.values[feature] = value;
    }
    if (sensorFeatureKeys(sensor.keys).join() !== before && this.#offered(sensor)) {
      this.scheduleDiscovery();
    }
    if (binary.length > 0) {
      const ids = idsOf(this.gladys, kind, sensor.id);
      this.#publish(
        binary.map((feature) => ({
          device_feature_external_id: ids.feature(feature),
          state: stateOf(feature, sensor.values[feature]),
        })),
      );
      this.requestWidgetRefresh();
    }
    if (kind === BLE_TYPE) {
      this.#onPresses(sensor, message, now);
    } else if (message.code) {
      this.#onCode(
        { source: 'rtl_433', code: `${sensor.id}/${message.code}`, protocol: message.model },
        gateway,
        now,
      );
    }
  }

  /** A press is sent in several advertisements (same packet id) and by every gateway. */
  #onPresses(sensor, message, now) {
    if (message.presses.length === 0) {
      return;
    }
    const ids = idsOf(this.gladys, BLE_TYPE, sensor.id);
    const device = this.#added(ids.device);
    // A neighbour's button is no trigger: only the buttons added to Gladys.
    if (!device) {
      return;
    }
    if (message.packet !== undefined) {
      if (
        sensor.lastPacket === message.packet &&
        now - sensor.lastPacketAt <= this.timings.packetMs
      ) {
        return;
      }
      sensor.lastPacket = message.packet;
      sensor.lastPacketAt = now;
    }
    for (const { button, code } of message.presses) {
      if (
        message.packet === undefined &&
        !this.#firstOf(`press:${sensor.id}:${button}:${code}`, now)
      ) {
        continue;
      }
      logger.debug(`Button ${button} of ${sensor.id} pressed (${code})`);
      this.#fire(TRIGGER.BUTTON_PRESSED, {
        device: ids.device,
        press: pressKind(code),
        button,
        code,
        device_name: device.name || sensorName(sensor),
      });
    }
  }

  #onCode({ source, code, protocol }, gateway, now) {
    if (!this.#firstOf(`code:${source}:${code}`, now)) {
      return;
    }
    logger.debug(`Code ${source} ${code} received by ${gateway.name}`);
    this.recentCodes = [{ at: now, source, code, gateway: gateway.name }, ...this.recentCodes]
      .filter(
        (entry, index, list) =>
          list.findIndex((other) => other.source === entry.source && other.code === entry.code) ===
          index,
      )
      .slice(0, MAX_RECENT_CODES);
    const ids = idsOf(this.gladys, GATEWAY_TYPE, gateway.name);
    this.#fire(TRIGGER.CODE_RECEIVED, {
      gateway: ids.device,
      source,
      code,
      protocol: protocol ?? '',
      gateway_name: this.#added(ids.device)?.name || gateway.name,
    });
  }

  /** True the first time an event is seen within the repeat window. */
  #firstOf(key, now) {
    const last = this.lastEvents.get(key);
    this.lastEvents.set(key, now);
    if (this.lastEvents.size > 500) {
      for (const [other, at] of this.lastEvents) {
        if (now - at > this.timings.repeatMs) {
          this.lastEvents.delete(other);
        }
      }
    }
    return last === undefined || now - last > this.timings.repeatMs;
  }

  #fire(key, data) {
    this.gladys
      .publishSceneEvent(key, data)
      .then(() => this.issues.ok('scene', 'Gladys accepts the scene events again'))
      .catch((err) => this.issues.fail('scene', `Firing the scene event failed: ${err.message}`));
  }

  // --- Gladys devices ---------------------------------------------------------

  #added(externalId) {
    return (this.gladys.devices ?? []).find((device) => device.external_id === externalId);
  }

  /** The sensors added in Gladys, with their device and what was heard of them. */
  addedSensors() {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      for (const kind of [BLE_TYPE, RTL_433_TYPE]) {
        const id = platformIdOf(this.gladys, device.external_id, kind);
        if (id !== null) {
          list.push({ kind, id, device, sensor: this.sensors.get(`${kind}:${id}`) ?? null });
        }
      }
    }
    return list;
  }

  /** The gateways added in Gladys, with their device and their state. */
  addedGateways() {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      const name = platformIdOf(this.gladys, device.external_id, GATEWAY_TYPE);
      if (name !== null) {
        list.push({ name, device, gateway: this.gateways.get(name) ?? null });
      }
    }
    return list;
  }

  /** A sensor worth offering: something to show, and rtl_433 ones only if wanted. */
  #offered(sensor) {
    return (
      sensorFeatureKeys(sensor.keys).length > 0 &&
      (sensor.kind === BLE_TYPE || this.config.offer_rtl_433)
    );
  }

  /** Decoded devices heard by a gateway in the discovery window. */
  heardBy(name, now = this.now()) {
    let count = 0;
    for (const sensor of this.sensors.values()) {
      const at = sensor.gateways.get(name);
      if (at !== undefined && now - at <= this.timings.discoveryWindowMs) {
        count += 1;
      }
    }
    return count;
  }

  discoveredDevices() {
    const now = this.now();
    const language = this.config?.language ?? 'fr';
    const added = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    const isAdded = (sensor) => added.has(idsOf(this.gladys, sensor.kind, sensor.id).device);
    const sensors = [...this.sensors.values()]
      .filter(
        (sensor) =>
          sensorFeatureKeys(sensor.keys).length > 0 &&
          (isAdded(sensor) ||
            (this.#offered(sensor) && now - sensor.lastSeen <= this.timings.discoveryWindowMs)),
      )
      // Past the cap, the added devices first, then the most recently heard.
      .sort((a, b) => Number(isAdded(b)) - Number(isAdded(a)) || b.lastSeen - a.lastSeen)
      .slice(0, MAX_DISCOVERED)
      .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))
      .map((sensor) => buildSensorDevice(this.gladys, sensor, language));
    const gateways = [...this.gateways.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((gateway) => buildGatewayDevice(this.gladys, gateway, language));
    return [...gateways, ...sensors];
  }

  scheduleDiscovery() {
    if (this.discoveryTimer) {
      return;
    }
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.publishDiscovery().catch(() => {});
    }, this.timings.discoveryDelayMs);
    this.discoveryTimer.unref?.();
  }

  /** The discovered devices; only sent again when the list changed (or forced). */
  async publishDiscovery({ force = false } = {}) {
    if (!this.config) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discoveryKey) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveryKey = key;
      this.issues.ok('discovery', 'Gladys accepts the discovered devices again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the discovered devices failed: ${err.message}`);
    }
  }

  // --- states -----------------------------------------------------------------

  /** Every known value of the added devices; publishChangedStates keeps the changes. */
  currentStates(now = this.now()) {
    const states = [];
    for (const { kind, id, sensor } of this.addedSensors()) {
      if (!sensor) {
        continue; // not heard since the start: nothing to say yet
      }
      // Every value heard: #publish keeps the features the added device has
      // (a battery voltage stays fed after a percentage shows up).
      const ids = idsOf(this.gladys, kind, id);
      for (const [key, value] of Object.entries(sensor.values)) {
        states.push({ device_feature_external_id: ids.feature(key), state: stateOf(key, value) });
      }
    }
    for (const { name, gateway } of this.addedGateways()) {
      if (!gateway) {
        continue;
      }
      const ids = idsOf(this.gladys, GATEWAY_TYPE, name);
      if (gateway.online !== null) {
        states.push({
          device_feature_external_id: ids.feature('online'),
          state: gateway.online ? 1 : 0,
        });
      }
      states.push({
        device_feature_external_id: ids.feature('devices'),
        state: this.heardBy(name, now),
      });
      if (gateway.uptime !== null) {
        states.push({ device_feature_external_id: ids.feature('uptime'), state: gateway.uptime });
      }
    }
    return states;
  }

  /** Publish the changed states of the added devices, forget the long gone. */
  async tick() {
    if (!this.config || !isConfigured(this.config)) {
      return;
    }
    this.#prune(this.now());
    await this.#publish(this.currentStates());
  }

  #prune(now) {
    const added = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    for (const [key, sensor] of this.sensors) {
      if (
        now - sensor.lastSeen > this.timings.forgetSensorMs &&
        !added.has(idsOf(this.gladys, sensor.kind, sensor.id).device)
      ) {
        this.sensors.delete(key);
      }
    }
    for (const [name, gateway] of this.gateways) {
      if (
        now - gateway.lastSeen > this.timings.forgetGatewayMs &&
        !added.has(idsOf(this.gladys, GATEWAY_TYPE, name).device)
      ) {
        this.gateways.delete(name);
      }
    }
  }

  async #publish(states) {
    // Features not added in Gladys (a sensor added before its probe was
    // heard…) are filtered out: the core would only drop them.
    const known = new Set(
      (this.gladys.devices ?? []).flatMap((device) =>
        (device.features ?? []).map((feature) => feature.external_id),
      ),
    );
    const kept = states.filter((state) => known.has(state.device_feature_external_id));
    if (kept.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(kept, { heartbeat: this.timings.heartbeatMs });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed: ${err.message}`);
    }
  }

  /**
   * A device was just added or updated in Gladys: the SDK has forgotten the
   * states of that device only, the next publication sends them again.
   */
  async republish() {
    await this.tick();
  }

  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch {
      // Fire-and-forget: a refresh lost while disconnected is caught up by the TTL.
    }
  }

  // --- readers for the actions, the scene action and the widget ----------------

  /** When a sensor was last heard: since the start at worst (nothing is known before). */
  lastHeard(sensor) {
    return sensor?.lastSeen ?? this.startedAt;
  }

  checkConnection() {
    const text = pick(CHECK_TEXT, this.config?.language);
    if (!isConfigured(this.config)) {
      return text.notConfigured;
    }
    const url = safeUrl(this.config.broker_url);
    const state = this.client?.state ?? null;
    if (state === 'refused') {
      return text.refused;
    }
    if (state === 'unreachable') {
      return text.unreachable;
    }
    if (state !== 'connected') {
      return text.connecting;
    }
    if (this.gateways.size === 0) {
      return text.noGateway(url);
    }
    const online = [...this.gateways.values()].filter((gateway) => gateway.online !== false).length;
    const now = this.now();
    const heard = [...this.sensors.values()].filter(
      (sensor) => now - sensor.lastSeen <= this.timings.discoveryWindowMs,
    ).length;
    return text.ok(url, this.gateways.size, online, heard);
  }
}
