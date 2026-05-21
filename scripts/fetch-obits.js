#!/usr/bin/env node
// Fetch Guardian obituaries (tone/obituaries) into data/raw/obits.json.
// Idempotent: existing IDs are skipped. Stops when a page has no new IDs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from './lib/args.js';
import { sleep } from './lib/concurrency.js';

const API = 'https://content.guardianapis.com/search';
const RAW = 'data/raw/obits.json';
const ENRICHED = 'data/enriched.json';
const SHOW_FIELDS = 'body,trailText,thumbnail,headline,byline,main,wordcount';
const PAGE_SIZE = 50;
const POLITE_MS = 120;
const INCREMENTAL_BUFFER_DAYS = 30;
const MIN_WORDCOUNT = 500;        // exclude "Other lives" reader pieces and short letters

const args = parseArgs(process.argv);
const apiKey = process.env.GUARDIAN_API_KEY;
if (!apiKey) {
  console.error('GUARDIAN_API_KEY not set');
  process.exit(1);
}

const yearsBack = Number(args.years ?? 15);
const limit = args.limit ? Number(args.limit) : null;
const force = !!args.force;

await mkdir('data/raw', { recursive: true });
const existing = existsSync(RAW) ? JSON.parse(await readFile(RAW, 'utf8')) : [];
const enriched = existsSync(ENRICHED) ? JSON.parse(await readFile(ENRICHED, 'utf8')) : {};
const known = new Set([
  ...existing.map((o) => o.id),
  ...Object.keys(enriched),
]);

// from-date: if we have enriched data, fetch incrementally from latest published - buffer;
// otherwise full back-catalogue.
const enrichedDates = Object.values(enriched).map((r) => r.published).filter(Boolean).sort();
const fromDate = args.since
  ?? (enrichedDates.length > 0 && !force
        ? isoDate(new Date(Date.parse(enrichedDates.at(-1)) - INCREMENTAL_BUFFER_DAYS * 86400_000))
        : isoDate(new Date(Date.now() - yearsBack * 365.25 * 86400_000)));
console.log(`Loaded ${existing.length} raw, ${Object.keys(enriched).length} enriched. Fetching from ${fromDate}…`);

const fresh = [];
let page = 1;
let totalPages = Infinity;
while (page <= totalPages) {
  const url = new URL(API);
  url.searchParams.set('tag', 'tone/obituaries');
  url.searchParams.set('from-date', fromDate);
  url.searchParams.set('order-by', 'newest');
  url.searchParams.set('page-size', PAGE_SIZE);
  url.searchParams.set('page', page);
  url.searchParams.set('show-fields', SHOW_FIELDS);
  url.searchParams.set('api-key', apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Guardian API ${res.status}: ${body.slice(0, 200)}`);
  }
  const { response } = await res.json();
  totalPages = response.pages;
  const onPage = response.results;
  const newThisPage = onPage.filter((r) => !known.has(r.id));
  const passing = newThisPage.filter(isFullObit);
  for (const r of passing) {
    fresh.push(stripRaw(r));
    known.add(r.id);
  }
  // Skipped IDs also count as known so we don't re-evaluate them on every run.
  for (const r of newThisPage) {
    if (!passing.includes(r)) known.add(r.id);
  }
  const skipped = newThisPage.length - passing.length;
  console.log(`  page ${page}/${totalPages}: ${onPage.length} results, ${passing.length} new (${skipped} skipped as short/Other-lives)`);

  if (limit && fresh.length >= limit) {
    fresh.length = limit;
    break;
  }
  // Caught up: every result on this page was already known (and we're not forcing).
  if (!force && newThisPage.length === 0 && known.size > 0) {
    console.log('  all results on this page were known — caught up.');
    break;
  }
  page++;
  await sleep(POLITE_MS);
}

const all = [...existing, ...fresh];
all.sort((a, b) => (a.webPublicationDate < b.webPublicationDate ? 1 : -1));
await writeFile(RAW, JSON.stringify(all, null, 2));
console.log(`Wrote ${all.length} total (${fresh.length} new) → ${RAW}`);

function stripRaw(r) {
  return {
    id: r.id,
    webTitle: r.webTitle,
    webUrl: r.webUrl,
    webPublicationDate: r.webPublicationDate,
    sectionId: r.sectionId,
    fields: r.fields ?? {},
    _fetched_at: new Date().toISOString(),
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Full-length obituary vs "Other lives" reader contribution or letter.
// Belt-and-braces: title prefix AND wordcount floor.
function isFullObit(r) {
  if ((r.webTitle ?? '').startsWith('Other lives:')) return false;
  const wc = Number(r.fields?.wordcount ?? 0);
  if (wc && wc < MIN_WORDCOUNT) return false;
  return true;
}
