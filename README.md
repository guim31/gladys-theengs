# Theengs / OpenMQTTGateway for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration that reads the
sensors an [OpenMQTTGateway](https://docs.openmqttgateway.com/) or a
[Theengs Gateway](https://gateway.theengs.io/) decodes and publishes on MQTT:
Bluetooth (BLE) sensors decoded by Theengs Decoder, and 433 MHz sensors and
remotes decoded by rtl_433. The gateway does the radio: the integration only
subscribes to the broker.

> **Developed without the hardware: feedback welcome.** The tests use messages
> in the exact format of both gateways (read from their sources and
> documentation), but no real gateway was connected.

## Features

- **Sensors** in the Discovery tab: every decoded BLE device reporting at least
  one value (temperature, humidity, battery, low battery, soil moisture,
  illuminance, pressure, CO2, PM2.5, PM10, formaldehyde, motion, opening,
  thermometer probes), and the 433 MHz sensors decoded by rtl_433
  (temperature, humidity, low battery, pressure, wind, light, UV, contacts).
- **Gateways**: online (MQTT last will), uptime (OpenMQTTGateway), devices
  heard in the last 10 minutes.
- **Scene triggers**: a Bluetooth button pressed (Shelly BLU Button, BTHome
  remotes), a 433 MHz / infrared / rtl_433 remote code received.
- **Scene action**: check the sensors (low batteries, sensors gone silent), as
  a sentence ready for a message.
- **Widget**: the sensors and gateways, those needing attention first.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- An OpenMQTTGateway (v1.x) or a Theengs Gateway publishing on an MQTT broker
  that Gladys can reach (the broker installed by Gladys works).

## Installation

In Gladys: **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-theengs`. Fill in the broker address (and its
credentials), then add the sensors from the **Discovery** tab.

## Limitations

- Read-only: no command is sent; sending 433 MHz or infrared codes is not
  supported.
- Undecoded advertisements and devices with a random address (phones, Apple
  and Microsoft beacons, the decoder's `RMAC` type) are ignored.
- Encrypted BLE sensors need their key in the gateway.
- Overlaps: the Gladys Bluetooth integration reads BLE on the Gladys machine,
  the RFlink and RFPlayer integrations read 433 MHz, the MQTT integration can
  read any topic by hand, and ESPresense does room presence. This integration
  is for the sensors a Theengs or OpenMQTTGateway gateway already decodes.

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and [`mqtt`](https://github.com/mqttjs/MQTT.js) (MIT).

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys and a fake broker
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js            SDK wiring (src/app.js registers the handlers)
src/app.js          handlers: discovery, actions, scene action, widget, configuration
src/hub.js          MQTT link, gateways and sensors heard, states, scene events
src/theengs.js      the gateway topics and payloads -> values by feature key
src/devices.js      sensor and gateway devices, their features, state conversion
src/mqtt.js         MQTT client: link states (credentials never logged)
src/scenes.js       "Check the sensors" scene action
src/widgets.js      "Theengs sensors" widget
src/texts.js        every text, in en/fr/de/es
src/clientId.js     stable MQTT client id, kept in /data
test/               node --test; test/fixtures/gateways.jsonl holds the messages
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Theengs Decoder](https://github.com/theengs/decoder),
  [Theengs Gateway](https://github.com/theengs/gateway) and
  [OpenMQTTGateway](https://github.com/1technophile/OpenMQTTGateway)
  (GPL-3.0) by Florian Robert (1technophile) and contributors: the MQTT
  format and the decoder property names were read from their sources and
  documentation; no code of theirs is included.
- [rtl_433](https://github.com/merbanan/rtl_433) (GPL-2.0): the field names of
  its data dictionary.
- Cover: the Theengs logo (`docs/img/logo-Theengs.png` of Theengs Gateway) on
  a light background with its navy and orange colours.
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Theengs,
OpenMQTTGateway or rtl_433.

## License

[Apache-2.0](LICENSE).
