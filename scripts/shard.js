#!/usr/bin/env node
// Turn data/enriched.json into:
//   data/index.json     — small client-loadable catalogue (id, name, dates, field, shard, image)
//   data/obits/{YYYY}.json — per-year shards with the full enriched record
//   data/on-this-day.json — pre-built lookup keyed by MM-DD
//   data/quotes.json    — pre-built list of usable quotes for the roulette
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const ENRICHED = 'data/enriched.json';
const enriched = JSON.parse(await readFile(ENRICHED, 'utf8'));
const records = Object.values(enriched);
console.log(`Sharding ${records.length} enriched records…`);

await rm('data/obits', { recursive: true, force: true });
await mkdir('data/obits', { recursive: true });

const byYear = new Map();
const index = [];
const onThisDay = {};
const quotes = [];

for (const r of records) {
  const yearKey = shardKey(r);
  if (!byYear.has(yearKey)) byYear.set(yearKey, []);
  byYear.get(yearKey).push(r);

  index.push({
    id: r.id,
    name: r.name,
    born: r.born,
    died: r.died,
    field: r.field,
    one_line: r.one_line,
    shard: yearKey,
    image: r.thumbnail,
    url: r.url,
    published: r.published,
  });

  for (const md of bucketsForOnThisDay(r)) {
    if (!onThisDay[md.md]) onThisDay[md.md] = [];
    onThisDay[md.md].push({ id: r.id, name: r.name, reason: md.reason, event: md.event ?? null });
  }

  if (r.best_quote && r.best_quote.text) {
    quotes.push({
      id: r.id,
      name: r.name,
      url: r.url,
      text: r.best_quote.text,
      speaker: r.best_quote.speaker,
      thumbnail: r.thumbnail,
    });
  }
}

for (const [year, items] of byYear) {
  items.sort((a, b) => (a.published < b.published ? 1 : -1));
  await writeFile(`data/obits/${year}.json`, JSON.stringify(items));
}

index.sort((a, b) => (a.published < b.published ? 1 : -1));
await writeFile('data/index.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  count: index.length,
  records: index,
}));

await writeFile('data/on-this-day.json', JSON.stringify(onThisDay));
await writeFile('data/quotes.json', JSON.stringify(quotes));

console.log(`Wrote ${byYear.size} shards, ${index.length} index entries, ${Object.keys(onThisDay).length} MM-DD buckets, ${quotes.length} quotes.`);

function shardKey(r) {
  const y = (r.published ?? '').slice(0, 4);
  return y || 'unknown';
}

// Phrases that signal a "notable date" the model shouldn't have surfaced:
// cause of death, personal milestones (birthday/funeral), medical detail.
// Filtered out at shard time so existing enriched data is cleaned even
// before a re-enrich. The prompt is also tightened so new obits don't
// produce this in the first place.
const EVENT_BLOCKLIST = /\b(cancer|tumour|tumor|leukaemia|leukemia|stroke|aneurysm|illness|disease|dementia|alzheimer|parkinson|terminal|hospice|chemo|diagnos|died|death|dying|passed away|passing|cause of death|suicid|funeral|memorial service|aged \d|'s birthday|'s funeral|'s memorial|'s death|'s birth)\b/i;

function isUsableEvent(d) {
  if (!d || !d.event) return false;
  if (!/^\d{2}-\d{2}$/.test(d.md ?? '')) return false;
  if (EVENT_BLOCKLIST.test(d.event)) return false;
  return true;
}

// Three reasons a person turns up on a given date: born, died, or an event from
// their life happened today. We pre-compute all three into one lookup.
function bucketsForOnThisDay(r) {
  const out = [];
  const bornMd = mdOf(r.born);
  const diedMd = mdOf(r.died);
  if (bornMd) out.push({ md: bornMd, reason: 'born' });
  if (diedMd) out.push({ md: diedMd, reason: 'died' });
  for (const d of r.notable_dates ?? []) {
    if (isUsableEvent(d)) {
      out.push({ md: d.md, reason: 'event', event: d.event });
    }
  }
  return out;
}

function mdOf(iso) {
  if (!iso || iso.length < 10) return null;
  return iso.slice(5, 10);
}
