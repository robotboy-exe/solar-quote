// User interface: screens, events, WhatsApp and print. Calculations live in sizing.js / quote.js.

import { load, save, exportJSON, importJSON, newQuote, duplicateQuote, uid } from './store.js';
import { PRESETS, CATEGORIES, STATUSES } from './data.js';
import { DEFAULT_ASSUMPTIONS, workings } from './sizing.js';
import { buildQuote, systemSummary, whatsappText, pickInverter, pickBattery, pickController } from './quote.js';
import { naira, num, parseNum, date, addDays, waPhone, esc } from './format.js';

let state = load();
const view = document.getElementById('view');
const $ = (sel) => view.querySelector(sel);
// Called when focus leaves an element in the current screen ("focusout" has no on- property, so one shared listener).
let onLeave = null;
view.addEventListener('focusout', () => onLeave && onLeave());
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- saving ----------
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!save(state)) toast('Could not save — browser storage is full or blocked. Download a backup from Profile.', true);
}
function persistSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); }
window.addEventListener('pagehide', () => { if (saveTimer) persist(); });

let toastTimer = 0;
function toast(msg, bad = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'no-print show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'no-print'; }, bad ? 6000 : 2500);
}

// ---------- small HTML helpers ----------
const opt = (value, label, selected) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
const field = (label, input, cls = '') => `<label class="${cls}">${esc(label)}${input}</label>`;
const numIn = (attr, v, dp = 2) => `<input ${attr} inputmode="decimal" autocomplete="off" value="${esc(num(v, dp))}">`;
const textIn = (attr, v, type = 'text') => `<input ${attr} type="${type}" autocomplete="off" value="${esc(v)}">`;
const check = (attr, on, label) => `<label class="check"><input type="checkbox" ${attr}${on ? ' checked' : ''}> ${esc(label)}</label>`;
const statusSelect = (attr, s) => `<select ${attr} class="status s-${s}">${STATUSES.map((x) => opt(x, x[0].toUpperCase() + x.slice(1), s)).join('')}</select>`;

/** Put formatted numbers back in numeric fields after the user leaves them. */
function reformat(el) {
  if (el.getAttribute('inputmode') === 'decimal') el.value = num(parseNum(el.value), 2);
}

// ---------- router ----------
function route() {
  if (saveTimer) persist();
  const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  const tab = parts[0] === 'prices' || parts[0] === 'profile' ? parts[0] : 'quotes';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  view.oninput = view.onchange = view.onclick = onLeave = null;
  window.scrollTo(0, 0);
  if (!parts.length) return renderList();
  if (parts[0] === 'prices') return renderPrices();
  if (parts[0] === 'profile') return renderProfile();
  const q = parts[0] === 'q' && state.quotes.find((x) => x.id === parts[1]);
  if (q) return parts[2] === 'view' ? renderPreview(q) : renderEditor(q);
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

// ---------- quotes list ----------
function renderList() {
  const p = state.profile;
  view.innerHTML = `
    ${!p.name ? '<p class="note">First time? Add your business name and phone in <a href="#/profile">Profile</a>, then edit the <a href="#/prices">sample prices</a> to your own.</p>' : ''}
    <div class="row-between"><h1>Quotes</h1><button class="btn primary" data-act="new">+ New quote</button></div>
    <input type="search" id="search" placeholder="Search by client name or phone" aria-label="Search quotes">
    <div id="qlist"></div>`;
  const draw = () => {
    const term = $('#search').value.trim().toLowerCase();
    const list = state.quotes
      .filter((q) => !term || `${q.client.name} ${q.client.phone}`.toLowerCase().includes(term))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    $('#qlist').innerHTML = list.length ? list.map((q) => `
      <article class="card qcard">
        <a class="qmain" href="#/q/${esc(q.id)}">
          <strong>${esc(q.client.name || '(no client name)')}</strong>
          <span class="muted">${esc(q.no)} · ${date(q.updatedAt)}</span>
          <span class="amt">${naira(q.total)}</span>
        </a>
        <div class="qtools">
          ${statusSelect(`data-status="${esc(q.id)}" aria-label="Status"`, q.status)}
          <button class="btn small" data-act="dup" data-id="${esc(q.id)}">Duplicate</button>
          <button class="btn small danger" data-act="del" data-id="${esc(q.id)}">Delete</button>
        </div>
      </article>`).join('')
      : `<p class="empty">${term ? 'No quotes match your search.' : 'No quotes yet. Tap <b>+ New quote</b> to start.'}</p>`;
  };
  draw();
  view.oninput = (e) => { if (e.target.id === 'search') draw(); };
  view.onchange = (e) => {
    const id = e.target.dataset.status;
    const q = id && state.quotes.find((x) => x.id === id);
    if (!q) return;
    q.status = e.target.value;
    e.target.className = 'status s-' + q.status;
    persist();
  };
  view.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const q = state.quotes.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === 'new') {
      const nq = newQuote(state);
      state.quotes.push(nq);
      persist();
      location.hash = '#/q/' + nq.id;
    } else if (b.dataset.act === 'dup' && q) {
      state.quotes.push(duplicateQuote(state, q));
      persist(); draw();
      toast('Copied as a new draft with your current prices.');
    } else if (b.dataset.act === 'del' && q && confirm(`Delete quote ${q.no} for ${q.client.name || 'no name'}? This cannot be undone.`)) {
      state.quotes = state.quotes.filter((x) => x !== q);
      persist(); draw();
    }
  };
}

// ---------- quote editor ----------
const ASSUMPTION_FIELDS = [
  ['peakSunHours', 'Peak sun hours per day', 1],
  ['panelDerate', 'Panel derate (0–1)', 1],
  ['batteryShare', 'Battery share of daily energy %', 100],
  ['dodLithium', 'Lithium usable depth (0–1)', 1],
  ['dodLead', 'Lead-acid usable depth (0–1)', 1],
  ['batteryEfficiency', 'Battery efficiency (0–1)', 1],
  ['designMargin', 'Inverter margin ×', 1],
  ['powerFactor', 'Power factor', 1],
  ['v12MaxKva', '12 V system up to kVA', 1],
  ['v24MaxKva', '24 V system up to kVA', 1],
  ['controllerSafety', 'Charge controller safety ×', 1],
];
const LINE_KEY_FOR_CHOICE = { panelId: 'panel', inverterId: 'inverter', batteryId: 'battery', batteryChem: 'battery', controllerId: 'controller' };

function renderEditor(q) {
  const a = q.assumptions;
  view.innerHTML = `
    <div class="row-between"><a href="#/" class="back">← All quotes</a><span class="muted">${esc(q.no)} · ${date(q.createdAt)}</span></div>
    <section class="card">
      <h2>Client</h2>
      <div class="grid2">
        ${field('Client name', textIn('data-f="client.name"', q.client.name))}
        ${field('Client phone (for WhatsApp)', textIn('data-f="client.phone" inputmode="tel"', q.client.phone, 'tel'))}
      </div>
      ${field('Status', statusSelect('data-f="status"', q.status))}
    </section>

    <section class="card">
      <h2>Appliances</h2>
      <div id="aps"></div>
      <div class="addrow">
        <select id="preset" aria-label="Appliance preset"><option value="">Choose an appliance…</option>${PRESETS.map((p, i) => opt(i, `${p.name} — ${num(p.watts)} W`)).join('')}</select>
        <button class="btn" data-act="add-preset">Add</button>
      </div>
      <button class="btn ghost" data-act="add-custom">+ Custom appliance</button>
    </section>

    <section class="card"><h2>System size</h2><div id="summary"></div></section>
    <section class="card"><h2>Equipment</h2><div id="choices" class="grid2"></div></section>

    <details class="card" id="workings">
      <summary>Show workings</summary>
      <ol id="steps" class="steps"></ol>
      <h3>Assumptions (edit to suit this job)</h3>
      <div class="grid2" id="assume">
        ${ASSUMPTION_FIELDS.map(([k, label, scale]) => field(label, numIn(`data-a="${k}" data-scale="${scale}"`, a[k] * scale, 3))).join('')}
        ${field('Standard inverter sizes, kVA', textIn('data-a="inverterSizes"', a.inverterSizes.join(', ')))}
      </div>
      <button class="btn ghost" data-act="reset-assume">Reset to standard values</button>
    </details>

    <section class="card">
      <h2>Quote</h2>
      <div id="lines"></div>
      <button class="btn ghost" data-act="add-line">+ Add line</button>
      <div class="grid3">
        ${field('Labour %', numIn('data-f="labourPct"', q.labourPct))}
        ${check('data-f="vatOn"', q.vatOn, 'Add VAT')}
        ${field('VAT rate %', numIn('data-f="vatRate"', q.vatRate))}
      </div>
      <div id="totals"></div>
      <p class="muted small">Prices copied from your price list on ${date(q.catalogueAt || q.createdAt)}. <button class="link" data-act="reprice">Use current prices</button></p>
    </section>

    <section class="card">
      <h2>Terms</h2>
      ${field('Quote valid for (days)', numIn('data-f="validityDays"', q.validityDays, 0))}
      ${field('Payment terms', `<textarea data-f="paymentTerms" rows="2">${esc(q.paymentTerms)}</textarea>`)}
      ${field('Notes', `<textarea data-f="notes" rows="3">${esc(q.notes)}</textarea>`)}
    </section>

    <div class="actionbar no-print">
      <span id="bar-total" class="amt"></span>
      <a class="btn primary" href="#/q/${esc(q.id)}/view">Preview &amp; PDF</a>
      <button class="btn wa" data-act="wa">WhatsApp</button>
    </div>`;

  let b;
  const touch = () => { q.updatedAt = new Date().toISOString(); q.total = b.total; persistSoon(); };

  const drawAppliances = () => {
    $('#aps').innerHTML = q.appliances.length ? q.appliances.map((ap) => `
      <div class="ap" data-id="${esc(ap.id)}">
        <div class="ap-top">${textIn('data-ap="name" aria-label="Appliance name" placeholder="Appliance name"', ap.name)}
          <button class="icon" data-act="ap-del" aria-label="Remove ${esc(ap.name)}">✕</button></div>
        <div class="grid4">
          ${field('Watts', numIn('data-ap="watts"', ap.watts))}
          ${field('Qty', numIn('data-ap="qty"', ap.qty))}
          ${field('Hours/day', numIn('data-ap="hours"', ap.hours))}
          ${field('Surge ×', numIn('data-ap="surge"', ap.surge))}
        </div>
      </div>`).join('') : '<p class="empty">No appliances yet. Choose one below.</p>';
  };

  const stat = (label, value, sub = '') => `<div class="stat"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const drawSummary = () => {
    const s = b.sizing;
    $('#summary').innerHTML = `<div class="stats">
      ${stat('Connected load', num(s.connected) + ' W')}
      ${stat('Peak (with surge)', num(s.peak) + ' W')}
      ${stat('Daily energy', num(s.daily) + ' Wh')}
      ${stat('Inverter', num(s.inverter.kva, 1) + ' kVA', s.voltage ? s.voltage + ' V system' : '')}
      ${stat('Battery', num(s.battery.ahRounded) + ' Ah', `${s.chem === 'lead' ? 'lead-acid' : 'lithium'} at ${s.voltage} V`)}
      ${stat('Panels', `${s.panels.count} × ${num(s.panels.panelWatts)} W`, num(s.panels.arrayW) + ' W array')}
    </div>
    ${b.warnings.length ? `<ul class="warn">${b.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    $('#steps').innerHTML = workings(s).map((t) => `<li>${esc(t)}</li>`).join('');
  };

  const drawChoices = () => {
    const cat = q.catalogue, ch = q.choices, s = b.sizing;
    const of = (c) => cat.filter((i) => i.cat === c);
    const autoInv = pickInverter(cat, s.inverter.kva, s.voltage);
    const autoBat = pickBattery(cat, s.chem, s.battery.ah, s.voltage);
    const autoCtl = pickController(cat, s.controllerA, b.inverter);
    const autoLabel = (x, none = 'nothing suitable') => 'Auto — ' + (x ? x.name : none);
    $('#choices').innerHTML = `
      ${field('Solar panel', `<select data-c="panelId">${of('panel').map((i) => opt(i.id, i.name, b.panel?.id)).join('')}</select>`)}
      ${field('Battery type', `<select data-c="batteryChem">${opt('lithium', 'Lithium', ch.batteryChem)}${opt('lead', 'Lead-acid', ch.batteryChem)}</select>`)}
      ${field('Battery', `<select data-c="batteryId">${opt('auto', autoLabel(autoBat && autoBat.item), ch.batteryId)}${of('battery').map((i) => opt(i.id, i.name, ch.batteryId)).join('')}</select>`)}
      ${field('Inverter', `<select data-c="inverterId">${opt('auto', autoLabel(autoInv), ch.inverterId)}${of('inverter').map((i) => opt(i.id, i.name, ch.inverterId)).join('')}</select>`)}
      ${field('Charge controller', `<select data-c="controllerId">${opt('auto', autoLabel(autoCtl && autoCtl.item, b.inverter?.pvMaxW > 0 ? 'not needed (inverter has solar charger)' : 'none'), ch.controllerId)}${opt('none', 'None', ch.controllerId)}${of('controller').map((i) => opt(i.id, i.name, ch.controllerId)).join('')}</select>`)}`;
  };

  const drawLines = () => {
    const removed = (q.removed || []).length;
    $('#lines').innerHTML = (b.lines.length ? b.lines.map((l) => `
      <div class="line${l.overridden ? ' edited' : ''}" data-key="${esc(l.key)}">
        ${textIn('data-l="desc" aria-label="Description"', l.desc)}
        <div class="line-nums">
          ${field('Qty', numIn('data-l="qty"', l.qty))}
          ${field('Unit price ₦', numIn('data-l="price"', l.price))}
          <div class="line-amt">${naira(l.qty * l.price)}</div>
        </div>
        <div class="line-tools">
          ${l.overridden ? `<span class="tag">edited</span><button class="link" data-act="l-reset">Reset to ${esc(naira(l.calc.price))} × ${num(l.calc.qty, 2)}</button>` : ''}
          <button class="link danger" data-act="l-del">Remove</button>
        </div>
      </div>`).join('') : '<p class="empty">Add appliances to build the quote.</p>')
      + (removed ? `<button class="link" data-act="l-restore">Bring back ${removed} removed line${removed > 1 ? 's' : ''}</button>` : '');
  };

  const drawTotals = () => {
    $('#totals').innerHTML = `<table class="totals">
      <tr><td>Subtotal</td><td>${naira(b.subtotal)}</td></tr>
      ${q.vatOn ? `<tr><td>VAT (${num(q.vatRate, 2)}%)</td><td>${naira(b.vat)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td>${naira(b.total)}</td></tr></table>`;
    $('#bar-total').textContent = naira(b.total);
  };

  /** Recalculate and redraw everything that depends on the numbers. */
  const refresh = () => {
    b = buildQuote(q);
    drawSummary();
    drawChoices();
    if (!$('#lines').contains(document.activeElement)) drawLines();
    drawTotals();
    touch();
  };

  const setField = (el) => {
    const f = el.dataset.f;
    if (f === 'client.name' || f === 'client.phone') q.client[f.split('.')[1]] = el.value;
    else if (f === 'vatOn') q.vatOn = el.checked;
    else if (['labourPct', 'vatRate', 'validityDays'].includes(f)) q[f] = parseNum(el.value);
    else q[f] = el.value;
    if (f === 'status') el.className = 'status s-' + q.status;
  };

  const lineEdit = (el) => {
    const row = el.closest('.line');
    const key = row.dataset.key;
    const val = el.dataset.l === 'desc' ? el.value : parseNum(el.value);
    if (key.startsWith('custom:')) {
      const c = q.custom.find((x) => 'custom:' + x.id === key);
      if (c) c[el.dataset.l] = val;
    } else {
      q.overrides[key] = { ...(q.overrides[key] || {}), [el.dataset.l]: val };
    }
    b = buildQuote(q);
    // Update amounts (and the labour price, which follows the equipment total) without redrawing the row being typed in.
    for (const r of view.querySelectorAll('#lines .line')) {
      const l = b.lines.find((x) => x.key === r.dataset.key);
      if (!l) continue;
      r.querySelector('.line-amt').textContent = naira(l.qty * l.price);
      if (r !== row) r.querySelector('[data-l="price"]').value = num(l.price, 2);
    }
    drawTotals();
    touch();
  };

  view.oninput = (e) => {
    const t = e.target;
    if (t.dataset.f) { setField(t); refresh(); }
    else if (t.dataset.ap) {
      const ap = q.appliances.find((x) => x.id === t.closest('.ap').dataset.id);
      ap[t.dataset.ap] = t.dataset.ap === 'name' ? t.value : parseNum(t.value);
      refresh();
    } else if (t.dataset.a) {
      const k = t.dataset.a;
      if (k === 'inverterSizes') q.assumptions[k] = t.value.split(/[\s,;]+/).map(Number).filter((x) => x > 0);
      else q.assumptions[k] = parseNum(t.value) / Number(t.dataset.scale);
      refresh();
    } else if (t.dataset.l) lineEdit(t);
  };

  view.onchange = (e) => {
    const t = e.target;
    reformat(t);
    if (t.dataset.f) { setField(t); refresh(); }
    else if (t.dataset.c) {
      q.choices[t.dataset.c] = t.value;
      delete q.overrides[LINE_KEY_FOR_CHOICE[t.dataset.c]]; // new model → its own price
      refresh();
    }
  };

  // Redraw the lines (edited tags, reset buttons) once the user has left the quote table.
  onLeave = () => setTimeout(() => {
    const lines = $('#lines');
    if (lines && !lines.contains(document.activeElement)) drawLines();
  }, 0);

  view.onclick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const key = btn.closest('.line')?.dataset.key;
    if (act === 'add-preset') {
      const p = PRESETS[$('#preset').value];
      if (!p) return toast('Choose an appliance from the list first.');
      const same = q.appliances.find((x) => x.name === p.name);
      if (same) same.qty += 1; else q.appliances.push({ id: uid(), ...p, qty: 1 });
      $('#preset').value = '';
      drawAppliances();
    } else if (act === 'add-custom') {
      q.appliances.push({ id: uid(), name: '', watts: 0, qty: 1, hours: 1, surge: 1 });
      drawAppliances();
      view.querySelector('.ap:last-child input').focus();
    } else if (act === 'ap-del') {
      q.appliances = q.appliances.filter((x) => x.id !== btn.closest('.ap').dataset.id);
      drawAppliances();
    } else if (act === 'reset-assume') {
      q.assumptions = clone(DEFAULT_ASSUMPTIONS);
      view.querySelectorAll('[data-a]').forEach((el) => {
        const k = el.dataset.a;
        el.value = k === 'inverterSizes' ? q.assumptions[k].join(', ') : num(q.assumptions[k] * el.dataset.scale, 3);
      });
    } else if (act === 'add-line') {
      q.custom.push({ id: uid(), desc: '', qty: 1, price: 0 });
      b = buildQuote(q); drawLines(); drawTotals(); touch();
      const rows = view.querySelectorAll('#lines .line');
      return rows[rows.length - 1].querySelector('input').focus();
    } else if (act === 'l-reset') {
      delete q.overrides[key];
    } else if (act === 'l-del') {
      if (key.startsWith('custom:')) q.custom = q.custom.filter((x) => 'custom:' + x.id !== key);
      else { q.removed.push(key); delete q.overrides[key]; }
    } else if (act === 'l-restore') {
      q.removed = [];
    } else if (act === 'reprice') {
      if (!confirm('Replace this quote\'s prices with your current price list? Lines you edited by hand keep your edits.')) return;
      q.catalogue = clone(state.catalogue);
      q.catalogueAt = new Date().toISOString();
      toast('Prices updated.');
      return renderEditor(q);
    } else if (act === 'wa') {
      return shareWhatsApp(q, b);
    } else return;
    b = buildQuote(q);
    drawLines();
    refresh();
  };

  b = buildQuote(q);
  drawAppliances();
  drawSummary();
  drawChoices();
  drawLines();
  drawTotals();
}

// ---------- WhatsApp ----------
function shareWhatsApp(q, b) {
  const url = `https://wa.me/${waPhone(q.client.phone)}?text=${encodeURIComponent(whatsappText(q, b, state.profile))}`;
  window.open(url, '_blank', 'noopener');
  if (q.status === 'draft') {
    q.status = 'sent';
    view.querySelectorAll('select[data-f="status"]').forEach((el) => { el.value = 'sent'; el.className = 'status s-sent'; });
    toast('Marked as sent.');
  }
  q.updatedAt = new Date().toISOString();
  persist();
}

// ---------- preview / print ----------
function renderPreview(q) {
  const p = state.profile;
  const b = buildQuote(q);
  const s = b.sizing;
  view.innerHTML = `
    <div class="row-between no-print">
      <a href="#/q/${esc(q.id)}" class="back">← Edit quote</a>
      <div class="btns"><button class="btn primary" data-act="print">Print / Save PDF</button><button class="btn wa" data-act="wa">WhatsApp</button></div>
    </div>
    <article class="doc">
      <header class="doc-head">
        <div class="biz">
          ${p.logo ? `<img src="${esc(p.logo)}" alt="" class="logo">` : ''}
          <div><h2>${esc(p.name || 'Your business name')}</h2>
          <p>${esc(p.address).replace(/\n/g, '<br>')}${p.address && p.phone ? '<br>' : ''}${esc(p.phone)}</p></div>
        </div>
        <div class="doc-meta"><h1>Quotation</h1>
          <p><b>No:</b> ${esc(q.no)}<br><b>Date:</b> ${date(q.createdAt)}<br><b>Valid until:</b> ${date(addDays(q.createdAt, q.validityDays))}</p></div>
      </header>
      <section class="doc-to"><h3>Prepared for</h3><p>${esc(q.client.name || '—')}${q.client.phone ? '<br>' + esc(q.client.phone) : ''}</p></section>
      ${b.lines.length ? `<section><h3>Proposed solar system</h3><p><b>${esc(systemSummary(b))}</b></p>
        <p class="muted">Designed to power: ${esc(s.appliances.filter((x) => x.qty > 0).map((x) => `${num(x.qty, 2)} × ${x.name || 'appliance'}`).join(', '))}.
        Daily energy ${num(s.daily)} Wh · peak load ${num(s.peak)} W.</p></section>` : ''}
      <table class="doc-table">
        <thead><tr><th class="n">#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
        <tbody>${b.lines.map((l, i) => `<tr><td class="n">${i + 1}</td><td>${esc(l.desc)}</td><td class="r">${num(l.qty, 2)}</td><td class="r">${naira(l.price)}</td><td class="r">${naira(l.qty * l.price)}</td></tr>`).join('')}</tbody>
        <tfoot>
          ${q.vatOn ? `<tr><td colspan="4">Subtotal</td><td class="r">${naira(b.subtotal)}</td></tr><tr><td colspan="4">VAT (${num(q.vatRate, 2)}%)</td><td class="r">${naira(b.vat)}</td></tr>` : ''}
          <tr class="grand"><td colspan="4">Total</td><td class="r">${naira(b.total)}</td></tr>
        </tfoot>
      </table>
      <section class="doc-terms">
        ${q.paymentTerms ? `<h3>Payment terms</h3><p>${esc(q.paymentTerms)}</p>` : ''}
        ${q.notes ? `<h3>Notes</h3><p>${esc(q.notes).replace(/\n/g, '<br>')}</p>` : ''}
        <p class="muted">This quotation is valid for ${num(q.validityDays)} days, until ${date(addDays(q.createdAt, q.validityDays))}.</p>
      </section>
    </article>`;
  view.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'print') window.print();
    if (act === 'wa') shareWhatsApp(q, b);
  };
}

// ---------- price list ----------
const VOLTS = [12, 24, 48];
const ITEM_FIELDS = {
  panel: [['watts', 'Watts']],
  inverter: [['kva', 'kVA'], ['voltage', 'Battery volts', VOLTS], ['pvMaxW', 'PV input limit W (0 = no solar charger)']],
  battery: [['chem', 'Type', [['lithium', 'Lithium'], ['lead', 'Lead-acid']]], ['ah', 'Ah'], ['voltage', 'Volts', VOLTS]],
  controller: [['amps', 'Amps'], ['pvMaxW', 'PV limit W (from its label)']],
  extra: [['per', 'Quantity is', [['job', 'per job'], ['panel', 'per panel']]], ['qty', 'Default qty'], ['include', 'Add to new quotes automatically', 'check']],
};
const NEW_ITEM = {
  panel: { watts: 550 }, inverter: { kva: 1, voltage: 12, pvMaxW: 0 }, battery: { chem: 'lithium', ah: 200, voltage: 12 },
  controller: { amps: 60, pvMaxW: 2000 }, extra: { unit: 'pcs', per: 'job', qty: 1, include: true },
};
const fieldsFor = (cat) => ITEM_FIELDS[cat] || ITEM_FIELDS.extra;

function renderPrices() {
  view.innerHTML = `
    <h1>Price list</h1>
    <p class="note sample-banner">⚠ Items tagged <span class="tag">sample</span> have <b>sample prices</b> — edit to your prices.</p>
    <p class="muted small">Changes apply to new quotes. To update a quote you already made, open it and tap “Use current prices”.</p>
    ${CATEGORIES.map(([cat, label]) => `
      <section class="card"><h2>${label}</h2>
        <div data-cat-list="${cat}">${state.catalogue.filter((i) => i.cat === cat).map(itemRow).join('')}</div>
        <button class="btn ghost" data-act="add-item" data-cat="${cat}">+ Add ${label.toLowerCase().replace(/s$/, '')}</button>
      </section>`).join('')}`;
  const banner = () => { $('.sample-banner').hidden = !state.catalogue.some((i) => i.sample); };
  banner();

  const edit = (el) => {
    const row = el.closest('.item');
    const it = state.catalogue.find((i) => i.id === row.dataset.id);
    const k = el.dataset.i;
    if (el.type === 'checkbox') it[k] = el.checked;
    else if (k === 'name' || k === 'chem' || k === 'per') it[k] = el.value;
    else it[k] = parseNum(el.value);
    if (it.sample) { it.sample = false; row.querySelector('.tag')?.remove(); banner(); }
    persistSoon();
  };
  view.oninput = (e) => { if (e.target.dataset.i) edit(e.target); };
  view.onchange = (e) => { if (e.target.dataset.i) { reformat(e.target); edit(e.target); } };
  view.onclick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'add-item') {
      const cat = btn.dataset.cat;
      const it = { id: uid(), cat, name: '', price: 0, sample: false, ...clone(NEW_ITEM[cat] || NEW_ITEM.extra) };
      state.catalogue.push(it);
      view.querySelector(`[data-cat-list="${cat}"]`).insertAdjacentHTML('beforeend', itemRow(it));
      view.querySelector(`.item[data-id="${it.id}"] input`).focus();
      persist();
    } else if (btn.dataset.act === 'del-item') {
      const row = btn.closest('.item');
      const it = state.catalogue.find((i) => i.id === row.dataset.id);
      if (!confirm(`Remove “${it.name || 'this item'}” from your price list?`)) return;
      state.catalogue = state.catalogue.filter((i) => i !== it);
      row.remove(); banner(); persist();
    }
  };
}

function itemRow(it) {
  const input = ([k, label, kind]) => {
    if (kind === 'check') return check(`data-i="${k}"`, it[k], label);
    if (Array.isArray(kind)) return field(label, `<select data-i="${k}">${kind.map((o) => Array.isArray(o) ? opt(o[0], o[1], it[k]) : opt(o, o + ' V', it[k])).join('')}</select>`);
    return field(label, numIn(`data-i="${k}"`, it[k]));
  };
  return `<div class="item" data-id="${esc(it.id)}">
    <div class="ap-top">${textIn('data-i="name" aria-label="Item name" placeholder="Item name"', it.name)}
      ${it.sample ? '<span class="tag">sample</span>' : ''}
      <button class="icon" data-act="del-item" aria-label="Remove item">✕</button></div>
    <div class="grid3">${field('Price ₦', numIn('data-i="price"', it.price))}${fieldsFor(it.cat).map(input).join('')}</div>
  </div>`;
}

// ---------- business profile + backup ----------
function renderProfile() {
  const p = state.profile;
  view.innerHTML = `
    <h1>Business profile</h1>
    <section class="card">
      ${field('Business name', textIn('data-p="name"', p.name))}
      ${field('Phone', textIn('data-p="phone" inputmode="tel"', p.phone, 'tel'))}
      ${field('Address', `<textarea data-p="address" rows="2">${esc(p.address)}</textarea>`)}
      <div class="logo-row">
        <div id="logo-box">${p.logo ? `<img src="${esc(p.logo)}" alt="Your logo" class="logo">` : '<span class="muted small">No logo</span>'}</div>
        <label class="btn">Choose logo<input type="file" accept="image/*" id="logo-file" hidden></label>
        <button class="link danger" data-act="logo-del"${p.logo ? '' : ' hidden'}>Remove</button>
      </div>
    </section>
    <section class="card">
      <h2>Quote defaults</h2>
      <p class="muted small">Used for new quotes. Each quote can still be changed.</p>
      <div class="grid3">
        ${field('Quote valid for (days)', numIn('data-p="validityDays"', p.validityDays, 0))}
        ${field('Labour %', numIn('data-p="labourPct"', p.labourPct))}
        ${field('VAT rate %', numIn('data-p="vatRate"', p.vatRate))}
      </div>
      ${check('data-p="vatOn"', p.vatOn, 'Add VAT to new quotes')}
      ${field('Payment terms', `<textarea data-p="paymentTerms" rows="2">${esc(p.paymentTerms)}</textarea>`)}
      ${field('Notes', `<textarea data-p="notes" rows="3">${esc(p.notes)}</textarea>`)}
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p class="muted small">Your quotes are saved only in this browser on this phone. Download a backup often, and keep it on WhatsApp, email or Google Drive.</p>
      <div class="btns">
        <button class="btn" data-act="export">Download backup</button>
        <label class="btn">Restore from backup<input type="file" accept=".json,application/json" id="import-file" hidden></label>
      </div>
    </section>`;

  const edit = (el) => {
    const k = el.dataset.p;
    if (el.type === 'checkbox') p[k] = el.checked;
    else if (['validityDays', 'labourPct', 'vatRate'].includes(k)) p[k] = parseNum(el.value);
    else p[k] = el.value;
    persistSoon();
  };
  view.oninput = (e) => { if (e.target.dataset.p) edit(e.target); };
  view.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.p) { reformat(t); edit(t); }
    else if (t.id === 'logo-file' && t.files[0]) {
      try {
        p.logo = await shrinkImage(t.files[0]);
        persist();
        renderProfile();
      } catch { toast('That image could not be read. Try a PNG or JPG.', true); }
    } else if (t.id === 'import-file' && t.files[0]) {
      try {
        const data = importJSON(await t.files[0].text());
        if (confirm(`Replace ALL data on this phone with this backup (${data.quotes.length} quotes, ${data.catalogue.length} price items)?`)) {
          state = data;
          persist();
          toast('Backup restored.');
          renderProfile();
        }
      } catch (err) { toast(err.message, true); }
      t.value = '';
    }
  };
  view.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'logo-del') { p.logo = ''; persist(); renderProfile(); }
    if (act === 'export') {
      const url = URL.createObjectURL(new Blob([exportJSON(state)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `solarquote-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
}

/** Resize a logo to max 240 px so it fits comfortably in browser storage. */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 240 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      let data = c.toDataURL('image/png');
      if (data.length > 120000) data = c.toDataURL('image/jpeg', 0.85);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('bad image')); };
    img.src = src;
  });
}

// ---------- start ----------
if (!save(state)) toast('This browser is blocking storage, so quotes will not be kept. Try normal (not private) mode.', true);
route();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
