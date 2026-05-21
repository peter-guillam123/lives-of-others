import { loadBootstrap, data } from './shard-loader.js';
import { open as openCard, esc, formatDates } from './card.js';

const today = new Date();
const mdToday = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
let quoteCursor = -1;
const COLOURWAYS = ['A', 'B', 'C', 'D'];

renderHero();
await loadBootstrap();
renderLanes();
renderQuote();
renderStrip();
wireStripArrows();

function pad(n) { return String(n).padStart(2, '0'); }

function renderHero() {
  const day = today.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = today.toLocaleDateString('en-GB', { month: 'long' });
  document.getElementById('hero-eyebrow').textContent =
    today.toLocaleDateString('en-GB', { weekday: 'long' }) + ' · ' + day + ' ' + month;
  document.getElementById('hero-headline').innerHTML =
    `On this day in <em>lives</em>.`;
}

function renderLanes() {
  const buckets = data.onThisDay[mdToday] ?? [];
  const idxById = new Map(data.index.records.map((r) => [r.id, r]));

  const born = [], died = [], event = [];
  for (const b of buckets) {
    const idx = idxById.get(b.id);
    if (!idx) continue;
    if (b.reason === 'born') born.push({ idx, reason: 'born' });
    else if (b.reason === 'died') died.push({ idx, reason: 'died' });
    else event.push({ idx, reason: 'event', event: b.event });
  }

  fillLane('lane-born', born, 'Nobody we know shares today’s birthday.');
  fillLane('lane-died', died, 'No deaths landed on today’s date.');
  fillLane('lane-event', event, 'No anniversaries hook into our archive today.');
}

function fillLane(id, items, emptyText) {
  const el = document.getElementById(id);
  if (items.length === 0) {
    el.innerHTML = `<li class="empty">${esc(emptyText)}</li>`;
    return;
  }
  el.innerHTML = '';
  // Cap to 4 per lane — keeps the cells visually balanced.
  for (const item of items.slice(0, 4)) {
    const li = document.createElement('li');
    li.appendChild(obitCard(item));
    el.appendChild(li);
  }
}

function obitCard({ idx, reason, event }) {
  const btn = document.createElement('button');
  btn.className = 'obit-card';
  btn.type = 'button';
  btn.setAttribute('aria-label', `Open obituary for ${idx.name}`);
  const initial = (idx.name?.[0] ?? '·').toUpperCase();
  const thumb = idx.image
    ? `<img class="thumb" src="${esc(idx.image)}" alt="" loading="lazy">`
    : `<span class="thumb-fallback" aria-hidden="true">${esc(initial)}</span>`;
  btn.innerHTML = `
    ${thumb}
    <div>
      <p class="name">${esc(idx.name)}</p>
      <p class="one-line">${esc(idx.one_line ?? '')}</p>
      <p class="meta">${esc(metaFor(idx, reason, event))}</p>
    </div>
  `;
  btn.addEventListener('click', () => openCard(idx, btn));
  return btn;
}

// What we say below each card. For "event" we put the world event front and
// centre (that's the point); for born/died we use the field + lifespan.
function metaFor(idx, reason, event) {
  if (reason === 'event' && event) return event;
  const f = idx.field ?? '';
  const dates = formatDates(idx.born, idx.died);
  return f ? `${f} · ${dates}` : dates;
}

// ---- Quote roulette ----

function renderQuote() {
  if (!data.quotes || data.quotes.length === 0) {
    document.getElementById('quote-block').innerHTML = '<p class="quote-attrib">No quotes in the archive yet.</p>';
    return;
  }
  nextQuote();
}

function nextQuote() {
  if (data.quotes.length === 0) return;
  const i = data.quotes.length === 1
    ? 0
    : (quoteCursor + 1 + Math.floor(Math.random() * (data.quotes.length - 1))) % data.quotes.length;
  quoteCursor = i;
  const q = data.quotes[i];
  // Two distinct attributions: spoken by the subject, or paraphrased by the writer.
  const attrib = (q.speaker && q.speaker !== 'obit writer' && q.speaker.toLowerCase() !== q.name.toLowerCase())
    ? `${esc(q.speaker)}, on <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a>`
    : (q.speaker === 'obit writer'
        ? `on <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a>`
        : `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a>`);
  const block = document.getElementById('quote-block');
  block.innerHTML = `
    <p class="quote-text">${esc(q.text)}</p>
    <p class="quote-attrib">— ${attrib}</p>
    <div class="quote-controls">
      <button id="quote-next" class="btn-mono" type="button">Another quote</button>
    </div>
  `;
  document.getElementById('quote-next').addEventListener('click', nextQuote);
}

// ---- Recently published strip ----

function renderStrip() {
  const recent = data.index.records.slice(0, 12);
  const el = document.getElementById('strip');
  el.innerHTML = '';
  recent.forEach((idx, i) => {
    const btn = document.createElement('button');
    btn.className = 'strip-card';
    btn.type = 'button';
    btn.dataset.cw = COLOURWAYS[i % COLOURWAYS.length];
    btn.setAttribute('aria-label', `Open obituary for ${idx.name}`);
    const published = idx.published ? formatPublished(idx.published) : '';
    btn.innerHTML = `
      <div class="meta">
        <span>${esc(idx.field ?? 'Obituary')}</span>
        <span>${esc(published)}</span>
      </div>
      <div>
        <p class="name">${esc(idx.name)}</p>
        <p class="one-line">${esc(idx.one_line ?? '')}</p>
      </div>
    `;
    btn.addEventListener('click', () => openCard(idx, btn));
    el.appendChild(btn);
  });
}

function formatPublished(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}

function wireStripArrows() {
  const strip = document.getElementById('strip');
  const prev = document.getElementById('strip-prev');
  const next = document.getElementById('strip-next');
  if (!strip || !prev || !next) return;
  const step = () => Math.round(strip.clientWidth * 0.85);
  prev.addEventListener('click', () => strip.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => strip.scrollBy({ left: step(), behavior: 'smooth' }));
  const updateDisabled = () => {
    prev.disabled = strip.scrollLeft <= 4;
    next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
  };
  strip.addEventListener('scroll', updateDisabled, { passive: true });
  // run after layout settles
  requestAnimationFrame(updateDisabled);
}
