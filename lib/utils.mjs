import crypto from 'crypto';

const PAYLOAD_TYPE_GRP_TXT = 0x05;
const MAX_HASH_SIZE = 8;
const CIPHER_MAC_SIZE = 2; // V1

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

// https://nominatim.org/release-docs/develop/api/Reverse/
export function geoCode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;

  return fetch(url)
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

  const match = truncatedString.match(/^(.*)\s/s);

  if (match && match[1]) {
    return match[1];
  } else {
    return '';
  }
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

/**
 * Computes the unique Packet Hash for a MeshCore Channel Message.
 *
 * @param {Buffer|string} channelKey - The 32-byte Channel Secret Key (hex string or Buffer).
 * @param {string} senderName - full node name of the sender.
 * @param {string} messageText - The text message content.
 * @param {number} [timestamp] - Unix timestamp (seconds). Defaults to current time.
 *                               NOTE: Changing this changes the resulting hash.
 * @returns {Object} Result containing the hash (hex) and the raw packet data.
 */
export function createChannelMessagePacket(channelKey, senderName, messageText, timestamp) {
  const keyBuf = Buffer.isBuffer(channelKey) ? channelKey : Buffer.from(channelKey, 'hex');

  timestamp ??= Math.floor(Date.now() / 1000);

  const timeBuf = Buffer.alloc(4);
  timeBuf.writeUInt32LE(timestamp, 0); // Standard MeshCore uses Little Endian

  const textBuf = Buffer.from(`${senderName}: ${messageText}`, 'utf-8');

  const rawData = Buffer.concat([timeBuf, textBuf]);
  const blockSize = 16;
  const remainder = rawData.length % blockSize;
  let paddedData = rawData;

  // Apply Zero Padding if necessary
  if (remainder !== 0) {
    const padding = Buffer.alloc(blockSize - remainder, 0);
    paddedData = Buffer.concat([rawData, padding]);
  }

  const encKey = keyBuf.subarray(0, 16);

  const cipher = crypto.createCipheriv('aes-128-ecb', encKey, null);
  cipher.setAutoPadding(false); // We handled padding manually to match C++ Utils::encrypt

  const encryptedData = Buffer.concat([cipher.update(paddedData), cipher.final()]);

  const hmac = crypto.createHmac('sha256', keyBuf);
  hmac.update(encryptedData);
  const fullMac = hmac.digest();
  const truncatedMac = fullMac.subarray(0, CIPHER_MAC_SIZE);

  const channelHashByte = getChannelHash(encKey);
  const channelHashBuf = Buffer.from([channelHashByte]);
  const payload = Buffer.concat([channelHashBuf, truncatedMac, encryptedData]);

  const typeBuf = Buffer.from([PAYLOAD_TYPE_GRP_TXT]);
  const hashInput = Buffer.concat([typeBuf, packetPayload]);

  const fullHash = crypto.createHash('sha256').update(hashInput).digest();
  const hash = fullHash.subarray(0, MAX_HASH_SIZE);

  return { timestamp, hash, payload };
}

// --- Helper: Calculate Channel Hash from Name ---
// In MeshCore, the 1-byte channel hash is usually the first byte of the SHA256 of the name.
export function getChannelHash(encKey) {
  const hash = crypto.createHash('sha256').update(encKey).digest();

  return hash[0];
}
