import crypto from 'crypto';

const CIPHER_MAC_SIZE = 2; // V1
const CIPHER_BLOCK_SIZE = 16;
const CIPHER_KEY_SIZE = 16;

function bufferToHexString(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isInArea(lat, lon, area) {
  if (lat < area.minLat || lon < area.minLon || lat > area.maxLat || lon > area.maxLon) {
    return false
  }

  return true;
}

export function degreesToCompass8(degrees) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  const index = Math.round(degrees / 45) % 8;

  return directions[index];
}

export function normalizeText(text) {
  return text.normalize('NFD').trim().replaceAll(/[\n\u0300-\u036f]/g, '')
}

export function calculateHeadingAndDistance(myLat, myLon, targetLat, targetLon) {
  const R = 6371;
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const toDegrees = (radians) => radians * (180 / Math.PI);

  const lat1Rad = toRadians(myLat);
  const lon1Rad = toRadians(myLon);
  const lat2Rad = toRadians(targetLat);
  const lon2Rad = toRadians(targetLon);

  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearingRad = Math.atan2(y, x);

  const heading = (toDegrees(bearingRad) + 360) % 360;

  return {
    heading: degreesToCompass8(heading),
    distance: R * c
  };
}

/**
 * Renders a position as a low-precision "48.350, 17.580" string, for use when a place name
 * is unavailable. Three decimals is roughly 100m - enough to point at, short enough to send.
 *
 * @returns {string} the formatted pair, or '' if either value is not a finite number.
 */
export function formatCoords(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';

  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

// https://nominatim.org/release-docs/develop/api/Reverse/
export function geoCode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

  // Nominatim's usage policy requires an identifying User-Agent and answers 403 without
  // one; an empty result here silently suppresses lightning alerts entirely.
  return fetch(url, { headers: { 'User-Agent': 'MeshCore-WeatherBot (https://github.com/recrof/MeshCore-WeatherBot)' } })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      return res.json();
    })
    .then(json => {
      if (json.error) return '';

      const address = json.address || {};
      let location = '';

      if (address.village) location += `${address.village}, `;
      else if (address.town) location += `${address.town}, `;
      else if (address.city) location += `${address.city}, `;

      if (address.municipality) location += `${address.municipality}, `;
      if (address.state) location += `${address.state}, `;
      if (address.country) location += `${address.country}`;

      return location.replace(/,\s*$/, '');
    })
    .catch(err => {
      console.error('Geocoding failed:', err);
      return '';
    });
}

export function trimAndNormalize(str) {
  return normalizeText(str.replaceAll(/[\n\s]+/g, ' ').trim())
}

export function shortenToBytes(str, maxBytes) {
  if (typeof str !== 'string' || typeof maxBytes !== 'number' || maxBytes < 0) {
    return '';
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);

  if (encoded.length <= maxBytes) {
    return str;
  }

  const decoder = new TextDecoder('utf-8');
  const truncatedBytes = encoded.slice(0, maxBytes);

  let truncatedString = decoder.decode(truncatedBytes, { stream: true });

  while (encoder.encode(truncatedString).length > maxBytes) {
    truncatedString = truncatedString.slice(0, -1);
  }

  // Prefer breaking on whitespace, but a long unbroken run still has to be sent rather
  // than silently becoming an empty message.
  const match = truncatedString.match(/^(.*)\s/s);

  return match && match[1] ? match[1] : truncatedString;
}

export function splitStringToByteChunks(str, maxBytes) {
  if (typeof str !== 'string' || typeof maxBytes !== 'number' || maxBytes <= 0) {
    return [];
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: false }); // non-fatal for easy decoding
  const chunks = [];
  let remainingStr = str.trim();

  while (remainingStr.length > 0) {
    if (encoder.encode(remainingStr).length <= maxBytes) {
      chunks.push(remainingStr);
      break;
    }

    let candidateChunk = '';
    const encoded = encoder.encode(remainingStr);
    const truncatedBytes = encoded.slice(0, maxBytes);

    candidateChunk = decoder.decode(truncatedBytes, { stream: true });
    while (encoder.encode(candidateChunk).length > maxBytes) {
      candidateChunk = candidateChunk.slice(0, -1);
    }

    if (candidateChunk.length === 0) {
      const oneCharLessBytes = encoded.slice(0, maxBytes - 3); // Assume max 3 bytes for a char
      candidateChunk = decoder.decode(oneCharLessBytes, { stream: true });
      if (candidateChunk.length === 0) break; // Safety break
    }

    let splitIndex = -1;

    const sentenceMatch = candidateChunk.match(/^(.*[.?!])\s/s);
    if (sentenceMatch && sentenceMatch[1]) {
      splitIndex = sentenceMatch[1].length;
    } else {
      const whitespaceMatch = candidateChunk.match(/^(.*)\s/s);
      if (whitespaceMatch && whitespaceMatch[1]) {
        splitIndex = whitespaceMatch[1].length;
      }
    }

    let finalChunk;
    if (splitIndex > 0) {
      finalChunk = remainingStr.substring(0, splitIndex);
    } else {
      finalChunk = candidateChunk;
    }

    chunks.push(finalChunk.trim());

    remainingStr = remainingStr.substring(finalChunk.length).trim();
  }

  return chunks;
}

/**
 * Rejects if `promise` has not settled within `ms`. The companion library resolves most
 * commands only when the device answers, so on a dead socket they would otherwise wait
 * forever and take the calling backend down with them.
 */
export function withTimeout(promise, ms, what = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function sleep(milis) {
  return new Promise(resolve => setTimeout(resolve, milis));
}

export async function shaSumHex(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await globalThis.crypto.subtle.digest('SHA-1', data);

  return bufferToHexString(hash);
}

export function setAlarm(time, callback) {
  if(time === '*') {
    callback(new Date());
    return;
  }

  const [hours, minutes] = time.split(':');

  const seenAlarms = {};
  setInterval(() => {
    const date = new Date();
    const currentDate = date.toISOString().split('T')[0];
    if (!(date.getHours() == hours && date.getMinutes() == minutes && !seenAlarms[currentDate])) return;
    console.debug('alarm triggered', date);
    seenAlarms[currentDate] = 1;
    callback(date);
  }, 30 * 1000);
}

// BaseChatMesh.h: MAX_TEXT_LEN = 10 * CIPHER_BLOCK_SIZE. sendGroupMessage() clips the
// message so that "<sender>: <text>" fits in this many bytes.
const MAX_TEXT_LEN = 160;

// The firmware zero-pads the plaintext out to a whole cipher block before transmitting.
// Staying inside one 160-byte span keeps a channel message at 171 bytes on the wire; the
// next block up measures 187, which the repeaters tested here silently declined to relay.
const MAX_PLAINTEXT_LEN = 160;
const PLAINTEXT_HEADER_LEN = 5; // timestamp (4, LE) + txt type (1)
const MAX_NODE_NAME_LEN = 31;   // NodePrefs.h: char node_name[32]

/**
 * How many bytes of message text fit alongside the "<sender>: " prefix the node prepends,
 * without spilling the encrypted payload into another cipher block.
 *
 * @param {string|null} [senderName] - the node's own name, or null/undefined if unknown.
 * @returns {number} the largest message length, in bytes, that stays relayable.
 */
export function maxTextBytes(senderName) {
  // With no name to measure, assume the longest the firmware allows so the result is still safe.
  const prefixLen = senderName == null
    ? MAX_NODE_NAME_LEN + 2
    : Buffer.byteLength(`${senderName}: `, 'utf-8');

  return MAX_PLAINTEXT_LEN - PLAINTEXT_HEADER_LEN - prefixLen;
}

/**
 * Rebuilds the plaintext body the firmware puts inside a channel message.
 *
 * Mirrors BaseChatMesh::sendGroupMessage(), including the truncation it applies when
 * "<sender>: <text>" would exceed MAX_TEXT_LEN. Returns bytes rather than a string,
 * because that truncation is done on bytes and can split a UTF-8 sequence.
 *
 * @param {string} senderName - node name of the sender, as the firmware knows it.
 * @param {string} messageText - the text handed to the companion.
 * @returns {Buffer} the "<sender>: <text>" bytes, truncated the way the firmware does it.
 */
export function channelMessageBody(senderName, messageText) {
  const prefix = Buffer.from(`${senderName}: `, 'utf-8');
  const text = Buffer.from(messageText, 'utf-8');
  const textLen = Math.max(0, Math.min(text.length, MAX_TEXT_LEN - prefix.length));

  return Buffer.concat([prefix, text.subarray(0, textLen)]);
}

/**
 * Decrypts a MeshCore GRP_TXT packet payload using the channel key.
 *
 * The payload is `channel hash (1) | MAC (2) | AES-128-ECB ciphertext`, and the plaintext
 * inside is `timestamp (4, LE) | txt type (1) | "<sender>: <text>"`, zero-padded out to a
 * whole cipher block. See Mesh::createGroupDatagram() and BaseChatMesh::sendGroupMessage().
 *
 * @param {Buffer|Uint8Array|string} channelKey - the channel secret (16 or 32 bytes, or hex).
 * @param {Buffer|Uint8Array} payload - the raw GRP_TXT packet payload.
 * @returns {{timestamp: number, txtType: number, body: Buffer}|null} null if the payload is
 *          malformed or its MAC does not verify under this key.
 */
export function decryptChannelMessage(channelKey, payload) {
  const keyBuf = Buffer.isBuffer(channelKey) ? channelKey
    : typeof channelKey === 'string' ? Buffer.from(channelKey, 'hex')
    : Buffer.from(channelKey);
  const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  const encrypted = payloadBuf.subarray(1 + CIPHER_MAC_SIZE);
  if (encrypted.length === 0 || encrypted.length % CIPHER_BLOCK_SIZE !== 0) return null;

  // Reject anything not encrypted with this channel's key, so a foreign message that
  // happens to collide on the 1-byte channel hash cannot be mistaken for ours.
  const mac = crypto.createHmac('sha256', keyBuf).update(encrypted).digest().subarray(0, CIPHER_MAC_SIZE);
  if (!mac.equals(payloadBuf.subarray(1, 1 + CIPHER_MAC_SIZE))) return null;

  const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuf.subarray(0, CIPHER_KEY_SIZE), null);
  decipher.setAutoPadding(false); // the firmware zero-pads, it does not use PKCS#7
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  if (plain.length < 5) return null;

  // Drop the zero padding the firmware added to reach a whole cipher block.
  let end = plain.length;
  while (end > 5 && plain[end - 1] === 0) end--;

  return {
    timestamp: plain.readUInt32LE(0),
    txtType: plain[4],
    body: plain.subarray(5, end),
  };
}

// --- Helper: Calculate Channel Hash from the channel key ---
// Mirrors BaseChatMesh::setChannel(): the 1-byte channel hash is the first byte of the
// SHA256 of the key. The firmware hashes 16 bytes for a 128-bit key and 32 for a 256-bit
// one, so a 128-bit key that arrived zero-padded to 32 bytes must be trimmed back to 16.
export function getChannelHash(channelKey) {
  let keyBuf = Buffer.isBuffer(channelKey) ? channelKey : Buffer.from(channelKey);
  if (keyBuf.length === 32 && keyBuf.subarray(16).every(b => b === 0)) {
    keyBuf = keyBuf.subarray(0, 16);
  }
  const hash = crypto.createHash('sha256').update(keyBuf).digest();

  return hash[0];
}
