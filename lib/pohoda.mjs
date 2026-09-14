import * as utils from './utils.mjs';
import config from '../config.mjs';
import { sendAlert } from './messenger.mjs';

const seen = new Set();
let seeded = false;

export function start(channels) {
  setInterval(() => checkNews(channels), config.pohoda.pollInterval * 1000);
  checkNews(channels);
}

// Split a title so it fits MeshCore messages: one message up to 155 chars,
// otherwise two word-aligned halves.
function splitTitle(title) {
  if (title.length <= 155) return [title];
  return utils.splitStringToByteChunks(title, Math.ceil(title.length / 2));
}

async function checkNews(channels) {
  try {
    const res = await fetch(config.pohoda.url);
    if (!res.ok) { console.log(`stageocean.com HTTP ${res.status}`); return; }

    const articles = await res.json();
    if (!Array.isArray(articles)) { console.log('Unexpected news response'); return; }

    // On the first poll, remember existing articles without sending them,
    // so we only announce items published from now on.
    if (!seeded) {
      for (const article of articles) seen.add(article.id);
      seeded = true;
      console.log(`Seeded ${seen.size} existing Pohoda articles.`);
      return;
    }

    // API returns newest first; announce oldest new article first.
    const fresh = articles.filter(a => !seen.has(a.id)).reverse();

    for (const article of fresh) {
      seen.add(article.id);
      const title = utils.trimAndNormalize(article.title ?? '');
      if (!title) continue;

      for (const message of splitTitle(title)) {
        await sendAlert(message, channels[config.pohoda.channel]);
      }

      // image.fileName is "<titleSeo>.<id>.<ext>" – extract the slug (skip raw photo names)
      const titleSeo = article.image?.fileName?.match(/^(.+)\.\d+\.[^.]+$/)?.[1];
      if (titleSeo) {
        await sendAlert(`https://www.pohodafestival.sk/sk/novinky/${titleSeo}`, channels[config.pohoda.channel]);
      }
    }
  } catch (e) {
    console.log('Error checking Pohoda news', e);
  }
}
