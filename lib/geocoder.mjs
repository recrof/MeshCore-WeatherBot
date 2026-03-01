import * as utils from './utils.mjs';

const cache = {};

export async function geoCodeCached(key, lat, lon) {
  if (cache[key]) return cache[key];
  const location = await utils.geoCode(lat, lon);
  if (location) cache[key] = location;
  return location;
}
