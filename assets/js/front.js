import { loadBootstrap, data } from './shard-loader.js';
import { open as openCard, esc, formatDates } from './card.js';

const today = new Date();
const mdToday = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
let quoteCursor = -1;

renderDate();
await loadBootstrap();
renderLanes();
renderQuote();
renderStrip();

function pad(n) { return String(n).padStart(2, '0'); }

function renderDate() {
  const day = today.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = today.toLocaleDateString('en-GB', { month: 'long' });
  document.getElementById('hero-date').innerHTML = `On this day <span class="day">${day} ${esc(month)}</span>`;
}

function renderLanes() {
  const buckets = data.onThisDay[mdToday] ?? [];
  const idxById = new Map(data.index.records.map((r) => [r.id, r]));

  const born = [], died = [], event = [];
  for (const b of buckets) {
    const idx = idxById.get(b.id);
    if (!idx) continue;
    if (b.reason === 'born') born.push({ idx });
    else if (b.reason === 'died') died.push({ idx });
    else event.push({ idx, event: b.event });
  }

  fillLane('lane-born', born, 'Nobody we know was born on this day. Try refreshing the page tomorrow.');
  fillLane('lane-died', died, 'Nobody we know died on this day.');
  fillLane('lane-event', event, 'No notable anniversaries hooked into our archive today.', true);
}

function fillLane(id, items, emptyText, showEvent = false) {
  const el = document.getElementById(id);
  if (items.length === 0) {
    el.innerHTML = `<li class="muted" style="font-size: var(--t-sm);">${esc(emptyText)}</li>`;
    return;
  }
  el.innerHTML = '';
  for (const { idx, event } of items) {
    const li = document.createElement('li');
    li.appendChild(obitCard(idx, event));
    el.appendChild(li);
  }
}

function obitCard(idx, eventLabel) {
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
      <p class="meta">${esc(idx.field ?? '')}${eventLabel ? ' · ' + esc(eventLabel) : ' · ' + formatDates(idx.born, idx.died)}</p>
    </div>
  `;
  btn.addEventListener('click', () => openCard(idx, btn));
  return btn;
}

// Quote roulette
function renderQuote() {
  if (!data.quotes || data.quotes.length === 0) {
    document.getElementById('quote-block').innerHTML = '<p class="muted">No quotes in the archive yet.</p>';
    return;
  }
  nextQuote();
  document.getElementById('quote-next').addEventListener('click', nextQuote);
}
function nextQuote() {
  const i = (quoteCursor + 1 + Math.floor(Math.random() * (data.quotes.length - 1))) % data.quotes.length;
  quoteCursor = i;
  const q = data.quotes[i];
  const speaker = q.speaker === 'obit writer' ? `${esc(q.name)}'s obituary writer` : esc(q.speaker);
  const block = document.getElementById('quote-block');
  block.innerHTML = `
    <p class="quote-text">${esc(q.text)}</p>
    <p class="quote-attrib">— <span class="speaker">${speaker}</span>, on <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a></p>
    <div class="quote-controls">
      <button id="quote-next" class="btn" type="button">Another quote</button>
    </div>
  `;
  document.getElementById('quote-next').addEventListener('click', nextQuote);
}

// Featured strip: last ~12 published
function renderStrip() {
  const recent = data.index.records.slice(0, 12);
  const el = document.getElementById('strip');
  el.innerHTML = '';
  for (const idx of recent) {
    const btn = document.createElement('button');
    btn.className = 'strip-card';
    btn.type = 'button';
    btn.setAttribute('aria-label', `Open obituary for ${idx.name}`);
    const thumb = idx.image
      ? `<img class="thumb" src="${esc(idx.image)}" alt="" loading="lazy">`
      : `<div class="thumb-fallback" aria-hidden="true"></div>`;
    btn.innerHTML = `
      ${thumb}
      <div class="body">
        <p class="name">${esc(idx.name)}</p>
        <p class="one-line">${esc(idx.one_line ?? idx.field ?? '')}</p>
      </div>
    `;
    btn.addEventListener('click', () => openCard(idx, btn));
    el.appendChild(btn);
  }
}
