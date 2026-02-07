## Description
node.js weather bot using meshcore.js and companion-usb

## Requirements
You will need Meshcore device with Companion USB firmware connected to the computer

## Installation
1. [Install Node.js 22 or higher](https://nodejs.org/en/download/)(most recent LTS recommended)
2. Clone this repo & install dependencies via npm
```sh
git clone https://github.com/recrof/MeshCore-WeatherBot.git
cd MeshCore-WeatherBot
npm install .
```

## Usage
1. Connect working MeshCore companion usb into computer you want to run WeatherBot on
2. Edit `config.json`:
```json
{
  "port": "/dev/ttyACM0", // port which is used for companion USB
  "weatherAlarm": "6:00", // time to send daily weather forecast
  "myPosition": { // position that will be used to compute storm proximity alert
    "lat": 48.14, 
    "lon": 17.11
  },
  "channels": { // what channel name should be used weather forecast and alerts
    "alerts": "Public",
    "weather": "Public"
  },
  "timers": { 
    "blitzCollection": 600000, // how often should we aggregate thunder data for evaluation
    "meteoAlerts": 600000, // how often should we download weather altert data
    "meteoAlerts": 600000 // how often should we weather alterts checked
  },
  "blitzArea": { // thunder reporting area. if there is storm detected inside, report it
    "minLat": 47.51,
    "minLon": 15.54,
    "maxLat": 48.76,
    "maxLon": 18.62
  },
  "compasNames": { // compass direction names in your local language
    "N": "North",
    "NE": "North-East",
    "E": "East",
    "SE": "South-East",
    "S": "South",
    "SW": "South-West",
    "W": "West",
    "NW": "North-West"
  },
  "meteoAlerts": { // meteo alarm config sections
    "enabled": true, // enables or disables meteo alarm 
    "timeout": 60, // how long should the warning be muted after sending, in minutes
    "severityFilter": ["severe", "extreme"], // severity levels which will be send 
    "certaintyFilter": ["likely", "observed"], // certainty levels which will be send 
    "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovakia", // atom feed with warnings
    "regions": [
      "Bratislava" // list of monitored regions/ areas
    ],
    "severity": { // severity translations
      "unknown": "Unknown",
      "minor": "Minor",
      "moderate": "Moderate",
      "severe": "Severe",
      "extreme ": "Extreme"
    },
    "certainty": { // ceverity translations
      "observed": "Observed",
      "likely": "Likely (> 50%)",
      "possible": "Possible (<= 50%)",
      "unlikely": "Unlikely (~ 0%)",
      "unknown": "Unknown"
    }
  }
}
```
3. then run:
```
node index.mjs
```

**Note:**
This weather bot is currently hardcoded to use weather data from shmu.sk for Bratislava region.
If this does not apply to your region, you will need to implement your own functions to retrieve weater forecasts.
