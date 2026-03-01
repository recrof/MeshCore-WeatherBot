import { Constants, NodeJSSerialConnection, TCPConnection } from '@liamcottle/meshcore.js';
import { getTodaysForecast } from './lib/forecast.mjs';
import * as utils from './lib/utils.mjs';
import config from './config.mjs';
import { init as initMessenger, sendAlert } from './lib/messenger.mjs';
import { start as startBlitz } from './lib/blitz.mjs';
import { start as startQuake } from './lib/quake.mjs';
import { start as startRadiation } from './lib/radiation.mjs';
import { start as startMeteoAlerts } from './lib/meteoAlerts.mjs';

// Prefix all console output with ISO timestamp
for (const level of ['log', 'debug', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => orig(`[${new Date().toLocaleString('sv-SE', { hour12: false })}]`, ...args);
}

const port = process.argv[2] ?? config.meshcore.port;

const channels = {};

let meshcore;
if (config.meshcore.type === 'TCP') {
  console.log(`Connecting to Companion on TCP '${config.meshcore.host}'`);
  meshcore = new TCPConnection(config.meshcore.host);
} else if (config.meshcore.type === 'Serial') {
  console.log(`Connecting to Companion USB on '${port}'`);
  meshcore = new NodeJSSerialConnection(port);
}

initMessenger(meshcore);

meshcore.on('connected', async () => {
  console.log(`Connected to ${port}`);

  const channelNames = new Set(
    ['forecast', 'blitz', 'quake', 'meteoAlerts', 'radiation']
      .flatMap(key => config[key].enabled ? [config[key].channel] : [])
  );

  for (const name of channelNames) {
    channels[name] = await meshcore.findChannelByName(name);
    if (!channels[name]) {
      console.log(`Channel "${name}" not found, creating...`);
      channels[name] = await createChannel(name);
    }
    console.log(`Channel "${name}" ready at index ${channels[name].channelIdx}.`);
  }

  if (config.blitz.enabled) {
    console.debug('enabling blitzortung handler');
    await startBlitz(channels);
  }

  if (config.quake.enabled) {
    console.debug('enabling seismic portal handler');
    startQuake(channels);
  }

  if (config.forecast.enabled) {
    console.debug('enabling weather alarm');
    utils.setAlarm(config.forecast.alarm, sendWeather);
  }

  if (config.meteoAlerts.enabled) {
    console.debug('enabling meteo alerts');
    startMeteoAlerts(channels);
  }

  if (config.radiation.enabled) {
    console.debug('enabling radiation monitor');
    startRadiation(channels);
  }

  console.log('weatherBot ready.');
});

// Listen for incoming messages
meshcore.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await meshcore.getWaitingMessages();
    for (const message of waitingMessages) {
      if (message.contactMessage) {
        await onContactMessageReceived(message.contactMessage);
      } else if (message.channelMessage) {
        await onChannelMessageReceived(message.channelMessage);
      }
    }
  } catch (e) {
    console.log(e);
  }
});

async function onContactMessageReceived(message) {
  console.log('Received contact message', message);
}

async function onChannelMessageReceived(message) {
  console.log('Received channel message', message);
}

async function sendWeather() {
  for (const region of config.forecast.regions) {
    const { text } = await getTodaysForecast({ latitude: region.lat, longitude: region.lon, name: region.name });
    const chunks = utils.splitStringToByteChunks(text, 130);
    if (chunks.length === 0) continue;
    for (const message of chunks) {
      await sendAlert(message, channels[config.forecast.channel]);
    }
  }
}

async function createChannel(name) {
  const allChannels = await meshcore.getChannels();
  // Reuse first deleted (empty-name) slot, otherwise append after last channel
  let idx = allChannels.length;
  for (let i = 0; i < allChannels.length; i++) {
    if (!allChannels[i].name) {
      idx = i;
      break;
    }
  }
  const nameBytes = new TextEncoder().encode(name);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', nameBytes);
  const secret = new Uint8Array(hashBuffer).slice(0, 16);
  await meshcore.setChannel(idx, name, secret);
  console.log(`Created channel "${name}" at index ${idx}.`);
  return { channelIdx: idx, name, secret };
}

await meshcore.connect();
