// Lazy-loading data layer. Loads the small index up-front; year-shards on
// demand with bounded concurrency 4 and a tiny LRU so memory stays sane
// even if a user scrubs through the entire ribbon.

const CONCURRENCY = 4;
const CACHE_LIMIT = 12; // ~12 year-shards in memory at once

const shardCache = new Map();        // year → records[]
const inFlight = new Map();          // year → Promise
let active = 0;
const queue = [];

export const data = {
  index: null,
  onThisDay: null,
  quotes: null,
};

export async function loadBootstrap() {
  const [index, onThisDay, quotes] = await Promise.all([
    fetchJSON('data/index.json'),
    fetchJSON('data/on-this-day.json'),
    fetchJSON('data/quotes.json'),
  ]);
  data.index = index;
  data.onThisDay = onThisDay;
  data.quotes = quotes;
  return data;
}

export async function loadShard(year) {
  if (shardCache.has(year)) {
    // bump for LRU
    const v = shardCache.get(year);
    shardCache.delete(year);
    shardCache.set(year, v);
    return v;
  }
  if (inFlight.has(year)) return inFlight.get(year);
  const p = schedule(() => fetchJSON(`data/obits/${year}.json`)).then((records) => {
    shardCache.set(year, records);
    if (shardCache.size > CACHE_LIMIT) {
      const oldest = shardCache.keys().next().value;
      shardCache.delete(oldest);
    }
    inFlight.delete(year);
    return records;
  });
  inFlight.set(year, p);
  return p;
}

// Load the full enriched record for an id (used by the micro-card).
export async function loadRecord(idxEntry) {
  const records = await loadShard(idxEntry.shard);
  return records.find((r) => r.id === idxEntry.id);
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function schedule(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}
function pump() {
  while (active < CONCURRENCY && queue.length > 0) {
    const { fn, resolve, reject } = queue.shift();
    active++;
    fn().then(
      (v) => { active--; resolve(v); pump(); },
      (e) => { active--; reject(e); pump(); },
    );
  }
}
