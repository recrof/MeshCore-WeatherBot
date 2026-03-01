import { Constants, Packet } from '@liamcottle/meshcore.js';
import * as utils from './utils.mjs';
import config from '../config.mjs';

let meshcore;

export function init(mc) {
  meshcore = mc;
}

export async function sendAlert(message, channel) {
  const truncated = utils.shortenToBytes(message, 155);

  for (let attempt = 1; attempt <= config.send.maxRetries; attempt++) {
    await meshcore.sendChannelTextMessage(channel.channelIdx, truncated);
    console.log(`Sent [${channel.name}] (attempt ${attempt}/${config.send.maxRetries}): ${message}`);

    const repeaterId = await waitForRepeat(channel, config.send.repeatWaitMs);
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

function waitForRepeat(channel, timeoutMs) {
  return new Promise((resolve) => {
    const channelHash = utils.getChannelHash(channel.secret);

    const timer = setTimeout(() => {
      meshcore.off(Constants.PushCodes.LogRxData, onRxData);
      resolve(null);
    }, timeoutMs);

    const onRxData = (rxData) => {
      try {
        const packet = Packet.fromBytes(rxData.raw);
        if (
          packet.payload_type === Packet.PAYLOAD_TYPE_GRP_TXT &&
          packet.path.length > 0 &&
          packet.payload.length > 0 &&
          packet.payload[0] === channelHash
        ) {
          clearTimeout(timer);
          meshcore.off(Constants.PushCodes.LogRxData, onRxData);
          // last byte of path = most recent repeater's 1-byte node hash
          const repeaterId = packet.path[packet.path.length - 1].toString(16).padStart(2, '0').toUpperCase();
          resolve(repeaterId);
        }
      } catch {
        // ignore malformed packets
      }
    };

    meshcore.on(Constants.PushCodes.LogRxData, onRxData);
  });
}
