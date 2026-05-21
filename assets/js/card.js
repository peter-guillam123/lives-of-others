// Shared micro-card modal. open(idxEntry) loads the full record and renders it.
// Keyboard: Esc closes, focus is trapped, focus returns to the trigger.
import { loadRecord } from './shard-loader.js';

let lastTrigger = null;
let scrim = null;

export async function open(idxEntry, trigger) {
  lastTrigger = trigger ?? document.activeElement;
  showScrim(renderSkeleton(idxEntry));
  try {
    const record = await loadRecord(idxEntry);
    if (!scrim) return;
    scrim.querySelector('.modal').replaceWith(renderModal(record));
    focusFirstInModal();
  } catch (err) {
    if (scrim) scrim.querySelector('.modal').replaceWith(renderError(err));
  }
}

function showScrim(modalEl) {
  close();
  scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.appendChild(modalEl);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  focusFirstInModal();
}

export function close() {
  if (!scrim) return;
  scrim.remove();
  scrim = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKey);
  if (lastTrigger && typeof lastTrigger.focus === 'function') {
    lastTrigger.focus();
  }
}

function onKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'Tab' && scrim) {
    const focusables = scrim.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function focusFirstInModal() {
  const btn = scrim?.querySelector('.modal-close');
  if (btn) btn.focus();
}

function renderSkeleton(idx) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <p class="eyebrow">${esc(idx.field ?? 'Obituary')}</p>
    <h2>${esc(idx.name)}</h2>
    <p class="dates">${formatDates(idx.born, idx.died)}</p>
    <p class="one-line">Loading…</p>
  `;
  m.querySelector('.modal-close').addEventListener('click', close);
  return m;
}

function renderError(err) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    <h2>Could not load</h2>
    <p class="muted">${esc(err.message ?? String(err))}</p>
  `;
  m.querySelector('.modal-close').addEventListener('click', close);
  return m;
}

function renderModal(r) {
  const m = document.createElement('div');
  m.className = 'modal';
  const thumb = r.thumbnail
    ? `<img class="modal-thumb" src="${esc(r.thumbnail)}" alt="">`
    : '';
  // Avoid the "Kameny, on Franklin Edward Kameny" repetition: if speaker is
  // the subject, drop the cite line — the quote is clearly theirs in context.
  const quoteSpeaker = r.best_quote?.speaker;
  const speakerIsSubject = quoteSpeaker && r.name && quoteSpeaker.toLowerCase() === r.name.toLowerCase();
  const quoteCite = quoteSpeaker
    ? (speakerIsSubject
        ? ''
        : (quoteSpeaker === 'obit writer'
            ? `<cite>— the obit writer, on ${esc(r.name)}</cite>`
            : `<cite>— ${esc(quoteSpeaker)}, on ${esc(r.name)}</cite>`))
    : '';
  const quote = r.best_quote && r.best_quote.text
    ? `<blockquote>${esc(r.best_quote.text)}${quoteCite}</blockquote>`
    : '';
  const themes = (r.themes ?? []).length
    ? `<ul class="themes">${r.themes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
  m.innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    ${thumb}
    <p class="eyebrow">${esc(r.field ?? 'Obituary')}</p>
    <h2>${esc(r.name)}</h2>
    <p class="dates">${formatDates(r.born, r.died)}</p>
    <p class="one-line">${esc(r.one_line ?? '')}</p>
    ${quote}
    ${themes}
    <div class="modal-footer">
      <span class="byline">${r.byline ? 'Obit by ' + esc(r.byline) : ''}</span>
      <a class="read-link" href="${esc(r.url)}" target="_blank" rel="noopener">Read at the Guardian →</a>
    </div>
  `;
  m.querySelector('.modal-close').addEventListener('click', close);
  return m;
}

export function formatDates(born, died) {
  return `${formatDate(born)} — ${formatDate(died)}`;
}
function formatDate(iso) {
  if (!iso) return '?';
  if (/^\d{4}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}$/.test(iso)) return formatMonthYear(iso + '-01').replace(/ 1$/, '');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatMonthYear(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}
