// Turns a sizing result + price list into priced quote lines and totals.
// Pure functions only: no DOM, no storage.

import { sizeSystem, pvLimitWarnings } from './sizing.js';
import { num, naira, date, addDays } from './format.js';

const byCat = (cat, list) => list.filter((i) => i.cat === cat);
const find = (id, list) => list.find((i) => i.id === id);

/** Panel model: chosen id, else highest wattage. */
export function pickPanel(catalogue, id) {
  const panels = byCat('panel', catalogue);
  return find(id, panels) || [...panels].sort((x, y) => y.watts - x.watts)[0] || null;
}

/** Smallest inverter ≥ kVA at the system voltage; fallback smallest ≥ kVA at any voltage. */
export function pickInverter(catalogue, kva, voltage, id) {
  const list = byCat('inverter', catalogue);
  if (id && id !== 'auto') return find(id, list) || null;
  if (kva <= 0) return null;
  const big = list.filter((i) => i.kva >= kva - 1e-9).sort((x, y) => x.kva - y.kva || x.price - y.price);
  return big.find((i) => i.voltage === voltage) || big[0] || null;
}

/** Battery bank for one model: series to reach system voltage, parallel strings for Ah. */
export function batteryBank(item, ahNeeded, systemV) {
  if (!item || !(item.voltage > 0) || !(item.ah > 0) || systemV <= 0) return null;
  const series = Math.max(1, Math.round(systemV / item.voltage));
  const fits = series * item.voltage === systemV;
  const parallel = Math.max(1, Math.ceil(ahNeeded / item.ah - 1e-9));
  return { item, series, parallel, count: series * parallel, fits, bankAh: parallel * item.ah, cost: series * parallel * item.price };
}

/** Cheapest bank among batteries of this chemistry whose voltage divides the system voltage. */
export function pickBattery(catalogue, chem, ahNeeded, systemV, id) {
  const list = byCat('battery', catalogue).filter((b) => b.chem === chem);
  if (systemV <= 0 || ahNeeded <= 0) return null;
  if (id && id !== 'auto') return batteryBank(find(id, byCat('battery', catalogue)), ahNeeded, systemV);
  const banks = list.map((b) => batteryBank(b, ahNeeded, systemV)).filter((b) => b && b.fits);
  return banks.sort((x, y) => x.cost - y.cost || x.count - y.count)[0] || null;
}

/**
 * Charge controller. 'none' → none. Auto: none if inverter has built-in solar charger,
 * else smallest with amps ≥ needed, else several of the largest.
 */
export function pickController(catalogue, ampsNeeded, inverter, id) {
  const list = byCat('controller', catalogue);
  if (id === 'none' || ampsNeeded <= 0) return null;
  if (id && id !== 'auto') {
    const c = find(id, list);
    return c ? { item: c, count: Math.max(1, Math.ceil(ampsNeeded / c.amps - 1e-9)) } : null;
  }
  if (inverter && inverter.pvMaxW > 0) return null;
  const sorted = [...list].sort((x, y) => x.amps - y.amps || x.price - y.price);
  const one = sorted.find((c) => c.amps >= ampsNeeded - 1e-9);
  if (one) return { item: one, count: 1 };
  const big = sorted[sorted.length - 1];
  return big ? { item: big, count: Math.ceil(ampsNeeded / big.amps) } : null;
}

/** Equipment subtotal × labour %. */
export const labourAmount = (equipment, pct) => Math.round(equipment * (Number(pct) || 0) / 100);

/** Subtotal, VAT and total from priced lines (labour included as a line). */
export function totals(lines, vatOn, vatRate) {
  const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const vat = vatOn ? Math.round(subtotal * (Number(vatRate) || 0) / 100) : 0;
  return { subtotal, vat, total: subtotal + vat };
}

/**
 * Build the full priced quote.
 * q: { appliances, assumptions, choices, catalogue, overrides, removed, custom, labourPct, vatOn, vatRate }
 */
export function buildQuote(q) {
  const cat = q.catalogue || [];
  const ch = q.choices || {};
  const chem = ch.batteryChem === 'lead' ? 'lead' : 'lithium';
  const panel = pickPanel(cat, ch.panelId);
  const sizing = sizeSystem(q.appliances, chem, panel ? panel.watts : 0, q.assumptions);
  const warnings = [...sizing.warnings];
  const hasLoad = sizing.connected > 0;

  const inverter = hasLoad ? pickInverter(cat, sizing.inverter.kva, sizing.voltage, ch.inverterId) : null;
  const bank = hasLoad ? pickBattery(cat, chem, sizing.battery.ah, sizing.voltage, ch.batteryId) : null;
  const ctrl = hasLoad ? pickController(cat, sizing.controllerA, inverter, ch.controllerId) : null;

  if (hasLoad) {
    if (!panel) warnings.push('No solar panels in the price list. Add one under Prices.');
    if (!inverter) warnings.push(`No inverter of ${num(sizing.inverter.kva, 1)} kVA or bigger in the price list.`);
    else if (inverter.kva < sizing.inverter.kva) warnings.push(`Chosen inverter (${num(inverter.kva, 1)} kVA) is smaller than the ${num(sizing.inverter.kva, 1)} kVA needed.`);
    else if (inverter.voltage !== sizing.voltage) warnings.push(`Chosen inverter runs at ${inverter.voltage} V but the system is sized for ${sizing.voltage} V.`);
    if (!bank) warnings.push(`No ${chem === 'lead' ? 'lead-acid' : 'lithium'} battery in the price list fits a ${sizing.voltage} V system.`);
    else if (!bank.fits) warnings.push(`Battery voltage ${bank.item.voltage} V does not match the ${sizing.voltage} V system.`);
    else if (bank.item.chem !== chem) warnings.push('Chosen battery type differs from the battery type used for sizing.');
    if (ctrl && ctrl.count > 1) warnings.push(`No single charge controller is big enough for ${num(sizing.controllerA)} A — quoted ${ctrl.count} × ${ctrl.item.name}.`);
    if (!ctrl && !(inverter && inverter.pvMaxW > 0) && ch.controllerId !== 'none' && sizing.panels.count > 0)
      warnings.push('Inverter has no built-in solar charger and no charge controller is in the price list.');
    warnings.push(...pvLimitWarnings(sizing.panels.arrayW, {
      controller: ctrl ? { pvMaxW: ctrl.item.pvMaxW, count: ctrl.count } : null,
      inverter: !ctrl && inverter ? inverter : null,
    }));
  }

  // Calculated lines, keyed so overrides survive recalculation.
  const auto = [];
  if (hasLoad) {
    if (panel && sizing.panels.count > 0) auto.push({ key: 'panel', desc: panel.name, qty: sizing.panels.count, price: panel.price });
    if (inverter) auto.push({ key: 'inverter', desc: inverter.name, qty: 1, price: inverter.price });
    if (bank) auto.push({
      key: 'battery',
      desc: bank.item.name + (bank.count > 1 ? ` (${bank.series} in series × ${bank.parallel} string${bank.parallel > 1 ? 's' : ''})` : ''),
      qty: bank.count, price: bank.item.price,
    });
    if (ctrl) auto.push({ key: 'controller', desc: ctrl.item.name, qty: ctrl.count, price: ctrl.item.price });
    for (const it of cat.filter((i) => ['cable', 'mounting', 'other'].includes(i.cat) && i.include)) {
      const qty = it.per === 'panel' ? (Number(it.qty) || 0) * sizing.panels.count : Number(it.qty) || 0;
      if (qty > 0) auto.push({ key: 'item:' + it.id, desc: it.name, qty, price: it.price });
    }
  }

  const ov = q.overrides || {};
  const removed = new Set(q.removed || []);
  const apply = (l) => {
    const o = ov[l.key];
    if (!o) return { ...l, overridden: false };
    return { ...l, desc: o.desc ?? l.desc, qty: o.qty ?? l.qty, price: o.price ?? l.price, overridden: true, calc: { desc: l.desc, qty: l.qty, price: l.price } };
  };
  const lines = auto.filter((l) => !removed.has(l.key)).map(apply);
  for (const c of q.custom || []) lines.push({ key: 'custom:' + c.id, desc: c.desc, qty: Number(c.qty) || 0, price: Number(c.price) || 0, custom: true });

  const equipment = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0));
  if (!removed.has('labour') && (equipment > 0 || ov.labour)) {
    lines.push(apply({ key: 'labour', desc: `Installation labour (${num(q.labourPct, 1)}%)`, qty: 1, price: labourAmount(equipment, q.labourPct) }));
  }

  return { sizing, panel, inverter, bank, ctrl, lines, warnings, equipment, ...totals(lines, q.vatOn, q.vatRate) };
}

/** One-line system description, e.g. "1 kVA 12 V inverter, 1 × 200 Ah lithium battery, 2 × 550 W panels". */
export function systemSummary(b) {
  const parts = [];
  if (b.inverter) parts.push(`${num(b.inverter.kva, 1)} kVA ${b.inverter.voltage} V inverter`);
  if (b.bank) parts.push(`${b.bank.count} × ${num(b.bank.item.ah)} Ah ${b.bank.item.chem === 'lead' ? 'lead-acid' : 'lithium'} batter${b.bank.count > 1 ? 'ies' : 'y'} (${b.bank.item.voltage} V)`);
  if (b.panel && b.sizing.panels.count) parts.push(`${b.sizing.panels.count} × ${num(b.panel.watts)} W solar panels`);
  return parts.join(', ');
}

/** Plain-text quote summary for WhatsApp (uses *bold* markup). p = business profile. */
export function whatsappText(q, b, p) {
  const s = b.sizing;
  const out = [];
  out.push(`*QUOTATION ${q.no}*${p.name ? ' — ' + p.name : ''}`);
  out.push(`Date: ${date(q.createdAt)} · Valid until: ${date(addDays(q.createdAt, q.validityDays))}`);
  if (q.client.name) out.push(`Client: ${q.client.name}`);
  out.push('');
  if (b.lines.length) {
    out.push(`*System:* ${systemSummary(b)}`);
    out.push(`Powers: ${s.appliances.filter((x) => x.qty > 0).map((x) => `${num(x.qty, 2)} × ${x.name || 'appliance'}`).join(', ')}`);
    out.push(`Daily energy: ${num(s.daily)} Wh`);
    out.push('');
    out.push('*Items*');
    for (const l of b.lines) out.push(`• ${l.desc}${l.qty !== 1 ? ` × ${num(l.qty, 2)}` : ''} — ${naira(l.qty * l.price)}`);
    out.push('');
    if (q.vatOn) out.push(`Subtotal: ${naira(b.subtotal)}`, `VAT (${num(q.vatRate, 2)}%): ${naira(b.vat)}`);
    out.push(`*TOTAL: ${naira(b.total)}*`);
  }
  if (q.paymentTerms) out.push('', `Payment: ${q.paymentTerms}`);
  if (q.notes) out.push(`Notes: ${q.notes}`);
  const contact = [p.name, p.phone].filter(Boolean).join(' · ');
  if (contact) out.push('', contact);
  return out.join('\n');
}
