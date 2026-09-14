import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';

// radmon.org's per-station `lastreading` endpoint now demands a password, but the combined
// list already carries the current reading and the station's location, so one request
// covers every station rather than one request per station.
const LIST_URL = 'https://radmon.org/radmon.php?function=getcombinedlistjson';

const seen = {};
const history = {};

export function start(channels) {
  setInterval(() => checkRadiation(channels), config.radiation.pollInterval * 1000);
  checkRadiation(channels);
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
    const res = await fetch(LIST_URL);
    if (!res.ok) { console.log(`radmon.org HTTP ${res.status}`); return; }

    const [users, locations, , warnings, alerts, online, , readings, , , lats, lons, , ] = await res.json();

    // Every station in the monitored area is watched, not just the nearest few: a serious
    // release matters wherever it is measured, and it costs no extra requests to see it.
    const stations = users
      .map((user, i) => ({
        user,
        location: locations[i],
        warning: parseFloat(warnings[i]),
        alert:   parseFloat(alerts[i]),
        cpm:     parseFloat(readings[i]),
        lat:     parseFloat(lats[i]),
        lon:     parseFloat(lons[i]),
        online:  online[i] === '1',
      }))
      .filter(s => s.online && !isNaN(s.lat) && !isNaN(s.lon) && !isNaN(s.cpm)
                && utils.isInArea(s.lat, s.lon, config.radiation.monitorArea));

    // Drop history for stations that have gone offline or left the feed.
    const live = new Set(stations.map(s => s.user));
    for (const key of Object.keys(history)) {
      if (!live.has(key)) delete history[key];
    }

    const elevated = [];

    for (const station of stations) {
      const threshold = config.radiation.alertLevel === 'alert' ? station.alert : station.warning;
      if (!Number.isFinite(threshold) || threshold <= 0) continue;

      // Build a rolling window; keep only the last requiredReadings samples.
      const samples = history[station.user] ??= [];
      samples.push(station.cpm);
      if (samples.length > config.radiation.requiredReadings) samples.shift();

      // A full window of consecutive high readings rules out cosmic-ray spikes. Keep
      // collecting even while suppressed, so the picture stays current.
      if (samples.length < config.radiation.requiredReadings) continue;
      if (!samples.every(cpm => cpm >= threshold)) continue;
      if (seen[station.user]) continue;

      elevated.push({ ...station, threshold });
    }

    // Worst first, so if several stations rise together the most extreme one is sent first.
    elevated.sort((a, b) => (b.cpm / b.threshold) - (a.cpm / a.threshold));

    for (const station of elevated) {
      const { distance, heading } = utils.calculateHeadingAndDistance(
        config.meshcore.lat, config.meshcore.lon, station.lat, station.lon
      );
      await sendAlert(
        `☢️ ${station.location} (${Math.round(distance)}km ${config.compasNames[heading]}) ${station.cpm} CPM (>${station.threshold})`,
        channels[config.radiation.channel]
      );
      seen[station.user] = Date.now();
      history[station.user] = []; // reset so next alert needs fresh readings
    }
  } catch (e) {
    console.log('Error checking radiation', e);
  }
}
