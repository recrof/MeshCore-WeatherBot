import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';
import { geoCodeCached } from './geocoder.mjs';

const FEED_URL = 'wss://www.seismicportal.eu/standing_order/websocket';
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 60000;

let attempt = 0;
let timer;

export function start(channels) {
  connect(channels);
}

function connect(channels) {
  let ws;
  try {
    ws = new WebSocket(FEED_URL);
  } catch (e) {
    console.debug('seismicportal connect failed:', e?.message ?? e);
    scheduleReconnect(channels);
    return;
  }

  // Qualifying quakes are rare (well under one a year for a typical monitorArea), so a
  // dropped socket would otherwise go unnoticed for months. Every close is worth logging.
  ws.onopen = () => {
    attempt = 0;
    console.debug('seismicportal connected');
  };

  ws.onmessage = (event) => {
    try {
      onSeismicData(JSON.parse(event.data), channels);
    } catch (e) {
      console.debug('seismicportal: unreadable message:', e?.message ?? e);
    }
  };

  ws.onerror = (event) => {
    console.debug('seismicportal error:', event?.message ?? event?.error?.message ?? 'socket error');
  };

  ws.onclose = (event) => {
    console.debug(`seismicportal disconnected (code ${event?.code ?? '?'})`);
    scheduleReconnect(channels);
  };
}

function scheduleReconnect(channels) {
  // A single close can fire both onerror and onclose; only one retry should come of it.
  if (timer) return;

  attempt += 1;
  const delay = Math.min(RECONNECT_DELAY * 2 ** (attempt - 1), MAX_RECONNECT_DELAY);
  console.debug(`seismicportal reconnect attempt ${attempt} in ${delay}ms`);

  timer = setTimeout(() => {
    timer = undefined;
    connect(channels);
  }, delay);
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
