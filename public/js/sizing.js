// Sizing engine. Pure functions only: no DOM, no storage.
// Every assumption comes in through the `a` (assumptions) object so the
// installer can change it in the "Show workings" panel.

import { num } from './format.js';

export const DEFAULT_ASSUMPTIONS = Object.freeze({
  designMargin: 1.25,      // inverter headroom over connected load
  powerFactor: 0.8,        // W → VA
  inverterSizes: [1, 1.5, 2.5, 3.5, 5, 6, 10], // standard kVA sizes
  v12MaxKva: 1,            // 12 V up to this kVA
  v24MaxKva: 3,            // 24 V up to this kVA, 48 V above
  batteryShare: 0.6,       // share of daily energy the battery must supply
  batteryEfficiency: 0.9,
  dodLithium: 0.9,         // usable depth of discharge
  dodLead: 0.5,
  peakSunHours: 4.5,
  panelDerate: 0.75,
  controllerSafety: 1.25,  // charge controller current headroom
});

const EPS = 1e-9;
const n0 = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const ceilTol = (x) => Math.ceil(x - EPS) || 0; // "|| 0" turns -0 into 0

/** Clean one appliance row: non-numbers and negatives become 0, surge at least 1. */
export function cleanAppliance(ap) {
  return {
    name: String(ap?.name ?? ''),
    watts: n0(ap?.watts),
    qty: n0(ap?.qty),
    hours: Math.min(24, n0(ap?.hours)),
    surge: Math.max(1, n0(ap?.surge) || 1),
  };
}

/** Connected load W = Σ watts × qty */
export function connectedLoad(appliances) {
  return appliances.map(cleanAppliance).reduce((s, a) => s + a.watts * a.qty, 0);
}

/** Largest single-unit surge extra: watts × (surge − 1). Returns { extra, name }. */
export function largestSurge(appliances) {
  let best = { extra: 0, name: '' };
  for (const a of appliances.map(cleanAppliance)) {
    if (a.qty <= 0) continue;
    const extra = a.watts * (a.surge - 1);
    if (extra > best.extra) best = { extra, name: a.name, watts: a.watts, surge: a.surge };
  }
  return best;
}

/** Peak W = connected + largest surge extra */
export function peakLoad(appliances) {
  return connectedLoad(appliances) + largestSurge(appliances).extra;
}

/** Daily energy Wh = Σ watts × qty × hours */
export function dailyEnergy(appliances) {
  return appliances.map(cleanAppliance).reduce((s, a) => s + a.watts * a.qty * a.hours, 0);
}

/**
 * Inverter: VA = max(connected × margin, peak) ÷ PF, rounded up to the next standard kVA.
 * Above the biggest standard size: next whole kVA and `oversize: true`.
 */
export function inverterSize(connected, peak, a = DEFAULT_ASSUMPTIONS) {
  const designW = Math.max(connected * a.designMargin, peak);
  const requiredVA = designW / a.powerFactor;
  if (requiredVA <= 0) return { designW: 0, requiredVA: 0, kva: 0, oversize: false };
  const sizes = [...a.inverterSizes].map(Number).filter((s) => s > 0).sort((x, y) => x - y);
  const reqKva = requiredVA / 1000;
  const fit = sizes.find((s) => s + EPS >= reqKva);
  return fit !== undefined
    ? { designW, requiredVA, kva: fit, oversize: false }
    : { designW, requiredVA, kva: ceilTol(reqKva), oversize: true };
}

/** 12 V up to 1 kVA, 24 V up to 3 kVA, 48 V above. */
export function systemVoltage(kva, a = DEFAULT_ASSUMPTIONS) {
  if (kva <= 0) return 0;
  if (kva <= a.v12MaxKva + EPS) return 12;
  if (kva <= a.v24MaxKva + EPS) return 24;
  return 48;
}

/** Battery Wh = daily × share; Ah = Wh ÷ (V × usable depth × efficiency). */
export function batteryCapacity(dailyWh, voltage, chem, a = DEFAULT_ASSUMPTIONS) {
  const dod = chem === 'lead' ? a.dodLead : a.dodLithium;
  const wh = dailyWh * a.batteryShare;
  const denom = voltage * dod * a.batteryEfficiency;
  const ah = denom > 0 ? wh / denom : 0;
  return { wh, dod, ah, ahRounded: ceilTol(ah) };
}

/** Array W = daily ÷ (sun hours × derate); count = ceil(array ÷ panel W). */
export function panelArray(dailyWh, panelWatts, a = DEFAULT_ASSUMPTIONS) {
  const denom = a.peakSunHours * a.panelDerate;
  const requiredW = denom > 0 ? dailyWh / denom : 0;
  const pw = n0(panelWatts);
  const count = pw > 0 ? ceilTol(requiredW / pw) : 0;
  return { requiredW, panelWatts: pw, count, arrayW: count * pw };
}

/** Controller current A = array W ÷ system V × safety. */
export function controllerCurrent(arrayW, voltage, a = DEFAULT_ASSUMPTIONS) {
  return voltage > 0 ? (arrayW / voltage) * a.controllerSafety : 0;
}

/** Warnings when the array is bigger than a stated PV limit (limit 0/blank = not stated). */
export function pvLimitWarnings(arrayW, { controller, inverter } = {}) {
  const w = [];
  if (controller && n0(controller.pvMaxW) > 0 && arrayW > controller.pvMaxW * (controller.count || 1))
    w.push(`Solar array ${num(arrayW)} W is more than the charge controller PV limit of ${num(controller.pvMaxW * (controller.count || 1))} W.`);
  if (inverter && n0(inverter.pvMaxW) > 0 && arrayW > inverter.pvMaxW)
    w.push(`Solar array ${num(arrayW)} W is more than the inverter PV input limit of ${num(inverter.pvMaxW)} W.`);
  return w;
}

/** Merge edits over defaults; zero, negative or non-numeric values fall back to the default. */
export function cleanAssumptions(edits = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS };
  for (const [k, v] of Object.entries(edits || {})) {
    if (!(k in DEFAULT_ASSUMPTIONS)) continue;
    if (k === 'inverterSizes') {
      const sizes = (Array.isArray(v) ? v : []).map(Number).filter((x) => x > 0);
      if (sizes.length) a[k] = sizes;
    } else if (Number(v) > 0) a[k] = Number(v);
  }
  return a;
}

/** Run the full sizing. `a` may be partial; missing values fall back to defaults. */
export function sizeSystem(appliances, chem = 'lithium', panelWatts = 550, assumptions = {}) {
  const a = cleanAssumptions(assumptions);
  const list = (appliances || []).map(cleanAppliance);
  const connected = connectedLoad(list);
  const surge = largestSurge(list);
  const peak = connected + surge.extra;
  const daily = dailyEnergy(list);
  const inv = inverterSize(connected, peak, a);
  const voltage = systemVoltage(inv.kva, a);
  const battery = batteryCapacity(daily, voltage, chem, a);
  const panels = panelArray(daily, panelWatts, a);
  const controllerA = controllerCurrent(panels.arrayW, voltage, a);
  const warnings = [];
  if (inv.oversize) warnings.push(`Load needs ${num(inv.requiredVA)} VA — above the largest standard size. Consider splitting the load or using parallel inverters.`);
  return { a, appliances: list, connected, surge, peak, daily, inverter: inv, voltage, chem, battery, panels, controllerA, warnings };
}

/** Human-readable steps for the "Show workings" panel. */
export function workings(r) {
  const { a } = r;
  const used = r.appliances.filter((x) => x.qty > 0 && x.watts > 0);
  if (!used.length) return ['Add appliances to see the workings.'];
  const pct = (x) => num(x * 100, 1) + '%';
  const s = [];
  s.push(`Connected load = ${used.map((x) => `${num(x.qty, 2)} × ${num(x.watts, 2)}`).join(' + ')} = ${num(r.connected, 2)} W`);
  s.push(r.surge.extra > 0
    ? `Largest surge extra = ${r.surge.name || 'appliance'}: ${num(r.surge.watts, 2)} × (${num(r.surge.surge, 2)} − 1) = ${num(r.surge.extra, 2)} W → Peak = ${num(r.connected, 2)} + ${num(r.surge.extra, 2)} = ${num(r.peak, 2)} W`
    : `No motor surge → Peak = ${num(r.peak, 2)} W`);
  s.push(`Inverter = max(${num(r.connected, 2)} × ${a.designMargin}, ${num(r.peak, 2)}) ÷ ${a.powerFactor} PF = ${num(r.inverter.requiredVA, 1)} VA → ${r.inverter.oversize ? 'above standard sizes, rounded to' : 'next standard size'} ${num(r.inverter.kva, 1)} kVA`);
  s.push(`System voltage: ${num(r.inverter.kva, 1)} kVA → ${r.voltage} V (12 V up to ${a.v12MaxKva} kVA, 24 V up to ${a.v24MaxKva} kVA, 48 V above)`);
  s.push(`Daily energy = ${used.map((x) => `${num(x.qty, 2)} × ${num(x.watts, 2)} × ${num(x.hours, 2)} h`).join(' + ')} = ${num(r.daily, 2)} Wh`);
  s.push(`Battery = ${num(r.daily, 2)} Wh × ${pct(a.batteryShare)} = ${num(r.battery.wh, 2)} Wh ÷ (${r.voltage} V × ${r.battery.dod} usable × ${a.batteryEfficiency} efficiency) = ${num(r.battery.ah, 1)} Ah → ${num(r.battery.ahRounded)} Ah ${r.chem === 'lead' ? 'lead-acid' : 'lithium'}`);
  s.push(`Solar array = ${num(r.daily, 2)} Wh ÷ (${a.peakSunHours} sun hours × ${a.panelDerate} derate) = ${num(r.panels.requiredW, 1)} W → ${r.panels.count} × ${num(r.panels.panelWatts)} W = ${num(r.panels.arrayW)} W`);
  s.push(`Charge current = ${num(r.panels.arrayW)} W ÷ ${r.voltage} V × ${a.controllerSafety} = ${num(r.controllerA, 1)} A`);
  return s;
}
