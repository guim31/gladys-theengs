// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of Gladys. German
// says "du", Spanish "usted". The language is the one of the configuration
// (a device integration and a scene action do not receive the user's), except
// for the widget, which gets the viewer's.
// -----------------------------------------------------------------------------

export const pick = (table, language) => table[language] ?? table.en;

/** Feature names, frozen when the user adds the device. */
export const FEATURE_NAMES = {
  en: {
    temperature: 'Temperature',
    temperature_2: 'Temperature 2',
    temperature_3: 'Temperature 3',
    temperature_4: 'Temperature 4',
    temperature_5: 'Temperature 5',
    temperature_6: 'Temperature 6',
    humidity: 'Humidity',
    battery: 'Battery',
    battery_voltage: 'Battery voltage',
    battery_low: 'Low battery',
    soil_moisture: 'Soil moisture',
    illuminance: 'Illuminance',
    pressure: 'Pressure',
    co2: 'CO2',
    pm25: 'PM2.5',
    pm10: 'PM10',
    formaldehyde: 'Formaldehyde',
    motion: 'Motion',
    opening: 'Opening',
    uv: 'UV index',
    wind_speed: 'Wind speed',
    online: 'Gateway online',
    uptime: 'Uptime',
    devices: 'Devices heard',
  },
  fr: {
    temperature: 'Température',
    temperature_2: 'Température 2',
    temperature_3: 'Température 3',
    temperature_4: 'Température 4',
    temperature_5: 'Température 5',
    temperature_6: 'Température 6',
    humidity: 'Humidité',
    battery: 'Batterie',
    battery_voltage: 'Tension de la pile',
    battery_low: 'Pile faible',
    soil_moisture: 'Humidité du sol',
    illuminance: 'Luminosité',
    pressure: 'Pression',
    co2: 'CO2',
    pm25: 'PM2,5',
    pm10: 'PM10',
    formaldehyde: 'Formaldéhyde',
    motion: 'Mouvement',
    opening: 'Ouverture',
    uv: 'Indice UV',
    wind_speed: 'Vitesse du vent',
    online: 'Passerelle en ligne',
    uptime: 'Temps de fonctionnement',
    devices: 'Appareils entendus',
  },
  de: {
    temperature: 'Temperatur',
    temperature_2: 'Temperatur 2',
    temperature_3: 'Temperatur 3',
    temperature_4: 'Temperatur 4',
    temperature_5: 'Temperatur 5',
    temperature_6: 'Temperatur 6',
    humidity: 'Luftfeuchtigkeit',
    battery: 'Batterie',
    battery_voltage: 'Batteriespannung',
    battery_low: 'Batterie schwach',
    soil_moisture: 'Bodenfeuchte',
    illuminance: 'Helligkeit',
    pressure: 'Luftdruck',
    co2: 'CO2',
    pm25: 'PM2,5',
    pm10: 'PM10',
    formaldehyde: 'Formaldehyd',
    motion: 'Bewegung',
    opening: 'Öffnung',
    uv: 'UV-Index',
    wind_speed: 'Windgeschwindigkeit',
    online: 'Gateway online',
    uptime: 'Laufzeit',
    devices: 'Gehörte Geräte',
  },
  es: {
    temperature: 'Temperatura',
    temperature_2: 'Temperatura 2',
    temperature_3: 'Temperatura 3',
    temperature_4: 'Temperatura 4',
    temperature_5: 'Temperatura 5',
    temperature_6: 'Temperatura 6',
    humidity: 'Humedad',
    battery: 'Batería',
    battery_voltage: 'Tensión de la pila',
    battery_low: 'Pila baja',
    soil_moisture: 'Humedad del suelo',
    illuminance: 'Luminosidad',
    pressure: 'Presión',
    co2: 'CO2',
    pm25: 'PM2,5',
    pm10: 'PM10',
    formaldehyde: 'Formaldehído',
    motion: 'Movimiento',
    opening: 'Apertura',
    uv: 'Índice UV',
    wind_speed: 'Velocidad del viento',
    online: 'Pasarela en línea',
    uptime: 'Tiempo de funcionamiento',
    devices: 'Dispositivos oídos',
  },
};

/** Connection status of the integration page. */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of the MQTT broker your gateways publish to.',
    fr: "Saisissez l'adresse du broker MQTT où publient vos passerelles.",
    de: 'Gib die Adresse des MQTT-Brokers ein, an den deine Gateways senden.',
    es: 'Introduzca la dirección del broker MQTT donde publican sus pasarelas.',
  },
  unreachable: {
    en: 'The MQTT broker does not answer. Check its address and that it accepts this network.',
    fr: "Le broker MQTT ne répond pas. Vérifiez son adresse et qu'il accepte ce réseau.",
    de: 'Der MQTT-Broker antwortet nicht. Prüfe seine Adresse und ob er dieses Netz zulässt.',
    es: 'El broker MQTT no responde. Compruebe su dirección y que acepte esta red.',
  },
  refused: {
    en: 'The MQTT broker refuses the user name or the password.',
    fr: "Le broker MQTT refuse le nom d'utilisateur ou le mot de passe.",
    de: 'Der MQTT-Broker lehnt den Benutzernamen oder das Passwort ab.',
    es: 'El broker MQTT rechaza el nombre de usuario o la contraseña.',
  },
  publishFailed: {
    en: 'The integration could not start. Restart it from its page.',
    fr: "L'intégration n'a pas pu démarrer. Redémarrez-la depuis sa page.",
    de: 'Die Integration konnte nicht starten. Starte sie auf ihrer Seite neu.',
    es: 'La integración no pudo arrancar. Reiníciela desde su página.',
  },
};

/** The check_connection action. */
export const CHECK_TEXT = {
  en: {
    notConfigured: MESSAGES.notConfigured.en,
    unreachable: MESSAGES.unreachable.en,
    refused: MESSAGES.refused.en,
    connecting: 'Connecting to the broker, try again in a few seconds.',
    noGateway: (url) =>
      `Connected to ${url}, but no gateway heard yet: check the topic root and that the gateways use this broker.`,
    ok: (url, gateways, online, devices) =>
      `Connected to ${url}: ${gateways} gateway(s), ${online} online, ${devices} decoded device(s) heard.`,
  },
  fr: {
    notConfigured: MESSAGES.notConfigured.fr,
    unreachable: MESSAGES.unreachable.fr,
    refused: MESSAGES.refused.fr,
    connecting: 'Connexion au broker en cours, réessayez dans quelques secondes.',
    noGateway: (url) =>
      `Connecté à ${url}, mais aucune passerelle entendue : vérifiez la racine des sujets et que les passerelles utilisent ce broker.`,
    ok: (url, gateways, online, devices) =>
      `Connecté à ${url} : ${gateways} passerelle(s), ${online} en ligne, ${devices} appareil(s) décodé(s) entendu(s).`,
  },
  de: {
    notConfigured: MESSAGES.notConfigured.de,
    unreachable: MESSAGES.unreachable.de,
    refused: MESSAGES.refused.de,
    connecting: 'Verbindung zum Broker läuft, versuch es in ein paar Sekunden erneut.',
    noGateway: (url) =>
      `Mit ${url} verbunden, aber noch kein Gateway gehört: Prüfe die Topic-Wurzel und ob die Gateways diesen Broker nutzen.`,
    ok: (url, gateways, online, devices) =>
      `Mit ${url} verbunden: ${gateways} Gateway(s), ${online} online, ${devices} dekodierte(s) Gerät(e) gehört.`,
  },
  es: {
    notConfigured: MESSAGES.notConfigured.es,
    unreachable: MESSAGES.unreachable.es,
    refused: MESSAGES.refused.es,
    connecting: 'Conectando con el broker, inténtelo de nuevo en unos segundos.',
    noGateway: (url) =>
      `Conectado a ${url}, pero ninguna pasarela oída: compruebe la raíz de los temas y que las pasarelas usen este broker.`,
    ok: (url, gateways, online, devices) =>
      `Conectado a ${url}: ${gateways} pasarela(s), ${online} en línea, ${devices} dispositivo(s) decodificado(s) oído(s).`,
  },
};

/** The kinds of button press (BTHome event codes), for the button_pressed trigger. */
export const PRESS_KINDS = { 1: 'single', 2: 'double', 3: 'triple', 4: 'long' };
export const pressKind = (code) => PRESS_KINDS[code] ?? 'other';

/** The check_sensors scene action sentence. */
export const CHECK_SENSORS_TEXT = {
  en: {
    allGood: 'All sensors report and no battery is low.',
    lowBattery: (names) => `Low battery: ${names}.`,
    silent: (names, hours) => `Silent for more than ${hours} h: ${names}.`,
    noSensor: 'No sensor added to Gladys yet.',
  },
  fr: {
    allGood: "Tous les capteurs répondent et aucune pile n'est faible.",
    lowBattery: (names) => `Pile faible : ${names}.`,
    silent: (names, hours) => `Muets depuis plus de ${hours} h : ${names}.`,
    noSensor: 'Aucun capteur ajouté à Gladys pour le moment.',
  },
  de: {
    allGood: 'Alle Sensoren melden sich und keine Batterie ist schwach.',
    lowBattery: (names) => `Batterie schwach: ${names}.`,
    silent: (names, hours) => `Seit mehr als ${hours} h stumm: ${names}.`,
    noSensor: 'Noch kein Sensor zu Gladys hinzugefügt.',
  },
  es: {
    allGood: 'Todos los sensores responden y ninguna pila está baja.',
    lowBattery: (names) => `Pila baja: ${names}.`,
    silent: (names, hours) => `Sin datos desde hace más de ${hours} h: ${names}.`,
    noSensor: 'Aún no hay ningún sensor añadido a Gladys.',
  },
};

/** The last_codes action. */
export const CODES_TEXT = {
  en: {
    none: 'No 433 MHz, infrared or rtl_433 code received since the integration started.',
    intro: 'Last codes:',
  },
  fr: {
    none: "Aucun code 433 MHz, infrarouge ou rtl_433 reçu depuis le démarrage de l'intégration.",
    intro: 'Derniers codes :',
  },
  de: {
    none: 'Seit dem Start der Integration kein 433-MHz-, Infrarot- oder rtl_433-Code empfangen.',
    intro: 'Letzte Codes:',
  },
  es: {
    none: 'Ningún código 433 MHz, infrarrojo o rtl_433 recibido desde el arranque de la integración.',
    intro: 'Últimos códigos:',
  },
};
