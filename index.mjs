import { Constants, NodeJSSerialConnection } from "@liamcottle/meshcore.js";
import { DOMParser } from 'linkedom';
import * as mqtt from 'mqtt';
import * as utils from './utils.mjs';
import config from './config.json' with { type: 'json' };
import Parser from 'rss-parser';

const optionsShort = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};

const port = process.argv[2] ?? config.port;

const channels = {
  alerts: null,
  weather: null
};

const seen = {
  blitz: {},
  warnings: {},
};

let geoCache = {};

let blitzBuffer = [];

let meteoAlerts = []

console.log(`Connecting to ${port}`);
const connection = new NodeJSSerialConnection(port);

connection.on('connected', async () => {
  console.log(`Connected to ${port}`);

  for (const [channelType, channel] of Object.entries(config.channels)) {
    channels[channelType] = await connection.findChannelByName(channel);
    if (!channels[channelType]) {
      console.log(`Channel ${channelType}: "${channel}" not found!`);
      connection.close();
      return;
    }
  }

  await registerBlitzortungMqtt(blitzHandler, config.blitzArea);
  utils.setAlarm(config.weatherAlarm, sendWeather);
  setInterval(blitzWarning, config.timers.blitzCollection);

  if (config.meteoAlerts.enabled) {
    setInterval(checkMeteoAlerts, config.timers.meteoAlerts);
    checkMeteoAlerts();
  }

  console.log('weatherBot ready.');
});

// listen for new messages
connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
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

async function checkMeteoAlerts() {
  Object.keys(meteoAlerts).forEach(key => {
    if (meteoAlerts[key] < Date.now() - (config.meteoAlerts.timeout * 60 * 1000)) {
      delete meteoAlerts[key];
    }
  });

  let parser = new Parser({
    headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9' },
    xml2jsOptions: {
      explicitArray: false,
    },
    customFields: {
      item: [
        ['cap:areaDesc', 'area'],
        ['cap:event', 'event'],
        ['cap:certainty', 'certainty'],
        ['cap:severity', 'severity'],
        ['cap:expires', 'end'],
        ['cap:identifier', 'identifier'],
        ['cap:onset', 'start']
      ]
    }
  });
  let warnigs = [];
  const feed = await parser.parseURL(config.meteoAlerts.url);
  if (feed.items && feed.items.length > 0) {
    feed.items.forEach((item) => {
      if (config.meteoAlerts.regions.includes(item.area)) {
        const endTime = new Date(item.end);

        if (endTime < Date.now()) 
          return;

        if (meteoAlerts[item.identifier] 
          || !config.meteoAlerts.certaintyFilter.includes(item.certainty.toLowerCase()) 
          || !config.meteoAlerts.severityFilter.includes(item.severity.toLowerCase()))
          return;

        warnigs.push({
          id: item.identifier,
          region: item.area,
          certainty: item.certainty.toLowerCase(),
          severity: item.severity.toLowerCase(),
          event: parseEvent(item.event),
          start: item.start,
          end: item.end
        });
      }
    });
  }

  if (warnigs.length > 0) {
    const sorted = warnigs.sort((a, b) => new Date(a.start) - new Date(b.start));
    sorted.forEach(item => {
      const message = interpolate(config.meteoAlerts.messageTemplate, {
        region: item.region,
        start: formatDate(item.start),
        end: formatDate(item.end),
        event: config.meteoAlerts.events[item.event] ?? item.event,
        severity: config.meteoAlerts.severity[item.severity],
        certainty: config.meteoAlerts.certainty[item.certainty]
      });
      sendAlert(message, channels.weather);
      meteoAlerts[item.id] = Date.now();
      utils.sleep(30 * 1000);
    });
  }
}

function interpolate(str, data) {
  return str.replace(/\{([^}]+)\}/g, (_, key) => {
    return data[key] ?? "";
  });
}

function parseEvent(event) {
  const start = event.indexOf(' ');
  const end = event.lastIndexOf(' ');
  return event.substring(start + 1, end).trim().toLowerCase().replace('-', '');
}

function formatDate(date) {
  const dt = new Date(date);
  return dt.toLocaleString("sk-SK", optionsShort)
}

async function onContactMessageReceived(message) {
  console.log('Received contact message', message);
}

async function onChannelMessageReceived(message) {
  console.log(`Received channel message`, message);
}

async function sendWeather(date) {
  const chunks = utils.splitStringToByteChunks(await getWeather(), 130);
  if (chunks.length === 0) return;

  for (const message of chunks) {
    await sendAlert(message, channels.weather);
  }
}

async function getWeather() {
  let weather = '';

  try {
    const res = await fetch('https://www.shmu.sk/sk/?page=1&id=meteo_tpredpoved_ba');
    const html = await res.text();
    console.debug(`downloaded ${html.length} bytes from shmu.sk`);

    const document = new DOMParser().parseFromString(html, 'text/html');
    const weatherEl = document.querySelector('.mp-section');
    const weatherBits = Array.from(weatherEl.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).filter(t => /\w/.test(t));

    weatherBits.push(
      ...Array.from(weatherEl.querySelectorAll('p')).map(e => e.textContent).filter(t => !/^Formul|Rozhovor/.test(t))
    );

    weather = utils.trimAndNormalize(weatherBits.join(' '));
  }
  catch (e) {
    console.error(e)
  }

  return weather;
}

async function registerBlitzortungMqtt(blitzCallback, blitzArea) {
  const client = await mqtt.connectAsync('mqtt://blitzortung.ha.sed.pl:1883');
  const decoder = new TextDecoder();

  client.on('message', (_, data) => {
    const json = decoder.decode(data);
    const blitzData = JSON.parse(json);
    if (blitzData.lat < blitzArea.minLat || blitzData.lon < blitzArea.minLon ||
      blitzData.lat > blitzArea.maxLat || blitzData.lon > blitzArea.maxLon) { return }
    blitzCallback(blitzData);
  });

  await client.subscribeAsync('blitzortung/1.1/#');
}

function blitzHandler(blitzData) {
  const blitz = utils.calculateHeadingAndDistance(config.myPosition.lat, config.myPosition.lon, blitzData.lat, blitzData.lon);

  blitzBuffer.push({
    key: `${blitz.heading}|${(blitz.distance / 10) | 0}`,
    heading: blitz.heading,
    distance: blitz.distance,
    lat: blitzData.lat,
    lon: blitzData.lon
  });
}

async function sendAlert(message, channel) {
  await connection.sendChannelTextMessage(
    channel.channelIdx,
    utils.shortenToBytes(message, 155)
  );
  console.log(`Sent out [${channel.name}]: ${message}`);
  await utils.sleep(30 * 1000);
}

async function geoCodeChached(key, lat, lon) {
  if (geoCache[key]) return geoCache[key];
  const location = await utils.geoCode(lat, lon);
  if (location) geoCache[key] = location;
  return location;
}

async function blitzWarning() {
  const counter = {};

  for (const blitz of blitzBuffer) {
    counter[blitz.key] = counter[blitz.key]++ ?? 1;
  }

  for (const key of Object.keys(counter)) {
    if (counter[key] < 10 || seen.blitz[key]) continue;
    const [heading, distance] = key.split('|');
    if (!(heading && distance)) continue;
    var data = blitzBuffer.find(b => b.key == key);
    if (!data) continue;
    const location = await geoCodeChached(key, data.lat, data.lon);
    if (!location) continue;
    await sendAlert(`🌩️ ${location} (${distance * 10}km ${config.compasNames[heading]})`, channels.alerts);
    seen.blitz[key] = 1;
  }

  blitzBuffer = [];
}

await connection.connect();
