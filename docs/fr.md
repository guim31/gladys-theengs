# Theengs / OpenMQTTGateway

Les capteurs Bluetooth (BLE) décodés par une passerelle **OpenMQTTGateway** (ESP32) ou **Theengs
Gateway** (Raspberry Pi, module complémentaire Home Assistant, Docker), et avec un module radio les
capteurs 433 MHz décodés par **rtl_433**, lus sur votre broker MQTT. La passerelle s'occupe du
Bluetooth et de la radio : Gladys lit seulement ce qu'elle publie.

> Développée sans le matériel : vos retours sont les bienvenus. Les messages utilisés dans les tests
> suivent le format exact des deux passerelles, mais aucune vraie passerelle n'a été branchée.

## Ce que vous obtenez

- **Capteurs** : un appareil par capteur décodé que vous ajoutez, avec ce que rapporte le décodeur :
  température, humidité, batterie, pile faible, humidité du sol, luminosité, pression, CO2, PM2,5,
  PM10, formaldéhyde, mouvement, ouverture (détecteurs de porte et de fenêtre), sondes des
  thermomètres de cuisson. Xiaomi (LYWSD03MMC, firmware d'origine ou ATC / PVVX), SwitchBot, Inkbird,
  Govee, Qingping, Shelly BLU, BTHome, ThermoBeacon et plus de 150 autres modèles de Theengs Decoder.
- **Capteurs 433 MHz** décodés par rtl_433 (stations météo Oregon Scientific, Acurite, LaCrosse,
  Fine Offset…) : température, humidité, pile faible, pression, vent, luminosité, UV, contacts.
- **Passerelles** : en ligne ou non, temps de fonctionnement (OpenMQTTGateway), nombre d'appareils
  entendus.
- **Scènes** : un déclencheur pour les boutons Bluetooth, un déclencheur pour les codes 433 MHz,
  infrarouges et de télécommandes rtl_433, une action pour vérifier piles et capteurs muets.
- **Tableau de bord** : le widget Capteurs Theengs.

## Avant de commencer

- Une passerelle qui publie sur un broker MQTT :
  - **OpenMQTTGateway** v1.x sur un ESP32, avec le module BLE (et RTL_433, RF ou IR si votre carte
    les a) ;
  - ou **Theengs Gateway** avec ses sujets par défaut (`home/TheengsGateway/BTtoMQTT`).
- L'adresse du broker, et un nom d'utilisateur et un mot de passe s'il en demande. Le broker installé
  par Gladys (intégration MQTT) convient.
- Les capteurs chiffrés (Xiaomi avec clé de liaison, Shelly BLU chiffré, BTHome chiffré) ne sont
  décodés que si vous avez donné la clé à la passerelle.

## Configuration

| Champ                           | Rôle                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Adresse du broker               | `mqtt://` (1883) ou `mqtts://` (8883), par ex. `mqtt://192.168.1.10:1883`.                  |
| Nom d'utilisateur, mot de passe | Vides pour un broker anonyme.                                                               |
| Certificat auto-signé           | `mqtts://` seulement.                                                                       |
| Racine des sujets               | `home` : la partie avant le nom de la passerelle dans `home/OpenMQTTGateway/BTtoMQTT`.      |
| Proposer les capteurs 433 MHz   | Décochez pour masquer tous les capteurs rtl_433 de la Découverte (ceux des voisins…).       |
| Langue des textes               | Noms des fonctionnalités à l'ajout d'un appareil, phrases des scènes, messages des actions. |

Deux boutons sur la page de l'intégration : **Vérifier la connexion** (broker, passerelles et
appareils entendus) et **Afficher les derniers codes** (les derniers codes 433 MHz, infrarouges et
rtl_433, à recopier dans une scène).

L'intégration s'abonne seulement aux sujets des passerelles (`BTtoMQTT`, `RTL_433toMQTT`,
`433toMQTT`, `IRtoMQTT`, `LWT`, `SYStoMQTT`) : elle ne publie jamais rien.

## Appareils

Ouvrez l'onglet **Découverte** de l'intégration : il liste les passerelles, et les capteurs entendus
dans les 10 dernières minutes que le décodeur a reconnus et qui rapportent au moins une valeur.
Ajoutez ceux que vous voulez ; donnez-leur un nom et une pièce comme à tout appareil.

- Un capteur Bluetooth est identifié par son adresse MAC, un capteur rtl_433 par son modèle, son
  canal et son identifiant. Beaucoup de capteurs 433 MHz bon marché tirent un nouvel identifiant au
  changement de pile : ajoutez alors le nouvel appareil.
- Écartés exprès : les annonces non décodées, les téléphones, montres et autres appareils à adresse
  aléatoire (Apple, Microsoft, balises de notification d'exposition). Pour la présence pièce par
  pièce, voyez l'intégration ESPresense.
- Un capteur qui rapporte plus tard une nouvelle valeur (la sonde d'un thermomètre branchée…) est
  reproposé avec **Mettre à jour** dans la Découverte.
- Les mesures partent vers Gladys toutes les 30 secondes quand elles changent ; une porte, un
  mouvement ou une pile faible, tout de suite.
- Un SwitchBot Blind Tilt n'a que sa batterie : son `open` est une position, pas une porte.

## Passerelles

Un appareil passerelle indique si la passerelle est en ligne (son dernier message MQTT, `LWT`),
combien d'appareils décodés elle a entendus dans les 10 dernières minutes et, pour OpenMQTTGateway,
son temps de fonctionnement (`SYStoMQTT`). Plusieurs passerelles peuvent entendre le même capteur :
les mesures sont les mêmes, les appuis de bouton et les codes ne comptent qu'une fois.

## Scènes

- **Bouton Bluetooth appuyé** (déclencheur) : un bouton Bluetooth ajouté à Gladys (Shelly BLU
  Button, télécommande BTHome…). Filtres : le bouton, l'appui (simple, double, triple, long), le
  numéro du bouton sur une télécommande à quatre boutons. Variables : nom, appui, numéro, code de
  l'événement.
- **Code reçu** (déclencheur) : une passerelle a reçu un code 433 MHz (sonnette, télécommande,
  détecteur), un code infrarouge, ou une télécommande décodée par rtl_433. Filtres : le code, son
  type, la passerelle. Appuyez sur la télécommande, puis **Afficher les derniers codes** sur la page
  de l'intégration donne le code à recopier. Un code répété en moins de 1,5 seconde compte une fois.
- **Vérifier les capteurs** (action) : les capteurs ajoutés à Gladys dont la pile est faible (sous
  20 % sauf autre choix) et ceux qu'aucune passerelle n'a entendus depuis plus de 2 heures (sauf
  autre choix), en une phrase prête pour un message, avec les deux nombres. Exemple : chaque
  dimanche, envoyer la phrase quand un nombre dépasse 0.

## Tableau de bord

Le widget **Capteurs Theengs** liste les capteurs et passerelles ajoutés à Gladys, ceux à surveiller
en tête : passerelle hors ligne, capteur muet depuis 2 heures, pile faible. Réglages : afficher les
passerelles, afficher le niveau des piles.

## Limites

- Lecture seule : aucune commande n'est envoyée aux appareils, et l'envoi de codes 433 MHz ou
  infrarouges n'est pas pris en charge.
- Les annonces non décodées et les appareils à adresse aléatoire sont ignorés.
- Recouvrements : Gladys lit le Bluetooth elle-même avec l'intégration Bluetooth (sur la machine de
  Gladys) ; le 433 MHz avec les intégrations RFlink et RFPlayer ; et l'intégration MQTT peut lire
  n'importe quel sujet à la main. Cette intégration sert aux capteurs qu'une passerelle Theengs ou
  OpenMQTTGateway décode déjà.
- La durée de silence d'un capteur compte au pire depuis le démarrage de l'intégration.

## Dépannage

- **Vérifier la connexion** ne voit aucune passerelle : vérifiez la racine des sujets (la première
  partie des sujets, `home` par défaut) et que la passerelle utilise le même broker
  (`mosquitto_sub -v -t 'home/#'`).
- Un capteur manque dans la Découverte : il doit être décodé par la passerelle (`model_id` dans son
  message) et entendu dans les 10 dernières minutes. Les capteurs chiffrés demandent leur clé dans la
  passerelle.
- Journaux détaillés : `LOG_LEVEL=debug` sur le conteneur.
