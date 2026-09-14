import { BlitzortungClient } from './blitzortung/index.mjs';
import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';
import { geoCodeCached } from './geocoder.mjs';

const seen = {};
let blitzBuffer = [];

export async function start(channels) {
  const area = config.blitz.monitorArea;
  const client = new BlitzortungClient({
    // The client filters strikes for us, so onBlitz only sees the monitored area.
    bounds: { west: area.minLon, east: area.maxLon, north: area.maxLat, south: area.minLat },
    signals: false,
  });

  client.on('strike', onBlitz);
  client.on('error', err => console.debug('blitzortung error:', err.message));
  // Blitzortung closes every session after 360s, so a first retry is routine; only a
  // growing backoff means the feed is actually failing to come back.
  client.on('reconnecting', ({ server, attempt, delay }) => {
    if (attempt > 1) console.debug(`blitzortung reconnect attempt ${attempt} to ${server} in ${delay}ms`);
  });

  await client.connect();
  console.debug(`blitzortung connected to ${client.server}`);

  setInterval(() => flushBlitzBuffer(channels), config.blitz.timerCollection);
}

function onBlitz(blitzData) {
  const blitz = utils.calculateHeadingAndDistance(
    config.meshcore.lat, config.meshcore.lon, blitzData.lat, blitzData.lon
  );
  blitzBuffer.push({
    key: `${blitz.heading}|${(blitz.distance / 10) | 0}`,
    heading: blitz.heading,
    distance: blitz.distance,
    lat: blitzData.lat,
    lon: blitzData.lon,
  });
}

async function flushBlitzBuffer(channels) {
  const counter = {};
  for (const blitz of blitzBuffer) {
    counter[blitz.key] = (counter[blitz.key] ?? 0) + 1;
  }

  for (const key of Object.keys(counter)) {
    if (counter[key] < 10 || seen[key]) continue;
    const [heading, distance] = key.split('|');
    if (!(heading && distance)) continue;
    const data = blitzBuffer.find(b => b.key === key);
    if (!data) continue;
    const location = await geoCodeCached(key, data.lat, data.lon);
    if (!location) continue;
    await sendAlert(
      `🌩️ ${location} (${distance * 10}km ${config.compasNames[heading]})`,
      channels[config.blitz.channel]
    );
    seen[key] = 1;
  }

  blitzBuffer = [];
}
