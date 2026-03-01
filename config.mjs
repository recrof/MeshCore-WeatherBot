export default {

  // ── MeshCore companion connection ──────────────────────────────────────────
  meshcore: {
    enabled: true,

    // Serial configuration (Companion USB)
    type: "Serial",
    port: "/dev/cu.usbmodem1101",  // serial port of the Companion USB device

    /*
      TCP configuration - uncomment if you want to connect to a
      companion wifi instead of companion usb
    */
    // type: "TCP",
    // host: "192.168.0.1:5000",     // IP address and port of the Companion WiFi device

    // Your position – used to calculate bearing and distance to lightning/quakes
    lat: 48.14,
    lon: 17.11
  },

  // ── Daily weather forecast ─────────────────────────────────────────────────
  forecast: {
    enabled: true,
    channel: "#weather",             // MeshCore channel name to post forecasts on
    alarm: "*",                // time of day to send the forecast (HH:MM), use "*" to send immediately on start
    regions: [
      // List of locations to include in the daily forecast.
      // Each region is fetched from Open-Meteo and sent as a separate message.
      { name: "BA", lat: 48.15, lon: 17.11 },
      { name: "KE", lat: 48.72, lon: 21.26 },
      { name: "BB", lat: 48.73, lon: 19.15 },
    ]
  },

  // ── Lightning alerts (Blitzortung) ─────────────────────────────────────────
  blitz: {
    enabled: true,
    channel: "#alerts",             // MeshCore channel name to post lightning alerts on
    timerCollection: 600000,      // how often (ms) to evaluate collected lightning data and send alerts
    monitorArea: {                // bounding box – only lightning inside this area is tracked
      minLat: 47.51,
      minLon: 15.54,
      maxLat: 48.76,
      maxLon: 18.62
    }
  },

  // ── Earthquake alerts (SeismicPortal) ─────────────────────────────────────
  quake: {
    enabled: true,
    channel: "#alerts",             // MeshCore channel name to post earthquake alerts on
    minMag: 3,                    // minimum Richter magnitude to report
    monitorArea: {                // bounding box – only quakes inside this area are reported
      minLat: 47.51,
      minLon: 15.54,
      maxLat: 48.76,
      maxLon: 18.62
    }
  },

  // ── Message sending behaviour ──────────────────────────────────────────────
  send: {
    repeatWaitMs: 15000,          // how long (ms) to wait for a nearby repeater to relay the message
    maxRetries: 3                 // how many times to retry sending if no repeater relay is detected
  },

  // ── Compass direction labels ───────────────────────────────────────────────
  // Used in lightning and earthquake alert messages. Translate to your language if needed.
  compasNames: {
    N:  "North",
    NE: "North-East",
    E:  "East",
    SE: "South-East",
    S:  "South",
    SW: "South-West",
    W:  "West",
    NW: "North-West"
  },

  // ── Radiation alerts (radmon.org) ─────────────────────────────────────────
  radiation: {
    enabled: true,
    channel: "#alerts",             // MeshCore channel name to post radiation alerts on
    pollInterval: 300,            // how often (seconds) to poll for new readings
    alertLevel: "warning",        // station threshold to trigger on: "warning" or "alert"
    nearestStations: 3,           // number of nearest stations to monitor
    monitorArea: {                // bounding box – only stations inside this area are checked
      minLat: 47.51,
      minLon: 15.54,
      maxLat: 48.76,
      maxLon: 18.62
    },
    requiredReadings: 4,          // consecutive readings above threshold before alerting (filters cosmic-ray spikes)
    timeout: 60                   // minutes before re-alerting the same station
  },

  // ── Meteo alarm weather warnings (meteoalarm.org) ─────────────────────────
  meteoAlerts: {
    enabled: true,
    channel: "#alerts",             // MeshCore channel name to post weather warnings on
    url: "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovakia", // Atom feed URL – change to your country
    pollInterval: 60,             // how often (seconds) to check the feed for new warnings
    timeout: 180,                 // how long (minutes) to suppress re-sending the same warning
    severityFilter: [             // only warnings with these severity levels are sent
      "severe",
      "extreme"
    ],
    certaintyFilter: [            // only warnings with these certainty levels are sent
      "likely",
      "observed"
    ],
    regions: [                    // list of area names to monitor (must match names in the feed exactly)
      "Bratislava"
    ],
    // Template for the alert message.
    // Available placeholders: {region} {start} {end} {event} {severity} {certainty}
    messageTemplate: "{region} {start} - {end}\n{event}\nSeverity: {severity}, Certainty: {certainty}",

    // Severity level labels – translate to your language if needed
    severity: {
      unknown:  "Unknown",
      minor:    "Minor",
      moderate: "Moderate",
      severe:   "Severe",
      extreme:  "Extreme"
    },

    // Certainty level labels – translate to your language if needed
    certainty: {
      observed: "Observed",
      likely:   "Likely (> 50%)",
      possible: "Possible (<= 50%)",
      unlikely: "Unlikely (~ 0%)",
      unknown:  "Unknown"
    },

    // Event type labels – translate to your language if needed
    events: {
      wind:            "Wind",
      snoworice:       "Snow or Ice",
      thunderstorm:    "Thunderstorm",
      fog:             "Fog",
      hightemperature: "High Temperature",
      lowtemperature:  "Low Temperature",
      coastalevent:    "Coastal Event",
      forestfire:      "Forest Fire",
      avalanche:       "Avalanche",
      rain:            "Rain",
      flood:           "Flood",
      rainflood:       "Rain Flood",
      marinehazard:    "Marine Hazard",
      drought:         "Drought",
      icing:           "Icing"
    }
  }
}
