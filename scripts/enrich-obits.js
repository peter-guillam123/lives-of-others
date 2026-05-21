#!/usr/bin/env node
// Enrich raw obit records with structured fields via Claude (Haiku).
// Idempotent: reads data/enriched.json, only enriches obits not yet keyed there.
// System prompt + tool definition are prompt-cached so per-obit cost is dominated by the body.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { parseArgs } from './lib/args.js';
import { mapLimit, sleep } from './lib/concurrency.js';

const RAW = 'data/raw/obits.json';
const OUT = 'data/enriched.json';
const MODEL = 'claude-haiku-4-5-20251001';
const CONCURRENCY = 2;
// Rough proactive throttle so we sit under Tier 1's 20M-prompt-bytes-per-hour
// cap even when the SDK's retries aren't kicking in. ~5KB/sec average target.
const PER_REQUEST_DELAY_MS = 400;

const args = parseArgs(process.argv);
const limit = args.limit ? Number(args.limit) : null;
const force = !!args.force;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set');
  process.exit(1);
}

// SDK does its own exponential backoff on 429s; we bump retries way up so a
// single transient cap-bump doesn't drop the obit on the floor.
const client = new Anthropic({ maxRetries: 10 });

const SYSTEM_PROMPT = `You extract structured facts from Guardian obituaries.

You will be given an obituary's headline, byline, and HTML body. Call the
record_obituary tool exactly once with what you can extract. Follow these rules
carefully — the output ships to a public site, so accuracy matters more than
completeness.

DATES
- born / died: ISO YYYY-MM-DD if you have day-month-year. If only year is given,
  return that year as "YYYY". If only month-year, "YYYY-MM". If unknown, null.
- Do not guess. Obituaries usually open with "X, who has died aged N…" — work
  back from age and death date only if both are explicit.

ONE_LINE
- About 10–15 words. Distinctive. What this specific person did, not their job
  category. "Co-discoverer of the structure of DNA" beats "British scientist".
- No leading "was a" — start with a noun phrase or active verb.

FIELD
- A short noun phrase describing what they were ("physicist", "Labour MP",
  "jazz pianist", "war photographer"). Lowercase unless proper noun.

THEMES
- 3 to 5 short noun phrases. Capture eras, movements, contexts the person sat
  inside. "cold-war science", "British folk revival", "Stonewall era". Avoid
  generic words like "leadership" or "innovation".

BEST_QUOTE
- A pull-quote that captures voice or insight. Max 35 words. Prefer something
  the person said themselves (speaker: their name); fall back to a vivid line
  from the obit writer (speaker: "obit writer"). Return null if nothing meets
  this bar — do not pad with filler.

MENTIONS
- Named people who appear in the obit (collaborators, spouses, rivals). Full
  names where the obit gives them. Max 10. Skip the subject themselves.

NOTABLE_DATES
- Events from the subject's life whose month-day anniversary would mean
  something to a reader today. "md" is "MM-DD". Examples: the moon landing
  (07-20), publication of the DNA structure paper (04-25), the fall of the
  Berlin Wall (11-09). Only include events where THIS PERSON was meaningfully
  involved. Max 3. If none qualify, return [].
- Do not invent. If the obit does not state an event happened on a specific
  date, do not include it.

  EXCLUDE — these are NOT notable dates:
  - The subject's own birth or death (handled separately).
  - Cause of death, illness, diagnosis, hospital admission, funeral,
    memorial service, or any medical detail.
  - The subject's birthday, wedding, retirement, or other private milestones.
  - Events whose only significance is that they happened to the subject;
    we want events whose anniversary lands publicly today.

  Bar: would a Guardian reader who has never heard of this person nod at
  the anniversary as something they recognise? If not, leave it out.`;

const TOOL = {
  name: 'record_obituary',
  description: 'Record extracted facts about the obituary subject.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Subject name, exactly as the obit gives it.' },
      born: { type: ['string', 'null'], description: 'YYYY, YYYY-MM, or YYYY-MM-DD. Null if unknown.' },
      died: { type: ['string', 'null'], description: 'YYYY, YYYY-MM, or YYYY-MM-DD. Null if unknown.' },
      field: { type: 'string', description: 'Short noun phrase.' },
      one_line: { type: 'string', description: '10-15 word distinctive summary.' },
      themes: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 5 },
      best_quote: {
        type: ['object', 'null'],
        properties: {
          text: { type: 'string', maxLength: 280 },
          speaker: { type: 'string' },
        },
        required: ['text', 'speaker'],
      },
      mentions: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      notable_dates: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            md: { type: 'string', pattern: '^[0-9]{2}-[0-9]{2}$' },
            event: { type: 'string' },
          },
          required: ['md', 'event'],
        },
      },
    },
    required: ['name', 'born', 'died', 'field', 'one_line', 'themes', 'best_quote', 'mentions', 'notable_dates'],
  },
};

await mkdir('data', { recursive: true });
const raw = JSON.parse(await readFile(RAW, 'utf8'));
const enriched = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : {};

let candidates = raw.filter((r) => force || !enriched[r.id]);
if (limit) candidates = candidates.slice(0, limit);
console.log(`${raw.length} raw, ${Object.keys(enriched).length} already enriched, ${candidates.length} to do.`);

let done = 0;
let failed = 0;
let promptTokens = 0;
let outputTokens = 0;
let cacheReadTokens = 0;
let cacheWriteTokens = 0;

await mapLimit(candidates, CONCURRENCY, async (obit) => {
  try {
    await sleep(PER_REQUEST_DELAY_MS);
    const result = await enrichOne(obit);
    enriched[obit.id] = {
      id: obit.id,
      url: obit.webUrl,
      headline: obit.webTitle,
      published: obit.webPublicationDate.slice(0, 10),
      byline: obit.fields?.byline ?? null,
      thumbnail: obit.fields?.thumbnail ?? null,
      wordcount: Number(obit.fields?.wordcount ?? 0),
      section: obit.sectionId,
      ...result.fields,
      _enriched_at: new Date().toISOString(),
      _model: MODEL,
    };
    promptTokens += result.usage.input_tokens ?? 0;
    outputTokens += result.usage.output_tokens ?? 0;
    cacheReadTokens += result.usage.cache_read_input_tokens ?? 0;
    cacheWriteTokens += result.usage.cache_creation_input_tokens ?? 0;
    done++;
    if (done % 25 === 0 || done === candidates.length) {
      console.log(`  ${done}/${candidates.length} done…`);
      await writeFile(OUT, JSON.stringify(enriched, null, 2));
    }
  } catch (err) {
    failed++;
    console.error(`  FAILED ${obit.id}: ${err.message}`);
  }
});

await writeFile(OUT, JSON.stringify(enriched, null, 2));
console.log(`\nDone. ${done} enriched, ${failed} failed.`);
console.log(`Tokens — input: ${promptTokens}, output: ${outputTokens}, cache read: ${cacheReadTokens}, cache write: ${cacheWriteTokens}`);

async function enrichOne(obit) {
  const headline = obit.webTitle;
  const byline = obit.fields?.byline ?? '';
  const body = (obit.fields?.body ?? '').slice(0, 30000);

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'record_obituary' },
    messages: [
      {
        role: 'user',
        content: `Headline: ${headline}\nByline: ${byline}\nURL: ${obit.webUrl}\n\nBody (HTML):\n${body}`,
      },
    ],
  });

  const tool = msg.content.find((c) => c.type === 'tool_use');
  if (!tool) throw new Error('no tool_use in response');
  return { fields: tool.input, usage: msg.usage };
}
