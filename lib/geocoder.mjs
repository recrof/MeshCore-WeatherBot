import * as utils from './utils.mjs';

const cache = {};

export async function geoCodeCached(key, lat, lon) {
  if (cache[key]) return cache[key];

  const location = await utils.geoCode(lat, lon);
  if (location) {
    cache[key] = location;
    return location;
  }

  // Fall back to coordinates rather than nothing. Callers drop an alert that has no
  // location at all, and a position still beats losing the alert. Deliberately left
  // uncached, so a later lookup can still put a name to the same spot.
  return utils.formatCoords(lat, lon);
}
