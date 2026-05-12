import { loadBootstrap, data } from './shard-loader.js';
import { open as openCard, esc } from './card.js';

const PX_PER_YEAR = 8;
const ROW_H = 6;
const ROW_GAP = 2;
const LEFT_PAD = 160;
const TOP_PAD = 36;
const NOW_YEAR = new Date().getFullYear();

await loadBootstrap();

// Coerce a born/died field (which may be YYYY, YYYY-MM or YYYY-MM-DD) to a
// decimal year (1934.45). Returns null if we can't.
function yearOf(iso) {
  if (!iso) return null;
  if (/^\d{4}$/.test(iso)) return Number(iso);
  if (/^\d{4}-\d{2}$/.test(iso)) {
    return Number(iso.slice(0, 4)) + (Number(iso.slice(5, 7)) - 1) / 12;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + d.getMonth() / 12 + d.getDate() / 365;
}

const rows = data.index.records
  .map((r) => ({ idx: r, born: yearOf(r.born), died: yearOf(r.died) }))
  .filter((r) => r.born != null || r.died != null);

const minYear = Math.floor(Math.min(...rows.map((r) => r.born ?? r.died ?? NOW_YEAR)) / 10) * 10;
const maxYear = Math.ceil(NOW_YEAR / 10) * 10;
const yearRange = maxYear - minYear;
const innerWidth = yearRange * PX_PER_YEAR;
const totalWidth = LEFT_PAD + innerWidth + 30;

populateFieldFilter();
renderRibbon(rows);

document.getElementById('field-filter').addEventListener('change', applyFilters);
document.getElementById('sort').addEventListener('change', applyFilters);
document.getElementById('q').addEventListener('input', debounce(applyFilters, 120));

function applyFilters() {
  const field = document.getElementById('field-filter').value;
  const sort = document.getElementById('sort').value;
  const q = document.getElementById('q').value.trim().toLowerCase();
  let r = rows.slice();
  if (field) r = r.filter((x) => x.idx.field === field);
  if (q) r = r.filter((x) =>
    (x.idx.name + ' ' + (x.idx.one_line ?? '') + ' ' + (x.idx.field ?? ''))
      .toLowerCase().includes(q));
  if (sort === 'born') r.sort((a, b) => (a.born ?? Infinity) - (b.born ?? Infinity));
  else if (sort === 'died') r.sort((a, b) => (b.died ?? -Infinity) - (a.died ?? -Infinity));
  else r.sort((a, b) => a.idx.name.localeCompare(b.idx.name));
  renderRibbon(r);
  document.getElementById('count').textContent = `${r.length} ${r.length === 1 ? 'life' : 'lives'}`;
}

function populateFieldFilter() {
  const fields = [...new Set(rows.map((r) => r.idx.field).filter(Boolean))].sort();
  const sel = document.getElementById('field-filter');
  for (const f of fields) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  }
  document.getElementById('count').textContent = `${rows.length} lives`;
}

function renderRibbon(items) {
  const height = TOP_PAD + items.length * (ROW_H + ROW_GAP) + 20;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'ribbon-svg');
  svg.setAttribute('width', totalWidth);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${height}`);

  // axis
  for (let y = minYear; y <= maxYear; y += 10) {
    const x = LEFT_PAD + (y - minYear) * PX_PER_YEAR;
    const tick = document.createElementNS(svgNS, 'line');
    tick.setAttribute('x1', x);
    tick.setAttribute('x2', x);
    tick.setAttribute('y1', 8);
    tick.setAttribute('y2', height - 8);
    tick.setAttribute('class', 'ribbon-axis-tick');
    tick.setAttribute('opacity', y % 50 === 0 ? '0.5' : '0.18');
    svg.appendChild(tick);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', 18);
    label.setAttribute('class', 'ribbon-axis-label');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = y;
    svg.appendChild(label);
  }

  // lines
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const yPos = TOP_PAD + i * (ROW_H + ROW_GAP);

    const born = r.born ?? r.died - 70;
    const died = r.died ?? r.born + 70;
    const x1 = LEFT_PAD + (born - minYear) * PX_PER_YEAR;
    const x2 = LEFT_PAD + (died - minYear) * PX_PER_YEAR;

    // name to the left of each line
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', LEFT_PAD - 8);
    label.setAttribute('y', yPos + ROW_H);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'ribbon-axis-label');
    label.setAttribute('fill', 'var(--ink-2)');
    label.textContent = r.idx.name.length > 22 ? r.idx.name.slice(0, 20) + '…' : r.idx.name;
    svg.appendChild(label);

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('x2', x2);
    line.setAttribute('y1', yPos + ROW_H / 2);
    line.setAttribute('y2', yPos + ROW_H / 2);
    line.setAttribute('class', 'ribbon-line' + ((!r.born || !r.died) ? ' unknown' : ''));
    line.setAttribute('tabindex', '0');
    line.setAttribute('role', 'button');
    line.setAttribute('aria-label', `${r.idx.name}, ${r.idx.field ?? ''}`);
    line.addEventListener('click', () => openCard(r.idx, line));
    line.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCard(r.idx, line);
      }
    });
    svg.appendChild(line);
  }

  const wrap = document.getElementById('ribbon-wrap');
  wrap.innerHTML = '';
  wrap.appendChild(svg);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
