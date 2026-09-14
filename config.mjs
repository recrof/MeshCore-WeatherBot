export default {

  // ── MeshCore companion connection ──────────────────────────────────────────
  meshcore: {
    enabled: true,

    // Serial configuration (Companion USB)
    // type: "Serial",
    // port: "/dev/ttyACM0",  // serial port of the Companion USB device

    /*
      TCP configuration - uncomment if you want to connect to a
      companion wifi instead of companion usb
    */
    type: "TCP",
    host: "192.168.1.226:5555",     // IP address and port of the Companion WiFi device

    // Your position – used to calculate bearing and distance to lightning/quakes
    lat: 48.14,
    lon: 17.11
  },

  // ── Daily weather forecast ─────────────────────────────────────────────────
  forecast: {
    enabled: true,
    channel: "#slovakia",      // MeshCore channel name to post forecasts on
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
      minLat: 47.50,
      minLon: 15.54,
      maxLat: 49.61,
      maxLon: 23.04
    }
  },

  // ── Earthquake alerts (SeismicPortal) ─────────────────────────────────────
  quake: {
    enabled: true,
    channel: "#alerts",             // MeshCore channel name to post earthquake alerts on
    minMag: 3,                    // minimum Richter magnitude to report
    monitorArea: {                // bounding box – only quakes inside this area are reported
      minLat: 47.50,
      minLon: 15.54,
      maxLat: 49.61,
      maxLon: 23.04
    }
  },
  // ── Pohoda festival news (stageocean.com) ─────────────────────────────────
  pohoda: {
    enabled: true,
    channel: "#pohoda",           // MeshCore channel name to post news titles on
    url: "https://api.stageocean.com/v1/news?eventId%5B%5D=019ec6a4-c6d4-8118-0220-dd69f353b51a&eventId%5B%5D=null&organizationId=01983111-427d-2a5f-c41b-bd416cab1d0f&status=published&sortBy=publishedAt&sortOrder=desc&isFeed=true&perPage=15&locale=sk",
    pollInterval: 300             // how often (seconds) to check for new articles
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
    monitorArea: {                // bounding box – every station inside this area is watched
      minLat: 47.50,
      minLon: 15.54,
      maxLat: 49.61,
      maxLon: 23.04
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
    regionAliases: {
      "Banská Bystrica": "BB",
      "Banská Štiavnica": "BS",
      "Bardejov": "BJ",
      "Bánovce nad Bebravou": "BN",
      "Brezno": "BR",
      "Bratislava": "BA",
      "Bytča": "BY",
      "Čadca": "CA",
      "Detva": "DT",
      "Dolný Kubín": "DK",
      "Dunajská Streda": "DS",
      "Galanta": "GA",
      "Gelnica": "GL",
      "Hlohovec": "HC",
      "Humenné": "HE",
      "Ilava": "IL",
      "Kežmarok": "KK",
      "Komárno": "KN",
      "Košice": "KE",
      "Košice-okolie": "KS",
      "Krupina": "KA",
      "Kysucké Nové Mesto": "KM",
      "Levice": "LV",
      "Levoča": "LE",
      "Liptovský Mikuláš": "LM",
      "Lučenec": "LC",
      "Malacky": "MA",
      "Martin": "MT",
      "Medzilaborce": "ML",
      "Michalovce": "MI",
      "Myjava": "MY",
      "Námestovo": "NO",
      "Nitra": "NR",
      "Nové Mesto nad Váhom": "NM",
      "Nové Zámky": "NZ",
      "Partizánske": "PE",
      "Pezinok": "PK",
      "Piešťany": "PN",
      "Poltár": "PT",
      "Poprad": "PP",
      "Považská Bystrica": "PB",
      "Prešov": "PO",
      "Prievidza": "PD",
      "Púchov": "PU",
      "Revúca": "RA",
      "Rimavská Sobota": "RS",
      "Rožňava": "RV",
      "Ružomberok": "RK",
      "Sabinov": "SB",
      "Senec": "SC",
      "Senica": "SE",
      "Skalica": "SI",
      "Snina": "SV",
      "Sobrance": "SO",
      "Spišská Nová Ves": "SN",
      "Stará Ľubovňa": "SL",
      "Stropkov": "SP",
      "Svidník": "SK",
      "Šaľa": "SA",
      "Topoľčany": "TO",
      "Trebišov": "TV",
      "Trenčín": "TN",
      "Trnava": "TT",
      "Turčianske Teplice": "TR",
      "Tvrdošín": "TS",
      "Veľký Krtíš": "VK",
      "Vranov nad Topľou": "VT",
      "Zlaté Moravce": "ZM",
      "Zvolen": "ZV",
      "Žarnovica": "ZC",
      "Žiar nad Hronom": "ZH",
      "Žilina": "ZA"
    },
    regionGroups: {
      "BA-kraj": ["Bratislava", "Malacky", "Pezinok", "Senec"],
      "TT-kraj": ["Dunajská Streda", "Galanta", "Hlohovec", "Piešťany", "Senica", "Skalica", "Trnava"],
      "TN-kraj": ["Bánovce nad Bebravou", "Ilava", "Myjava", "Nové Mesto nad Váhom", "Partizánske", "Považská Bystrica", "Prievidza", "Púchov", "Trenčín"],
      "NR-kraj": ["Komárno", "Levice", "Nitra", "Nové Zámky", "Šaľa", "Topoľčany", "Zlaté Moravce"],
      "ZA-kraj": ["Bytča", "Čadca", "Dolný Kubín", "Kysucké Nové Mesto", "Liptovský Mikuláš", "Martin", "Námestovo", "Ružomberok", "Turčianske Teplice", "Tvrdošín", "Žilina"],
      "BB-kraj": ["Banská Bystrica", "Banská Štiavnica", "Brezno", "Detva", "Krupina", "Lučenec", "Poltár", "Revúca", "Rimavská Sobota", "Veľký Krtíš", "Zvolen", "Žarnovica", "Žiar nad Hronom"],
      "PO-kraj": ["Bardejov", "Humenné", "Kežmarok", "Levoča", "Medzilaborce", "Poprad", "Prešov", "Sabinov", "Snina", "Stará Ľubovňa", "Stropkov", "Svidník", "Vranov nad Topľou"],
      "KE-kraj": ["Gelnica", "Košice", "Košice-okolie", "Michalovce", "Rožňava", "Sobrance", "Spišská Nová Ves", "Trebišov"]
    },
    // Template for the alert message.
    // Available placeholders: {region} {start} {end} {event} {severity} {certainty}
    severityFilter: [             // only warnings with these severity levels are sent
      "severe",
      "extreme",
    ],
    certaintyFilter: [            // only warnings with these certainty levels are sent
      "likely",
      "observed",
    ],
    regions: [                    // list of area names to monitor (must match names in the feed exactly)
      "Bratislava",
      "Malacky",
      "Pezinok",
      "Senec",
      "Dunajská Streda",
      "Galanta",
      "Hlohovec",
      "Piešťany",
      "Senica",
      "Skalica",
      "Trnava",
      "Bánovce nad Bebravou",
      "Ilava",
      "Myjava",
      "Nové Mesto nad Váhom",
      "Partizánske",
      "Považská Bystrica",
      "Prievidza",
      "Púchov",
      "Trenčín",
      "Komárno",
      "Levice",
      "Nitra",
      "Nové Zámky",
      "Šaľa",
      "Topoľčany",
      "Zlaté Moravce",
      "Bytča",
      "Čadca",
      "Dolný Kubín",
      "Kysucké Nové Mesto",
      "Liptovský Mikuláš",
      "Martin",
      "Námestovo",
      "Ružomberok",
      "Turčianske Teplice",
      "Tvrdošín",
      "Žilina",
      "Banská Bystrica",
      "Banská Štiavnica",
      "Brezno",
      "Detva",
      "Krupina",
      "Lučenec",
      "Poltár",
      "Revúca",
      "Rimavská Sobota",
      "Veľký Krtíš",
      "Zvolen",
      "Žarnovica",
      "Žiar nad Hronom",
      "Bardejov",
      "Humenné",
      "Kežmarok",
      "Levoča",
      "Medzilaborce",
      "Poprad",
      "Prešov",
      "Sabinov",
      "Snina",
      "Stará Ľubovňa",
      "Stropkov",
      "Svidník",
      "Vranov nad Topľou",
      "Gelnica",
      "Košice",
      "Michalovce",
      "Rožňava",
      "Sobrance",
      "Spišská Nová Ves",
      "Trebišov"
    ],
    eventMaxChars: 50,
    // Template for the alert message.
    // Available placeholders: {region} {start} {end} {duration} {event} {severity} {certainty}
    messageTemplate: "s: {start}, d: {duration}\n{event}\n{severity}/{certainty}\nR: {region}",

    // If the share of matching regions reaches this percentage of configured `regions`,
    // the regions list is replaced with `regionAllLabel`.
    regionAllThresholdPercent: 80,
    regionAllLabel: "SR",

    // Severity level labels – translate to your language if needed
    severity: {
      unknown:  "?",
      minor:    "🟢 0.",
      moderate: "🟡 1.",
      severe:   "🟠 2.",
      extreme:  "🔴 3."
    },

    // Certainty level labels – translate to your language if needed
    certainty: {
      observed: "100%",    // CAP: occurring or already occurred — not a probability
      likely:   ">50%",
      possible: "<=50%",
      unlikely: "~0%",
      unknown:  "?"
    },

    // Event type labels – translate to your language if needed
    events: {
      wind:            "🌬️",
      snoworice:       "❄️🧊",
      thunderstorm:    "⛈️",
      fog:             "🌫️",
      hightemperature: "🌡️♨️",
      lowtemperature:  "🌡️🧊",
      coastalevent:    "🌊",
      forestfire:      "🔥🌲",
      avalanche:       "Avalanche",
      rain:            "🌧️",
      flood:           "Flood",
      rainflood:       "Rain Flood",
      marinehazard:    "Marine Hazard",
      drought:         "Drought",
      icing:           "🥶"
    }
  }
}
