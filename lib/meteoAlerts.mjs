import Parser from 'rss-parser';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';

const timeDateOptionsShort = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};

const seen = {};

export function start(channels) {
  setInterval(() => checkMeteoAlerts(channels), config.meteoAlerts.pollInterval * 1000);
  checkMeteoAlerts(channels);
}

async function checkMeteoAlerts(channels) {
  for (const key of Object.keys(seen)) {
    if (seen[key] < Date.now() - config.meteoAlerts.timeout * 60 * 1000) {
      delete seen[key];
    }
  }

  const parser = new Parser({
    headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9' },
    xml2jsOptions: { explicitArray: false },
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

  const warnings = [];
  const feed = await parser.parseURL(config.meteoAlerts.url);
  if (feed.items && feed.items.length > 0) {
    for (const item of feed.items) {
      if (!config.meteoAlerts.regions.includes(item.area)) continue;
      if (new Date(item.end) < Date.now()) continue;
      if (seen[item.identifier]
        || !config.meteoAlerts.certaintyFilter.includes(item.certainty.toLowerCase())
        || !config.meteoAlerts.severityFilter.includes(item.severity.toLowerCase()))
        continue;

      warnings.push({
        id: item.identifier,
        region: item.area,
        certainty: item.certainty.toLowerCase(),
        severity: item.severity.toLowerCase(),
        event: parseEvent(item.event),
        start: item.start,
        end: item.end
      });
    }
  }

  const sorted = warnings.sort((a, b) => new Date(a.start) - new Date(b.start));
  for (const item of sorted) {
    const message = interpolate(config.meteoAlerts.messageTemplate, {
      region: item.region,
      start: formatDate(item.start),
      end: formatDate(item.end),
      event: config.meteoAlerts.events[item.event] ?? item.event,
      severity: config.meteoAlerts.severity[item.severity],
      certainty: config.meteoAlerts.certainty[item.certainty]
    });
    await sendAlert(message, channels[config.meteoAlerts.channel]);
    seen[item.id] = Date.now();
  }
}

function interpolate(str, data) {
  return str.replace(/\{([^}]+)\}/g, (_, key) => data[key] ?? '');
}

function parseEvent(event) {
  const start = event.indexOf(' ');
  const end = event.lastIndexOf(' ');
  return event.substring(start + 1, end).trim().toLowerCase().replace('-', '');
}

function formatDate(date) {
  return new Date(date).toLocaleString('sk-SK', timeDateOptionsShort);
}
