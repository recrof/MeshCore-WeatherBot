import * as mqtt from 'mqtt';
import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';
import { geoCodeCached } from './geocoder.mjs';

const seen = {};
let blitzBuffer = [];

export async function start(channels) {
  const client = await mqtt.connectAsync('mqtt://blitzortung.ha.sed.pl:1883');
  const decoder = new TextDecoder();

  client.on('message', (_, data) => {
    const blitzData = JSON.parse(decoder.decode(data));
    if (!utils.isInArea(blitzData.lat, blitzData.lon, config.blitz.monitorArea)) return;
    onBlitz(blitzData);
  });

  await client.subscribeAsync('blitzortung/1.1/#');
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
    counter[blitz.key] = counter[blitz.key]++ ?? 1;
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
