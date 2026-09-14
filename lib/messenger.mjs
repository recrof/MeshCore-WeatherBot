import { Constants, Packet } from '@liamcottle/meshcore.js';
import * as utils from './utils.mjs';
import config from '../config.mjs';

const SENDER_SEPARATOR = Buffer.from(': ', 'utf-8');

// The companion library never reconnects on its own and most of its commands resolve only
// when the device answers, so a companion restart would otherwise leave the bot holding a
// dead socket forever, with every send hung on it.
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 60000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;
const COMMAND_TIMEOUT = 10000;
const OFFLINE_WAIT = 120000;

let meshcore;
let target;
let selfName;

let connected = false;
let reconnectAttempt = 0;
let reconnectTimer;
let heartbeatTimer;
let heartbeatInFlight = false;

export function init(mc, name) {
  meshcore = mc;
  target = name;
  selfName = undefined;
  connected = false;

  meshcore.on('connected', () => {
    connected = true;
    reconnectAttempt = 0;
  });

  meshcore.on('disconnected', () => {
    connected = false;
    console.log(`Disconnected from ${target}`);
    scheduleReconnect();
  });

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
}

/**
 * Opens the companion connection, and keeps reopening it for as long as the process lives.
 * A failed attempt surfaces as a `disconnected` event, so retries are scheduled from there.
 */
export async function connect() {
  try {
    await meshcore.connect();
  } catch (e) {
    console.log(`Connect to ${target} failed: ${e?.message ?? e}`);
    scheduleReconnect();
  }
}

export function isConnected() {
  return connected;
}

function scheduleReconnect() {
  // An error and a close can both arrive for the same failure; only one retry should follow.
  if (reconnectTimer) return;

  reconnectAttempt += 1;
  const delay = Math.min(RECONNECT_DELAY * 2 ** (reconnectAttempt - 1), MAX_RECONNECT_DELAY);
  console.log(`Reconnecting to ${target} in ${delay}ms (attempt ${reconnectAttempt})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delay);
}

// A companion that hard-resets sends no FIN, so the socket can look alive for hours after
// the device is gone. Asking it a cheap question on a timer, and tearing the socket down
// when it goes unanswered, turns that into an ordinary disconnect the reconnect logic
// already handles.
async function heartbeat() {
  if (!connected || heartbeatInFlight) return;
  heartbeatInFlight = true;

  try {
    await meshcore.getSelfInfo(HEARTBEAT_TIMEOUT);
  } catch {
    console.log(`Companion ${target} unresponsive for ${HEARTBEAT_TIMEOUT}ms, dropping the connection.`);
    meshcore.close();
  } finally {
    heartbeatInFlight = false;
  }
}

function waitForConnection(maxWaitMs) {
  if (connected) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onUp = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      meshcore.off('connected', onUp);
      resolve(false);
    }, maxWaitMs);
    meshcore.once('connected', onUp);
  });
}

// The node stamps its own name onto every channel message, so we need it to recognise our
// own packet coming back. Remembered once read; if the companion won't tell us right now
// we fall back to taking the sender from the packet itself and try again next time.
async function getSelfName() {
  if (selfName) return selfName;

  try {
    selfName = (await meshcore.getSelfInfo(COMMAND_TIMEOUT))?.name || null;
  } catch (e) {
    console.log(`Could not read node name (${e?.message ?? 'timeout'}), matching repeats on message text alone.`);
    return null;
  }

  return selfName;
}

export async function sendAlert(message, channel) {
  // A companion restart takes it away for a while; wait for it to come back rather than
  // burning every retry into a dead socket.
  if (!await waitForConnection(OFFLINE_WAIT)) {
    console.log(`Companion offline for ${OFFLINE_WAIT / 1000}s, dropping alert: ${message}`);
    return;
  }

  const sender = await getSelfName();
  // The node prepends "<name>: ", so how much text we can send depends on its name length.
  const truncated = utils.shortenToBytes(message, utils.maxTextBytes(sender));

  for (let attempt = 1; attempt <= config.send.maxRetries; attempt++) {
    if (!await waitForConnection(OFFLINE_WAIT)) {
      console.log(`Companion offline for ${OFFLINE_WAIT / 1000}s, dropping alert: ${message}`);
      return;
    }

    try {
      await utils.withTimeout(
        meshcore.sendChannelTextMessage(channel.channelIdx, truncated), COMMAND_TIMEOUT, 'send'
      );
    } catch (e) {
      console.log(`Send failed (attempt ${attempt}/${config.send.maxRetries}): ${e?.message ?? e ?? 'rejected by companion'}`);
      continue;
    }
    console.log(`Sent [${channel.name}] (attempt ${attempt}/${config.send.maxRetries}): ${message}`);

    const repeaterId = await waitForRepeat(channel, sender, truncated, config.send.repeatWaitMs);
    if (repeaterId) {
      console.log(`Confirmed repeated by repeater 0x${repeaterId}.`);
      break;
    }
    if (attempt < config.send.maxRetries) {
      console.log(`Not heard by repeater, retrying...`);
    } else {
      console.log(`Not heard by repeater after ${config.send.maxRetries} attempts.`);
    }
  }

  await utils.sleep(30_000);
}

/**
 * Decides whether a decrypted channel message is the one we just sent.
 *
 * The firmware clips "<sender>: <text>" to MAX_TEXT_LEN, so we rebuild the body the same
 * way rather than comparing against the untruncated text we handed to the companion.
 */
function isOurMessage(body, sender, text) {
  if (sender) {
    return body.equals(utils.channelMessageBody(sender, text));
  }

  // Without our own node name, take the sender from the packet so the truncation still
  // lines up, and rely on the message text to tell our packet apart from anyone else's.
  const separator = body.indexOf(SENDER_SEPARATOR);
  if (separator === -1) return false;

  return body.equals(utils.channelMessageBody(body.subarray(0, separator).toString('utf-8'), text));
}

function waitForRepeat(channel, sender, text, timeoutMs) {
  return new Promise((resolve) => {
    const channelHash = utils.getChannelHash(channel.secret);

    const timer = setTimeout(() => {
      meshcore.off(Constants.PushCodes.LogRxData, onRxData);
      resolve(null);
    }, timeoutMs);

    const onRxData = (rxData) => {
      try {
        const packet = Packet.fromBytes(rxData.raw);
        // Path hashes are no longer always 1 byte: path_len packs the hash size in its top
        // 2 bits and the hop count in the low 6, so ask the packet rather than counting bytes.
        const pathHashes = packet.getPathHashes();
        if (
          packet.payload_type !== Packet.PAYLOAD_TYPE_GRP_TXT ||
          pathHashes.length === 0 ||          // no hops yet, so nobody has repeated it
          packet.payload.length === 0 ||
          packet.payload[0] !== channelHash   // cheap filter before we bother decrypting
        ) return;

        // Confirm it really is our message and not just traffic on the same channel.
        const message = utils.decryptChannelMessage(channel.secret, packet.payload);
        if (!message || !isOurMessage(message.body, sender, text)) return;

        clearTimeout(timer);
        meshcore.off(Constants.PushCodes.LogRxData, onRxData);
        // last path entry = most recent repeater's node hash (1-3 bytes)
        const repeaterId = Buffer.from(pathHashes[pathHashes.length - 1]).toString('hex').toUpperCase();
        resolve(repeaterId);
      } catch {
        // ignore malformed packets
      }
    };

    meshcore.on(Constants.PushCodes.LogRxData, onRxData);
  });
}
