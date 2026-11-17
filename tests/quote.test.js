import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuote, batteryBank, pickBattery, pickInverter, pickController, totals, systemSummary, whatsappText } from '../public/js/quote.js';
import { SAMPLE_CATALOGUE as CAT } from '../public/js/data.js';
import { naira, num, parseNum, waPhone, esc } from '../public/js/format.js';
import { importJSON, freshState, newQuote, duplicateQuote } from '../public/js/store.js';

const APPS = [
  { name: 'LED bulb', watts: 10, qty: 4, hours: 6, surge: 1 },
  { name: 'TV', watts: 100, qty: 1, hours: 5, surge: 1 },
  { name: 'Fan', watts: 60, qty: 2, hours: 8, surge: 1 },
  { name: 'Fridge', watts: 150, qty: 1, hours: 10, surge: 3 },
];
const base = (extra = {}) => ({
  appliances: APPS, catalogue: CAT, labourPct: 10, vatOn: false, vatRate: 7.5,
  choices: { batteryChem: 'lithium', batteryId: 'auto', inverterId: 'auto', controllerId: 'auto' }, ...extra,
});
const line = (b, key) => b.lines.find((l) => l.key === key);

test('acceptance quote picks sensible equipment', () => {
  const b = buildQuote(base());
  assert.equal(b.panel.watts, 550);
  assert.equal(line(b, 'panel').qty, 2);
  assert.equal(b.inverter.kva, 1);
  assert.equal(b.inverter.voltage, 12);
  assert.equal(b.bank.item.ah, 200);       // 1 × 200 Ah is cheaper than 2 × 100 Ah
  assert.equal(b.bank.count, 1);
  assert.equal(b.ctrl.item.amps, 120);     // 1100 / 12 × 1.25 = 114.6 A
  assert.deepEqual(b.warnings, []);
  assert.equal(systemSummary(b), '1 kVA 12 V inverter, 1 × 200 Ah lithium battery (12 V), 2 × 550 W solar panels');
});

test('totals: labour % on equipment, VAT off by default', () => {
  const b = buildQuote(base());
  const equipment = b.lines.filter((l) => l.key !== 'labour').reduce((s, l) => s + l.qty * l.price, 0);
  assert.equal(b.equipment, equipment);
  assert.equal(line(b, 'labour').price, Math.round(equipment * 0.1));
  assert.equal(b.vat, 0);
  assert.equal(b.total, equipment + Math.round(equipment * 0.1));
});

test('VAT 7.5% on equipment + labour', () => {
  const b = buildQuote(base({ vatOn: true }));
  assert.equal(b.vat, Math.round(b.subtotal * 0.075));
  assert.equal(b.total, b.subtotal + b.vat);
  assert.deepEqual(totals([{ qty: 2, price: 500 }], true, 10), { subtotal: 1000, vat: 100, total: 1100 });
});

test('overrides, removed lines and custom lines', () => {
  const b = buildQuote(base({
    overrides: { panel: { price: 200000 }, inverter: { desc: 'My inverter' } },
    removed: ['controller'],
    custom: [{ id: 'c1', desc: 'Transport', qty: 1, price: 15000 }],
  }));
  assert.equal(line(b, 'panel').price, 200000);
  assert.equal(line(b, 'panel').overridden, true);
  assert.equal(line(b, 'panel').calc.price, 190000);
  assert.equal(line(b, 'inverter').desc, 'My inverter');
  assert.equal(line(b, 'controller'), undefined);
  assert.equal(line(b, 'custom:c1').price, 15000);
});

test('labour amount can be overridden', () => {
  const b = buildQuote(base({ overrides: { labour: { price: 50000 } } }));
  assert.equal(line(b, 'labour').price, 50000);
});

test('per-panel items scale with panel count', () => {
  const b = buildQuote(base());
  const rails = CAT.find((i) => i.name.startsWith('Panel rails'));
  assert.equal(line(b, 'item:' + rails.id).qty, 2);
});

test('battery bank: series and parallel', () => {
  const b12 = CAT.find((i) => i.chem === 'lead' && i.ah === 200);
  const bank = batteryBank(b12, 450, 24);
  assert.deepEqual([bank.series, bank.parallel, bank.count, bank.fits], [2, 3, 6, true]);
  const b48 = CAT.find((i) => i.cat === 'battery' && i.voltage === 48);
  assert.equal(batteryBank(b48, 100, 12).fits, false);
  assert.equal(pickBattery(CAT, 'lithium', 0, 12), null);
});

test('hybrid inverter needs no separate controller; PV limit warning', () => {
  const inv = pickInverter(CAT, 2.5, 24);
  assert.equal(inv.pvMaxW, 3000);
  assert.equal(pickController(CAT, 50, inv), null);
  const big = [{ name: 'AC 1.5 HP', watts: 1300, qty: 1, hours: 10, surge: 1 }, { name: 'Freezer', watts: 200, qty: 1, hours: 12, surge: 1 }];
  const b = buildQuote(base({ appliances: big }));
  assert.equal(b.inverter.kva, 2.5);
  assert.equal(b.ctrl, null);
  assert.ok(b.warnings.some((w) => /inverter PV input limit/.test(w)), b.warnings.join('|'));
});

test('controller: several of the largest when none is big enough', () => {
  const c = pickController(CAT, 300, null);
  assert.equal(c.item.amps, 120); assert.equal(c.count, 3);
  assert.equal(pickController(CAT, 50, null, 'none'), null);
});

test('missing catalogue items give warnings, not crashes', () => {
  const b = buildQuote(base({ catalogue: [] }));
  assert.equal(b.total, 0);
  assert.ok(b.warnings.length >= 2);
  assert.equal(buildQuote(base({ appliances: [] })).lines.length, 0);
});

test('formatting', () => {
  assert.equal(naira(1250000), '₦1,250,000');
  assert.equal(naira(1234.6), '₦1,235');
  assert.equal(num(3200), '3,200');
  assert.equal(num(197.534, 1), '197.5');
  assert.equal(parseNum('₦ 1,200.50'), 1200.5);
  assert.equal(parseNum(''), 0);
  assert.equal(waPhone('0803 123 4567'), '2348031234567');
  assert.equal(waPhone('+234 803 123 4567'), '2348031234567');
  assert.equal(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('backup import validates and repairs', () => {
  assert.throws(() => importJSON('not json'));
  assert.throws(() => importJSON('{"hello":1}'));
  const s = freshState();
  const q = newQuote(s);
  s.quotes.push({ ...q, status: 'weird' });
  const back = importJSON(JSON.stringify(s));
  assert.equal(back.quotes[0].status, 'draft');
  assert.equal(back.profile.vatRate, 7.5);
  assert.equal(back.profile.vatOn, false);
  const d = duplicateQuote(back, back.quotes[0]);
  assert.notEqual(d.id, q.id); assert.notEqual(d.no, q.no);
});

test('WhatsApp summary text', () => {
  const q = { ...base({ vatOn: true }), no: 'Q-0007', createdAt: '2026-11-17T10:00:00Z', validityDays: 14, client: { name: 'Mrs Ade' }, paymentTerms: '70% deposit', notes: '' };
  const t = whatsappText(q, buildQuote(q), { name: 'Sunny Power', phone: '0803 000 0000' });
  assert.match(t, /^\*QUOTATION Q-0007\* — Sunny Power/);
  assert.match(t, /Valid until: 1 Dec 2026/);
  assert.match(t, /4 × LED bulb, 1 × TV, 2 × Fan, 1 × Fridge/);
  assert.match(t, /550 W mono solar panel × 2 — ₦380,000/);
  assert.match(t, /VAT \(7\.5%\)/);
  assert.match(t, /\*TOTAL: ₦[\d,]+\*/);
  assert.match(t, /Sunny Power · 0803 000 0000$/);
});
