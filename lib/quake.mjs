import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';
import { geoCodeCached } from './geocoder.mjs';

export function start(channels) {
  const ws = new WebSocket('wss://www.seismicportal.eu/standing_order/websocket');
  ws.onmessage = (event) => {
    onSeismicData(JSON.parse(event.data), channels);
  };
}

async function onSeismicData(payload, channels) {
  try {
    if (payload.action !== 'create' || payload.data.type !== 'Feature') return;
    const { mag, lat, lon } = payload.data.properties;
    if (mag < config.quake.minMag) return;
    if (!utils.isInArea(lat, lon, config.quake.monitorArea)) return;
    const { distance, heading } = utils.calculateHeadingAndDistance(
      config.meshcore.lat, config.meshcore.lon, lat, lon
    );
    const location = await geoCodeCached(payload.data.id, lat, lon);
    await sendAlert(
      `🌍 quake: mag:M${mag} ${location} (${Math.round(distance)}km ${config.compasNames[heading]})`,
      channels[config.quake.channel]
    );
  } catch (e) {
    console.log('Error handling seismic data', e);
  }
}
