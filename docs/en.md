# Theengs / OpenMQTTGateway

Bluetooth (BLE) sensors decoded by an **OpenMQTTGateway** (ESP32) or a **Theengs Gateway** (Raspberry
Pi, Home Assistant add-on, Docker), and with a radio module the 433 MHz sensors decoded by **rtl_433**,
read from your MQTT broker. The gateway does the Bluetooth and the radio: Gladys only reads what it
publishes.

> Developed without the hardware: feedback welcome. The messages used in the tests follow the
> exact format of both gateways, but no real gateway was connected.

## What you get

- **Sensors**: one device per decoded sensor you add, with what the decoder reports: temperature,
  humidity, battery, low battery, soil moisture, illuminance, pressure, CO2, PM2.5, PM10,
  formaldehyde, motion, opening (door and window sensors), probes of barbecue thermometers. Xiaomi
  (LYWSD03MMC, original or ATC / PVVX firmware), SwitchBot, Inkbird, Govee, Qingping, Shelly BLU,
  BTHome, ThermoBeacon and more than 150 other models of Theengs Decoder.
- **433 MHz sensors** decoded by rtl_433 (Oregon Scientific, Acurite, LaCrosse, Fine Offset
  weather stations…): temperature, humidity, low battery, pressure, wind, light, UV, contacts.
- **Gateways**: online or offline, uptime (OpenMQTTGateway), number of devices heard.
- **Scenes**: a trigger for the Bluetooth buttons, a trigger for the 433 MHz, infrared and rtl_433
  remote codes, an action to check batteries and silent sensors.
- **Dashboard**: the Theengs sensors widget.

## Before you start

- A gateway publishing on an MQTT broker:
  - **OpenMQTTGateway** v1.x on an ESP32, with the BLE module (and RTL_433, RF or IR if your board has
    them);
  - or **Theengs Gateway** with its default topics (`home/TheengsGateway/BTtoMQTT`).
- The broker address, and a user name and password if it asks for them. The broker installed by
  Gladys (MQTT integration) works.
- Encrypted sensors (Xiaomi with bind key, Shelly BLU encrypted, BTHome encrypted) are decoded only
  if you gave the key to the gateway.

## Configuration

| Field                      | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| Broker address             | `mqtt://` (1883) or `mqtts://` (8883), e.g. `mqtt://192.168.1.10:1883`.          |
| User name, password        | Empty for an anonymous broker.                                                   |
| Accept a self-signed cert. | `mqtts://` only.                                                                 |
| Topic root                 | `home`: the part before the gateway name in `home/OpenMQTTGateway/BTtoMQTT`.     |
| Offer the 433 MHz sensors  | Uncheck to hide every rtl_433 sensor from the Discovery tab (neighbours' ones…). |
| Language of the texts      | Feature names when a device is added, scene sentences, action messages.          |

Two buttons on the integration page: **Check the connection** (broker, gateways and devices heard)
and **Show the last codes** (the last 433 MHz, infrared and rtl_433 codes, to copy into a scene).

The integration only subscribes to the topics of the gateways (`BTtoMQTT`, `RTL_433toMQTT`,
`433toMQTT`, `IRtoMQTT`, `LWT`, `SYStoMQTT`): it never publishes anything.

## Devices

Open the **Discovery** tab of the integration: it lists the gateways, and the sensors heard in the
last 10 minutes that the decoder recognized and that report at least one value. Add the ones you
want; give them a name and a room as for any device.

- A Bluetooth sensor is identified by its MAC address, an rtl_433 sensor by its model, channel and
  id. Many cheap 433 MHz sensors draw a new id when the battery is replaced: add the new device
  then.
- Left out on purpose: undecoded advertisements, phones, watches and other devices with a random
  address (Apple, Microsoft, exposure notification beacons). For room presence, see the ESPresense
  integration.
- A sensor that reports a new value later (the probe of a thermometer plugged in…) is offered again
  with **Update** in the Discovery tab.
- Measures are sent to Gladys every 30 seconds when they change; a door, a motion or a low battery at
  once.
- A SwitchBot Blind Tilt only gets its battery: its `open` is a position, not a door.

## Gateways

A gateway device shows whether the gateway is online (its MQTT last will, `LWT`), how many decoded
devices it heard in the last 10 minutes, and for OpenMQTTGateway its uptime (`SYStoMQTT`). Several
gateways can hear the same sensor: the readings are the same, the button presses and codes are
counted once.

## Scenes

- **Bluetooth button pressed** (trigger): a Bluetooth button added to Gladys (Shelly BLU Button,
  BTHome remote…). Filters: the button, the press (single, double, triple, long), the button
  number on a four-button remote. Variables: name, press, number, event code.
- **Code received** (trigger): a gateway received a 433 MHz code (doorbell, remote, detector), an
  infrared code, or a remote decoded by rtl_433. Filters: the code, its kind, the gateway. Press the
  remote, then **Show the last codes** on the integration page gives the code to copy. A code
  repeated within 1.5 seconds counts once.
- **Check the sensors** (action): the sensors added to Gladys whose battery is low (under 20 %
  unless you choose) and those no gateway has heard for more than 2 hours (unless you choose), as a
  sentence ready for a message, with the two counts. Example: every Sunday, send the sentence when a
  count is above 0.

## Dashboard

The **Theengs sensors** widget lists the sensors and gateways added to Gladys, those needing
attention first: gateway offline, sensor silent for 2 hours, battery low. Settings: show the
gateways, show the battery level.

## Limits

- Read-only: no command is sent to a device, and sending 433 MHz or infrared codes is not supported.
- Undecoded advertisements and devices with a random address are ignored.
- Overlaps: Gladys reads Bluetooth itself with the Bluetooth integration (on the Gladys machine);
  433 MHz with the RFlink and RFPlayer integrations; and the MQTT integration can read any topic by
  hand. This integration is for the sensors a Theengs or OpenMQTTGateway gateway already decodes.
- The silent time of a sensor counts from the start of the integration at worst.

## Troubleshooting

- **Check the connection** says no gateway: check the topic root (the first part of the topics,
  `home` by default) and that the gateway uses the same broker (`mosquitto_sub -v -t 'home/#'`).
- A sensor is missing from Discovery: it must be decoded by the gateway (`model_id` in its message)
  and heard in the last 10 minutes. Encrypted sensors need their key in the gateway.
- Detailed logs: `LOG_LEVEL=debug` on the container.
