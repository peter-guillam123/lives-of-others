# Reader-facing projects — a playbook

For when I'm taking a slice of Guardian content (or any editorial
archive) and trying to make it beautiful, easy to explore, and
premium. Assume my `~/.claude/CLAUDE.md` applies underneath; this is
the genre-specific layer on top.

---

## The unit is an *encounter*, not a list item

If the page reads like a directory, the archive is catalogued — not
unlocked. The unit on a reader-facing page should be an *encounter*:
a piece, a person, a juxtaposition, framed in a way the reader couldn't
have found on their own. A directory of "everyone we've written about"
is what theguardian.com already offers, and they do it better than
I will.

Two tests:

- Could a thoughtful reader summarise the page back to me in one
  editorial line? ("Two Forest players, one obit." "The Stonewall
  generation.") If they couldn't, the page is a list, not an
  encounter.
- Does the page make a *choice*? Or does it present everything
  equally and ask the reader to choose? If it's the second, the
  editorial work hasn't been done.

## Three patterns for encounter

- **Pair.** Two pieces side by side with a short editorial line on
  why they sit together. A section editor would do this in print and
  no algorithm gives it to you. Claude at build time, with the corpus
  in hand, can.
- **Room.** A curated thematic gallery — six to ten pieces, sequenced,
  with an editorial preamble. Like a small exhibition. The model
  drafts; I edit.
- **Walk.** From one piece, three suggested next pieces with a
  one-line *bridge* on each. "Same field, fifty years earlier."
  "Wrote three books with her." Not "you might also like".

Build at least one of these before a search or a filter. Search is
a fallback for when the editorial work didn't help.

## Build-time work beats runtime work

The reader's browser is slow, intermittent, and won't run an LLM for
me. The build server is none of those. Spend Claude tokens at build
time on:

- Extracting structured fact from prose (born, died, field, themes,
  people mentioned, quotes — see `prompts/extract-quotes.md`).
- Pairing, clustering, drafting bridges between pieces.
- Drafting editorial preambles for rooms.
- Disambiguating mentions (the "this 'John Smith' is *that* John
  Smith") so cross-references work.

Then ship pre-baked JSON. The client renders.

## Quotes

Three types: **voice** (the subject), **witness** (someone else in
the piece, on the subject), **writing** (a line of the writer's prose
that captures the subject). Hard rules: verbatim, careful
attribution, never merge an embedded short quote with surrounding
prose, never attribute a nested quote to the conduit.

The full spec is `prompts/extract-quotes.md`. Reference or copy it
into any project that surfaces quotes.

## Register

- **Editorial, not algorithmic.** "We picked this because…" beats
  "you might like…".
- **Specific over abstract.** "The Polly Toynbee year" beats "a
  significant period". "The room they were both in" beats "related".
- **Sentence case** for headings unless proper nouns. **Mono caps
  with wide tracking** for tracked-out labels — catalogue numbers,
  section markers, dates in colophons.
- **Hedge tactically.** "Probably", "feels to me", "I'm not sure if".
  Avoid "delightful", "premium", "powerful", "seamless",
  "game-changing".
- **Roman numerals for years** in the colophon when the design earns
  it.
- **A small, ungrammatical aside lands better than a clean summary.**
  Self-deprecating asides earn trust; punchy summary lines feel
  marketing-y.

## Sensitivity

Reader-facing means a Guardian reader, who has higher expectations
than an internal tool would warrant.

- **Cause of death** is not a pull-quote, not a tag, not a "notable
  date". Filter aggressively at extraction time and again at shard
  time.
- **Private milestones** (birthday, wedding, retirement) are not
  publicly notable unless the piece itself treats them as such — and
  even then, default to skipping when used as an anniversary surface.
  Their *own* birthday landing today is not a reason to put them on
  an "on this day" page; that's the very reason they're on the page.
- **Family-written vs staff-written** is a real editorial
  distinction. "Other lives" pieces are tagged at series level
  (`theguardian/series/otherlives`) and have a different contract —
  treat them as their own thing if at all. Same for "Letters: in
  memory of".
- **The Brexit Party / Reform UK rename principle** — when
  introducing a slug-to-name fallback, an ID-based join, a hardcoded
  list, flag the assumption that could break. Stale data only ever
  gets discovered by a reader; it's better to discover it at design
  time.
- **Bylines stay on every card.** The obit writer's work earned the
  attribution.

## Rights and link-out

The Content API allows display but the framing matters:

- Keep quotes short. ≤35 words for casual surfaces; pull-quote
  treatments get more room but stay well under full reproduction.
- Always attribute. Always link out to the Guardian for the full
  read.
- Frame the site as a *way in* to the archive, not a replacement
  for it. The About page should say this explicitly.
- No analytics on these projects.

## Technical defaults

Inherited from Guardian Angles, paid for in mobile bug-fixes:

- **Static site, no framework.** GitHub Pages, Cloudflare DNS-only,
  custom domain unless explicitly skipping.
- **Build pipeline as a GitHub Action.** Idempotent fetch + enrich
  + shard. Commits data back to `main`. Pages deploys.
- **Bounded-concurrency loaders.** 4 is a good default; never
  `Promise.all(everything)`.
- **rAF-coalesced renders** on any streaming or progressive surface.
- **Cache eviction** on any in-memory loader. Mobile Chrome has
  ~400 MB per tab. An unevicted cache is a memory bomb in disguise.
- **12px body floor, 11px tracked-caps floor**, 40px tap targets,
  `touch-action: pan-x` on horizontal scrollers (no page wobble).
- **Keyboard navigation, ARIA roles, focus rings,
  prefers-reduced-motion respected.**
- **Build-time Claude API calls with prompt caching** on the system
  prompt and any large fixed inputs. Idempotent: only enriches IDs
  we haven't seen.
- **Rate-limit awareness.** Concurrency 2 with a small per-request
  stagger sits comfortably under Tier 1 Anthropic limits; concurrency
  5 hits the cap on long runs.

## Flow with Claude

The pattern that works for me, in order:

1. I sketch the idea in plain English.
2. Claude flags real concerns first — accessibility, mobile,
   editorial, hidden complexity, rights — *before* writing code.
3. I weigh in.
4. Claude builds. One commit per theme.
5. I eyeball every commit. JS gets `node --check`. CSS gets a live
   look. DOM logic gets a dry trace through the user flow.
6. After major work, a design audit pass.
7. Diary entry. Mark milestones with weight.

Step 2 is the one that earns the rest. Don't skip it.

## Pages every project gets

- **A front page that makes a choice** — not a directory.
- **An about / diary page in my voice**, reverse-chronological,
  including the "why this isn't what it is" entries. Future readers
  (including me) get the why, not just the what.
- **A footer / colophon** with link-out, attribution, and a printed
  feel ("Set in [Font] · MMXXVI").

## Failures already paid for

- **"Other lives" pieces leaking into a staff-obit archive.** Tag
  check (`theguardian/series/otherlives`), not title prefix —
  editorial convention has shifted.
- **Cause-of-death surfacing as "notable dates"** on the on-this-day
  page. Blocklist at the shard step *and* prompt-level exclusion.
- **A quote field that merged short embedded fragments with the
  surrounding prose**, attributing the merged thing to the embedded
  speaker. Hence `prompts/extract-quotes.md`.
- **Anthropic rate limit on Tier 1 dropping ~70% of obits** on the
  first big enrichment run. Concurrency 2 + SDK maxRetries 10 +
  per-request stagger, not concurrency 5.
- **Force-directed connection graphs** that work on a 27-inch
  monitor and collapse on a phone. Don't ship them as primary
  navigation.
- **`Promise.all` over every shard** as a memory bomb in disguise
  on mobile Chrome.
- **Absolute root nav links** (`href="/"`) on a project deployed
  under a GitHub Pages subpath. Always relative.

The playbook is shorter than the list of bugs because most of the
bugs share a few causes.
