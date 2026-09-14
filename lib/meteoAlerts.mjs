import Parser from 'rss-parser';
import fs from 'node:fs/promises';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';

const timeDateOptionsShort = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
};

// Warnings we have already sent, as key -> expiry timestamp (ms). Kept on disk because the
// service restarts often enough that an in-memory set would re-announce every live warning.
const STATE_FILE = new URL('../.state/meteoAlerts.json', import.meta.url);
let seen = {};

// A send can occupy the radio for well over a minute, so a slow round of alerts must not
// overlap with the next poll and announce the same warning twice.
let running = false;

export async function start(channels) {
  await loadState();
  setInterval(() => checkMeteoAlerts(channels), config.meteoAlerts.pollInterval * 1000);
  await checkMeteoAlerts(channels);
}

async function loadState() {
  try {
    seen = JSON.parse(await fs.readFile(STATE_FILE, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.debug('meteoAlerts: unreadable state, starting empty:', e.message);
    seen = {};
  }
}

async function saveState() {
  try {
    await fs.mkdir(new URL('.', STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(seen));
  } catch (e) {
    console.debug('meteoAlerts: could not persist state:', e.message);
  }
}

async function checkMeteoAlerts(channels) {
  if (running) return;
  running = true;

  try {
    const now = Date.now();
    let changed = false;

    // A warning is remembered until it expires, not for a fixed window, so it is announced
    // once for its whole lifetime however many times we poll or restart in the meantime.
    for (const [key, expires] of Object.entries(seen)) {
      if (expires < now) {
        delete seen[key];
        changed = true;
      }
    }

    for (const group of await fetchWarnings()) {
      const regions = [...new Set(group.regions)].sort();

      // Keyed on what the warning says rather than on the feed's identifier: meteoalarm
      // re-issues warnings with a bumped id suffix (..._KN_U2), but a real change - a
      // longer window, a worse severity, another region - still yields a new key.
      const key = [group.event, group.severity, group.certainty, group.start, group.end, regions.join(',')].join('|');
      if (seen[key]) continue;

      const message = interpolate(config.meteoAlerts.messageTemplate, {
        region: formatRegions(regions),
        start: formatDate(group.start),
        end: formatDate(group.end),
        duration: formatDuration(group.start, group.end),
        event: formatEvent(group.event),
        severity: config.meteoAlerts.severity[group.severity] ?? group.severity,
        certainty: config.meteoAlerts.certainty[group.certainty] ?? group.certainty
      });

      await sendAlert(message, channels[config.meteoAlerts.channel]);
      seen[key] = new Date(group.end).getTime() || now + config.meteoAlerts.timeout * 60 * 1000;
      changed = true;
    }

    if (changed) await saveState();
  } catch (e) {
    console.debug('meteoAlerts: check failed:', e?.message ?? e);
  } finally {
    running = false;
  }
}

/**
 * Fetches the feed and folds it into one entry per weather situation.
 *
 * The feed carries a separate item per region, which is what used to produce a burst of
 * near-identical messages; items that differ only by region become a single group.
 */
async function fetchWarnings() {
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

  const feed = await parser.parseURL(config.meteoAlerts.url);
  const groups = new Map();

  for (const item of feed.items ?? []) {
    if (!config.meteoAlerts.regions.includes(item.area)) continue;
    if (new Date(item.end) < Date.now()) continue;
    if (!config.meteoAlerts.certaintyFilter.includes(item.certainty.toLowerCase())
      || !config.meteoAlerts.severityFilter.includes(item.severity.toLowerCase())) continue;

    const warning = {
      event: parseEvent(item.event),
      severity: item.severity.toLowerCase(),
      certainty: item.certainty.toLowerCase(),
      start: item.start,
      end: item.end
    };

    const key = [warning.event, warning.severity, warning.certainty, warning.start, warning.end].join('|');
    if (!groups.has(key)) groups.set(key, { ...warning, regions: [] });
    groups.get(key).regions.push(item.area);
  }

  return [...groups.values()].sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Renders the affected regions as compactly as the config allows: a single label when most
 * of the monitored area is covered, otherwise kraj names for the fully affected ones and
 * short aliases for the rest.
 */
export function formatRegions(regions) {
  const {
    regions: monitored = [],
    regionGroups = {},
    regionAliases = {},
    regionAllLabel,
    regionAllThresholdPercent
  } = config.meteoAlerts;

  if (regionAllLabel && regionAllThresholdPercent && monitored.length
    && (regions.length / monitored.length) * 100 >= regionAllThresholdPercent) {
    return regionAllLabel;
  }

  const remaining = new Set(regions);
  const groupLabels = [];

  // A kraj stands in for its okresy only when every okres we actually monitor in it is
  // affected; okresy absent from `regions` are never going to appear in a warning.
  for (const [group, members] of Object.entries(regionGroups)) {
    const watched = members.filter(member => monitored.includes(member));
    if (watched.length === 0 || !watched.every(member => remaining.has(member))) continue;

    groupLabels.push(group);
    for (const member of watched) remaining.delete(member);
  }

  const rest = [...remaining].map(region => regionAliases[region] ?? region);

  return [...groupLabels.sort(), ...rest.sort()].join(', ');
}

function formatEvent(event) {
  const label = config.meteoAlerts.events[event] ?? event;
  const max = config.meteoAlerts.eventMaxChars;

  return max > 0 ? label.slice(0, max) : label;
}

function formatDuration(start, end) {
  const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${hours ? `${hours}h` : ''}${rest ? `${rest}m` : ''}` || '0m';
}

function interpolate(str, data) {
  return str.replace(/\{([^}]+)\}/g, (_, key) => data[key] ?? '');
}

function parseEvent(event) {
  const start = event.indexOf(' ');
  const end = event.lastIndexOf(' ');

  // Feed events read like "Severe high temperature warning" while the config keys them
  // without separators ("hightemperature"), so strip whitespace as well as punctuation.
  return event.substring(start + 1, end).trim().toLowerCase().replace(/[\s\-/]/g, '');
}

function formatDate(date) {
  return new Date(date).toLocaleString('sk-SK', timeDateOptionsShort);
}
