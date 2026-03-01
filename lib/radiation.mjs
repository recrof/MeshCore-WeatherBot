import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';

const seen = {};
const history = {};

export function start(channels) {
  setInterval(() => checkRadiation(channels), config.radiation.pollInterval * 1000);
  checkRadiation(channels);
}

// Parses radmon.org lastreading plain-text response:
// "15 CPM on 2026-03-01 14:57:45UTC at Sladkovicovo, Galanta, Slovakia"
function parseLastReading(text) {
  const match = text.trim().match(/^([\d.]+)\s+CPM\s+on\s+(.+?UTC)\s+at\s+(.+)$/);
  if (!match) return null;
  return {
    cpm: parseFloat(match[1]),
    timestamp: match[2],
    location: match[3].replace(/<[^>]+>/g, '').trim(),
  };
}

async function checkRadiation(channels) {
  // Expire old suppression entries and reset their history so fresh readings are required
  for (const key of Object.keys(seen)) {
    if (seen[key] < Date.now() - config.radiation.timeout * 60 * 1000) {
      delete seen[key];
      delete history[key];
    }
  }

  try {
    const res = await fetch('https://radmon.org/radmon.php?function=getcombinedlistjson');
    if (!res.ok) { console.log(`radmon.org HTTP ${res.status}`); return; }

    const [usernames, , devices, warnings, alerts, online, , , , , lats, lons] = await res.json();

    const stations = usernames
      .map((user, i) => ({
        user,
        device:  devices[i],
        warning: parseFloat(warnings[i]),
        alert:   parseFloat(alerts[i]),
        lat:     parseFloat(lats[i]),
        lon:     parseFloat(lons[i]),
        online:  online[i] === '1',
      }))
      .filter(s => !isNaN(s.lat) && !isNaN(s.lon) && s.online
                && utils.isInArea(s.lat, s.lon, config.radiation.monitorArea));

    stations.sort((a, b) => {
      const da = utils.calculateHeadingAndDistance(config.meshcore.lat, config.meshcore.lon, a.lat, a.lon).distance;
      const db = utils.calculateHeadingAndDistance(config.meshcore.lat, config.meshcore.lon, b.lat, b.lon).distance;
      return da - db;
    });

    for (const station of stations.slice(0, config.radiation.nearestStations)) {
      if (seen[station.user]) continue;

      const readingRes = await fetch(
        `https://radmon.org/radmon.php?function=lastreading&user=${encodeURIComponent(station.user)}`
      );
      const reading = parseLastReading(await readingRes.text());
      if (!reading) continue;

      // Build rolling history; keep only the last requiredReadings samples
      if (!history[station.user]) history[station.user] = [];
      history[station.user].push(reading.cpm);
      if (history[station.user].length > config.radiation.requiredReadings) {
        history[station.user].shift();
      }

      // Need a full window of consecutive high readings to rule out cosmic-ray spikes
      const stationHistory = history[station.user];
      if (stationHistory.length < config.radiation.requiredReadings) continue;

      const threshold = config.radiation.alertLevel === 'alert' ? station.alert : station.warning;
      if (!stationHistory.every(cpm => cpm >= threshold)) continue;

      const { distance, heading } = utils.calculateHeadingAndDistance(
        config.meshcore.lat, config.meshcore.lon, station.lat, station.lon
      );
      await sendAlert(
        `☢️ ${reading.location} (${Math.round(distance)}km ${config.compasNames[heading]}) ${reading.cpm} CPM`,
        channels[config.radiation.channel]
      );
      seen[station.user] = Date.now();
      history[station.user] = []; // reset so next alert needs fresh readings
    }
  } catch (e) {
    console.log('Error checking radiation', e);
  }
}
