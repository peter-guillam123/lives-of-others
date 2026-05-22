# Quote extraction for editorial text

A self-contained spec for extracting pull-quote-grade quotes from a piece
of editorial prose (obituary, profile, longread, court report, interview,
review). Triadic typing, verbatim rule, careful attribution. Lift into a
real Claude skill (`~/.claude/skills/extract-quotes/`) the second time a
project needs it.

---

## What you return

Up to three quotes, **each slot optional**. No filler. If a piece doesn't
yield a strong quote of a given type, *skip the slot entirely* — don't
pad with weaker material.

```jsonc
{
  "quotes": [
    {
      "type": "voice" | "witness" | "writing",
      "text": "verbatim substring of the source, including original quote marks",
      "attributed_to": "exact name the source cites them by, or 'the writer'",
      "context": "optional one-clause framing — how the source introduces this quote; include only when sense depends on it"
    }
  ]
}
```

---

## The three types

**voice** — the *subject* speaking, in their own words. The source must
clearly mark this as the subject saying or writing this thing —
quotation marks around their words, or an attribution like "she once
told a reporter…", or a clearly-marked extract from something they
wrote. If the source is paraphrasing ("she believed that life was…"),
it isn't `voice`.

**witness** — someone *other than the subject*, in the piece, on the
subject. Brian Clough on John Robertson. A colleague at the memorial.
A reviewer of their book. Must be attributed in the source to a *named*
person — not "many said". The named person goes in `attributed_to`.

**writing** — a line of the *writer's prose* that captures the subject
in a way no quote does. "A world-class left-winger in his prime, with
dazzling dribbling skills, Robertson was the creative heart of the
Forest team." The writer wrote that. It belongs to them. For `writing`
quotes, `attributed_to` is always exactly `"the writer"`.

You can return one of each, or any subset. Three is the maximum.

---

## The verbatim rule

This is the core of the spec. Every value of `text` must be a
**character-for-character substring of the source body**. Not a
near-match. Not a tidy-up. Not "this is basically what they said". The
downstream code will substring-check your output; anything that fails
the check is dropped.

What this rules out:

- **Don't merge short embedded quotes with the surrounding prose.** If
  the source reads `He was once described by their manager Brian
  Clough as a "Picasso" of the game, such was his artistic flair.`,
  the extractable witness quote is `"Picasso"` (one word, attributed
  to Clough) — **not** `"Picasso" of the game, such was his artistic
  flair` with Clough as speaker. Half of that sentence is the writer's
  prose; Clough did not say it.
- **Don't paraphrase or summarise a longer quote.** A long verbatim
  quote is fine; a short verbatim fragment is fine; a sleek summary
  of either is not.
- **Don't tidy the source.** No fixing punctuation, capitalisation,
  ellipses, or contractions. No removing parenthetical asides. Verbatim.
- **Preserve the surrounding quote marks** so downstream readers can
  see whether the line is a complete utterance or an embedded fragment.
- **A short fragment is allowed**, but only when it's the strongest
  natural unit. Prefer the longest verbatim unit that still earns its
  place as a pull-quote.

---

## Attribution rules

`attributed_to` must match how the *source* itself attributes the line.

- **Nested attribution.** If the source says `Judith believed,
  following William Morris, that it was best to "stave off decay by
  daily care"`, the quoted text is *Morris's*. `attributed_to:
  "William Morris"`. `context: "Scott followed Morris's view that..."`.
  **Not** "Judith Scott" — she is the conduit, not the speaker.
- **Translations are not the speaker's words.** If the obit gives an
  English translation of something the subject said in another
  language, it is not a `voice` quote — the translation is the
  writer's. Either treat it as `writing`, or skip.
- **No fabrication.** If a quote in the source isn't attributed to a
  named person, don't invent one. Skip the quote.
- **For `writing` quotes, `attributed_to` is always exactly
  `"the writer"`** — never the byline name, never the subject.
- **The subject's name in `attributed_to`** must match the form the
  obit uses on first mention (full name including any titles or
  patronymics the source uses).

---

## Editorial bar

Beyond the verbatim and attribution rules, a quote has to *earn its
place*. It will run at thirty-point type and the reader will look at
it for several seconds. Apply these filters:

- **Specificity.** "He was a kind man" is praise, not a pull-quote. Pass.
- **Self-contained.** No orphan pronouns ("she said it was the best
  decision of her life" — what was?). Either the quote stands on its
  own, or `context` clarifies in one short clause. If `context` would
  have to be a paragraph, pass on the quote.
- **Vivid.** A noun you can picture. A claim you can test. A turn
  you'd remember twenty minutes later.
- **Tonal sensitivity.** Skip anything from a description of cause of
  death, terminal illness, deathbed scene, or other private medical
  detail. Skip views the subject later renounced unless the source
  itself treats them as still defining. Skip dialogue from victim
  statements or court testimony unless the subject is the one giving it.

---

## Prefer the writer's marked-up pull-quotes

Many editorial sources have pull-quote markup baked into the HTML —
`<blockquote>`, `<aside class="pullquote">`, or similar. The writer
has already chosen these lines as worth displaying at scale. If you
see them, prefer them over hunting through the prose, but apply the
same verbatim and attribution rules — the marked-up pull-quote is
sometimes paraphrased by the editor.

---

## Worked examples

### 1. Footballer with no voice quotes — John Robertson

Source contains (relevant excerpts):

> He was once described by their manager Brian Clough as a "Picasso"
> of the game, such was his artistic flair.

> A world-class left-winger in his prime, with dazzling dribbling
> skills, Robertson was the creative heart of the Forest team.

Robertson himself is not directly quoted in this obit.

**Correct:**

```json
{
  "quotes": [
    {
      "type": "witness",
      "text": "\"Picasso\"",
      "attributed_to": "Brian Clough",
      "context": "Clough, his manager at Nottingham Forest, described him as"
    },
    {
      "type": "writing",
      "text": "A world-class left-winger in his prime, with dazzling dribbling skills, Robertson was the creative heart of the Forest team.",
      "attributed_to": "the writer"
    }
  ]
}
```

The `voice` slot is empty — that's correct, there is no voice quote in
the source.

**Incorrect:**

```json
{
  "type": "witness",
  "text": "Picasso of the game, such was his artistic flair.",
  "attributed_to": "Brian Clough"
}
```

The verbatim rule fails — Clough did not say "such was his artistic
flair"; the writer did. Merging the embedded word with the surrounding
prose and attributing the merged thing to Clough is precisely the
failure this spec exists to prevent.

### 2. Nested attribution — Judith Dorothea Guillum Scott

Source contains:

> Judith believed, following William Morris, that it was best to
> "stave off decay by daily care" and a careful and continuing
> programme of maintenance and repairs, and ceaseless vigilance, would
> mean that churches would survive into the future.

**Correct:**

```json
{
  "quotes": [
    {
      "type": "witness",
      "text": "\"stave off decay by daily care\"",
      "attributed_to": "William Morris",
      "context": "Scott followed Morris's view that it was best to"
    }
  ]
}
```

**Incorrect:** attributing the line to Judith Scott because she's the
subject. Morris said it; she followed his view.

### 3. A strong voice quote

Source contains:

> "You don't write about war the same way after you've watched a
> friend die," she told the Paris Review in 1973. "You write around it."

**Correct:**

```json
{
  "quotes": [
    {
      "type": "voice",
      "text": "\"You don't write about war the same way after you've watched a friend die,\"",
      "attributed_to": "[subject name as the obit gives it]",
      "context": "in a 1973 Paris Review interview"
    }
  ]
}
```

Stitching the two clauses around the dialogue tag (`she told the Paris
Review in 1973`) into a single returned string would fail the verbatim
check — the writer's dialogue tag isn't part of either spoken clause.
Return one clause, preferring the stronger one.

---

## Caller responsibilities

The spec assumes a build-time pipeline that calls the model with this
prompt and processes the output. The caller should:

- **Substring-check every `text` against the source body.** Drop any
  quote that fails. Log the failure for review. If a piece produces
  only failing quotes, surface "no quote" rather than display anything.
- **Render `voice` and `witness` with the named speaker.** Render
  `writing` with the byline. Never show a quote without an attribution
  — without one, a pull-quote reads as fabricated.
- **For a roulette / random-pick surface**, weight `voice` highest
  (the strongest reader experience), then `witness`, then `writing`.
- **For inline / contextual surfaces**, choose the type that fits the
  surrounding editorial logic — a "pairing" might want both subjects'
  `voice` quotes; a "room" preamble might want one `writing` quote
  per piece.

---

## Tracked failure modes

If the model regresses, check these specific failures first — each
costs a real editorial mistake when it slips through:

1. **Merging short embedded quotes with surrounding prose** (the
   Clough/Robertson case).
2. **Attributing a nested quote to the conduit** rather than the
   original speaker (the Morris/Scott case).
3. **Translating without disclosure** — presenting a translated quote
   as `voice` when the writer translated it.
4. **Padding the quote slot when no quote exists.** Better to return
   `quotes: []` than to invent one.
5. **Cause-of-death "quotes"** — lines from descriptions of final
   illness, mistaken for editorial pull-quotes.
