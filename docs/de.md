# Theengs / OpenMQTTGateway

Bluetooth-Sensoren (BLE), dekodiert von einem **OpenMQTTGateway** (ESP32) oder einem **Theengs
Gateway** (Raspberry Pi, Home-Assistant-Add-on, Docker), und mit Funkmodul die von **rtl_433**
dekodierten 433-MHz-Sensoren, gelesen von deinem MQTT-Broker. Das Gateway erledigt Bluetooth und
Funk: Gladys liest nur, was es veröffentlicht.

> Ohne die Hardware entwickelt: Rückmeldungen willkommen. Die Nachrichten in den Tests folgen dem
> genauen Format beider Gateways, aber es war kein echtes Gateway angeschlossen.

## Was du bekommst

- **Sensoren**: ein Gerät pro dekodiertem Sensor, den du hinzufügst, mit dem, was der Decoder
  meldet: Temperatur, Luftfeuchtigkeit, Batterie, schwache Batterie, Bodenfeuchte, Helligkeit,
  Luftdruck, CO2, PM2,5, PM10, Formaldehyd, Bewegung, Öffnung (Tür- und Fenstersensoren), Fühler
  von Grillthermometern. Xiaomi (LYWSD03MMC, Original- oder ATC-/PVVX-Firmware), SwitchBot,
  Inkbird, Govee, Qingping, Shelly BLU, BTHome, ThermoBeacon und über 150 weitere Modelle von
  Theengs Decoder.
- **433-MHz-Sensoren**, dekodiert von rtl_433 (Wetterstationen von Oregon Scientific, Acurite,
  LaCrosse, Fine Offset…): Temperatur, Luftfeuchtigkeit, schwache Batterie, Luftdruck, Wind, Licht,
  UV, Kontakte.
- **Gateways**: online oder offline, Laufzeit (OpenMQTTGateway), Anzahl der gehörten Geräte.
- **Szenen**: ein Auslöser für Bluetooth-Tasten, ein Auslöser für 433-MHz-, Infrarot- und
  rtl_433-Fernbedienungscodes, eine Aktion, um Batterien und stumme Sensoren zu prüfen.
- **Dashboard**: das Widget Theengs-Sensoren.

## Bevor du beginnst

- Ein Gateway, das an einen MQTT-Broker sendet:
  - **OpenMQTTGateway** v1.x auf einem ESP32, mit dem BLE-Modul (und RTL_433, RF oder IR, wenn dein
    Board sie hat);
  - oder **Theengs Gateway** mit seinen Standard-Topics (`home/TheengsGateway/BTtoMQTT`).
- Die Adresse des Brokers, und Benutzername und Passwort, wenn er sie verlangt. Der von Gladys
  installierte Broker (MQTT-Integration) geht.
- Verschlüsselte Sensoren (Xiaomi mit Bindkey, verschlüsseltes Shelly BLU, verschlüsseltes BTHome)
  werden nur dekodiert, wenn du dem Gateway den Schlüssel gegeben hast.

## Konfiguration

| Feld                        | Zweck                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Adresse des Brokers         | `mqtt://` (1883) oder `mqtts://` (8883), z. B. `mqtt://192.168.1.10:1883`.        |
| Benutzername, Passwort      | Leer bei einem anonymen Broker.                                                   |
| Selbstsigniertes Zertifikat | Nur `mqtts://`.                                                                   |
| Topic-Wurzel                | `home`: der Teil vor dem Gateway-Namen in `home/OpenMQTTGateway/BTtoMQTT`.        |
| 433-MHz-Sensoren anbieten   | Deaktivieren, um alle rtl_433-Sensoren in der Erkennung auszublenden (Nachbarn…). |
| Sprache der Texte           | Namen der Funktionen beim Hinzufügen, Szenen-Sätze, Meldungen der Aktionen.       |

Zwei Knöpfe auf der Seite der Integration: **Verbindung prüfen** (Broker, gehörte Gateways und
Geräte) und **Letzte Codes anzeigen** (die letzten 433-MHz-, Infrarot- und rtl_433-Codes, zum
Kopieren in eine Szene).

Die Integration abonniert nur die Topics der Gateways (`BTtoMQTT`, `RTL_433toMQTT`, `433toMQTT`,
`IRtoMQTT`, `LWT`, `SYStoMQTT`) und veröffentlicht nie etwas.

## Geräte

Öffne den Tab **Erkennung** der Integration: Er listet die Gateways und die Sensoren, die in den
letzten 10 Minuten gehört wurden, die der Decoder erkannt hat und die mindestens einen Wert melden.
Füge die gewünschten hinzu; gib ihnen einen Namen und einen Raum wie jedem Gerät.

- Ein Bluetooth-Sensor wird an seiner MAC-Adresse erkannt, ein rtl_433-Sensor an Modell, Kanal und
  ID. Viele günstige 433-MHz-Sensoren wählen beim Batteriewechsel eine neue ID: Füge dann das neue
  Gerät hinzu.
- Absichtlich ausgelassen: nicht dekodierte Werbepakete, Handys, Uhren und andere Geräte mit
  zufälliger Adresse (Apple, Microsoft, Beacons der Begegnungsaufzeichnung). Für Anwesenheit pro
  Raum siehe die ESPresense-Integration.
- Ein Sensor, der später einen neuen Wert meldet (der Fühler eines eingesteckten Thermometers…),
  wird in der Erkennung mit **Aktualisieren** erneut angeboten.
- Messwerte gehen alle 30 Sekunden an Gladys, wenn sie sich ändern; eine Tür, eine Bewegung oder eine
  schwache Batterie sofort.
- Ein SwitchBot Blind Tilt bekommt nur seine Batterie: Sein `open` ist eine Position, keine Tür.

## Gateways

Ein Gateway-Gerät zeigt, ob das Gateway online ist (sein MQTT-Testament, `LWT`), wie viele
dekodierte Geräte es in den letzten 10 Minuten gehört hat und bei OpenMQTTGateway seine Laufzeit
(`SYStoMQTT`). Mehrere Gateways können denselben Sensor hören: Die Messwerte sind dieselben,
Tastendrücke und Codes zählen einmal.

## Szenen

- **Bluetooth-Taste gedrückt** (Auslöser): eine zu Gladys hinzugefügte Bluetooth-Taste (Shelly BLU
  Button, BTHome-Fernbedienung…). Filter: die Taste, der Druck (einfach, doppelt, dreifach, lang),
  die Nummer der Taste bei einer Fernbedienung mit vier Tasten. Variablen: Name, Druck, Nummer,
  Ereigniscode.
- **Code empfangen** (Auslöser): Ein Gateway hat einen 433-MHz-Code (Klingel, Fernbedienung,
  Melder), einen Infrarot-Code oder eine von rtl_433 dekodierte Fernbedienung empfangen. Filter: der
  Code, seine Art, das Gateway. Drück die Fernbedienung, dann zeigt **Letzte Codes anzeigen** auf
  der Seite der Integration den Code zum Kopieren. Ein innerhalb von 1,5 Sekunden wiederholter Code
  zählt einmal.
- **Sensoren prüfen** (Aktion): die zu Gladys hinzugefügten Sensoren mit schwacher Batterie (unter
  20 %, außer du wählst anders) und die, die seit mehr als 2 Stunden kein Gateway gehört hat (außer
  du wählst anders), als Satz für eine Nachricht, mit beiden Zahlen. Beispiel: jeden Sonntag den Satz
  senden, wenn eine Zahl über 0 liegt.

## Dashboard

Das Widget **Theengs-Sensoren** listet die zu Gladys hinzugefügten Sensoren und Gateways, auffällige
zuerst: Gateway offline, Sensor seit 2 Stunden stumm, Batterie schwach. Einstellungen: Gateways
anzeigen, Batteriestand anzeigen.

## Grenzen

- Nur lesend: Es wird kein Befehl an Geräte gesendet, und das Senden von 433-MHz- oder
  Infrarot-Codes wird nicht unterstützt.
- Nicht dekodierte Werbepakete und Geräte mit zufälliger Adresse werden ignoriert.
- Überschneidungen: Gladys liest Bluetooth selbst mit der Bluetooth-Integration (auf dem
  Gladys-Rechner), 433 MHz mit den Integrationen RFlink und RFPlayer, und die MQTT-Integration kann
  jedes Topic von Hand lesen. Diese Integration ist für Sensoren, die ein Theengs- oder
  OpenMQTTGateway-Gateway schon dekodiert.
- Die Stummzeit eines Sensors zählt schlimmstenfalls ab dem Start der Integration.

## Fehlerbehebung

- **Verbindung prüfen** sieht kein Gateway: Prüfe die Topic-Wurzel (der erste Teil der Topics,
  standardmäßig `home`) und ob das Gateway denselben Broker nutzt (`mosquitto_sub -v -t 'home/#'`).
- Ein Sensor fehlt in der Erkennung: Er muss vom Gateway dekodiert sein (`model_id` in seiner
  Nachricht) und in den letzten 10 Minuten gehört worden sein. Verschlüsselte Sensoren brauchen
  ihren Schlüssel im Gateway.
- Ausführliche Logs: `LOG_LEVEL=debug` am Container.
