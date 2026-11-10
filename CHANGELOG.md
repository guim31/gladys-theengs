# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The BLE sensors decoded by OpenMQTTGateway or Theengs Gateway, read from the
  MQTT broker and offered in the Discovery tab: temperature, humidity, battery,
  low battery, soil moisture, illuminance, pressure, CO2, PM2.5, PM10,
  formaldehyde, motion, opening, thermometer probes.
- The 433 MHz sensors decoded by rtl_433 (temperature, humidity, low battery,
  pressure, wind, light, UV, contacts), which can be hidden from Discovery.
- One device per gateway: online, uptime (OpenMQTTGateway), devices heard.
- Scene triggers: Bluetooth button pressed, 433 MHz / infrared / rtl_433 code
  received; the "Show the last codes" action lists the codes to copy.
- Scene action: check the sensors (low batteries, silent sensors).
- Dashboard widget: the sensors and gateways, those needing attention first.
- Texts and documentation in English, French, German and Spanish.
