# Lives of Others

An interactive entry point to Guardian obituaries — a public, static site
that surfaces people through anniversaries, lifespans, and quotes.

See [about.html](about.html) for the project diary and full background.

## How it's put together

```
build (nightly GitHub Action)
 ├── fetch new obits from the Guardian Content API
 ├── enrich each with Claude (Haiku) → structured JSON
 └── shard by year, commit back

client (static, vanilla JS)
 ├── /            front page: "on this day" hero + quote roulette
 ├── /lives.html  lifespan ribbon — every obit as a line on a timeline
 └── /about.html  diary
```

## Environment

Build scripts need two secrets:

```sh
export GUARDIAN_API_KEY="…"     # https://open-platform.theguardian.com/access/
export ANTHROPIC_API_KEY="…"
```

In CI these come from repo secrets of the same name.

## Local commands

```sh
npm install
npm run fetch -- --limit 10     # fetch a small sample
npm run enrich -- --limit 10    # enrich them
npm run serve                   # http://localhost:8000
```

## Sharing & rights

Obituary copy is the Guardian's. The site shows short pull-quotes
(≤35 words, attributed) and links out to the Guardian for the full
read. No full-body reproduction.
