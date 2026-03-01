## Description

Node.js weather and alert bot for [MeshCore](https://meshcore.co.uk) LoRa mesh networks. Connects to a Companion USB or Companion WiFi device and broadcasts alerts to configured channels.

## Features

- **Weather forecast** — daily forecast for multiple regions via [Open-Meteo](https://open-meteo.com)
- **Lightning alerts** — real-time strike detection via [Blitzortung](https://www.blitzortung.org) MQTT
- **Earthquake alerts** — real-time seismic events via [SeismicPortal](https://www.seismicportal.eu)
- **Radiation alerts** — live CPM monitoring for nearby stations via [radmon.org](https://radmon.org)
- **Weather warnings** — official CAP alerts from [meteoalarm.org](https://meteoalarm.org)

All services are independently enable/disable-able and post to configurable MeshCore channels. Missing channels are created automatically on startup. Messages are retried up to 3 times until a nearby repeater confirms relay.

## Requirements

A MeshCore device running **Companion USB** or **Companion WiFi** firmware, connected to the computer running this bot.

## Installation

1. [Install Node.js 22 or higher](https://nodejs.org/en/download/) (most recent LTS recommended)
2. Clone this repo and install dependencies:

```sh
git clone https://github.com/recrof/MeshCore-WeatherBot.git
cd MeshCore-WeatherBot
npm install .
```

## Configuration

Copy or edit `config.mjs`. All settings are documented inline. Key sections:

| Section | Description |
|---|---|
| `meshcore` | Connection type (Serial/TCP), port/host, and your GPS position |
| `forecast` | Channel, send time, and list of regions to forecast |
| `blitz` | Channel and bounding box for lightning monitoring |
| `quake` | Channel, minimum magnitude, and bounding box for earthquake monitoring |
| `radiation` | Channel, CPM alert threshold, bounding box, and poll interval |
| `meteoAlerts` | Channel, feed URL, severity/certainty filters, and monitored regions |
| `send` | Retry count and repeater wait timeout |
| `compasNames` | Compass direction labels (translate to your language) |

### Connection

**Serial (Companion USB):**
```js
type: "Serial",
port: "/dev/ttyUSB0",   // or COMx on Windows, /dev/cu.usbmodem* on macOS
```

**TCP (Companion WiFi):**
```js
type: "TCP",
host: "192.168.0.1:5000",
```

### Channels

Set `channel` in each service section to the MeshCore channel name you want alerts posted on (e.g. `"#alerts"`, `"#weather"`). Channels are created automatically if they do not exist — no need to pre-configure them in the MeshCore client.

## Usage

```sh
node index.mjs
# or override the serial port:
node index.mjs /dev/ttyUSB1
```

## Extras

`radiation-demo.mjs` is a standalone script that shows current radiation levels near a given coordinate:

```sh
node radiation-demo.mjs [lat] [lon]
# example:
node radiation-demo.mjs 48.14 17.11
```

It fetches the 3 nearest online stations from radmon.org and recent historical measurements from [Safecast](https://safecast.org).
