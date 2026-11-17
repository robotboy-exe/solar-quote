import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ASSUMPTIONS as A, connectedLoad, peakLoad, dailyEnergy, inverterSize,
  systemVoltage, batteryCapacity, panelArray, pvLimitWarnings, sizeSystem, workings,
} from '../public/js/sizing.js';

const ACCEPTANCE = [
  { name: 'LED bulb', watts: 10, qty: 4, hours: 6, surge: 1 },
  { name: 'TV', watts: 100, qty: 1, hours: 5, surge: 1 },
  { name: 'Fan', watts: 60, qty: 2, hours: 8, surge: 1 },
  { name: 'Fridge', watts: 150, qty: 1, hours: 10, surge: 3 },
];

test('acceptance: 4 bulbs, TV, 2 fans, fridge', () => {
  const r = sizeSystem(ACCEPTANCE, 'lithium', 550);
  assert.equal(r.connected, 410);
  assert.equal(r.peak, 710);
  assert.equal(r.daily, 3200);
  assert.equal(r.inverter.requiredVA, 887.5);
  assert.equal(r.inverter.kva, 1);
  assert.equal(r.voltage, 12);
  assert.ok(Math.abs(r.battery.ah - 197.53) < 0.01, `battery Ah ${r.battery.ah}`);
  assert.equal(r.battery.ahRounded, 198);
  assert.equal(r.panels.count, 2);
  assert.equal(r.panels.arrayW, 1100);
  assert.deepEqual(r.warnings, []);
});

test('connected, peak and daily energy', () => {
  assert.equal(connectedLoad(ACCEPTANCE), 410);
  assert.equal(peakLoad(ACCEPTANCE), 710);
  assert.equal(dailyEnergy(ACCEPTANCE), 3200);
});

test('surge counts the largest single unit only', () => {
  const two = [{ name: 'Pump', watts: 750, qty: 2, hours: 1, surge: 3 }, { name: 'Fridge', watts: 150, qty: 1, hours: 10, surge: 3 }];
  assert.equal(connectedLoad(two), 1650);
  assert.equal(peakLoad(two), 1650 + 1500);
});

test('empty, blank and negative input gives zeros, not NaN', () => {
  const r = sizeSystem([], 'lithium', 550);
  assert.equal(r.connected, 0); assert.equal(r.inverter.kva, 0); assert.equal(r.voltage, 0);
  assert.equal(r.battery.ah, 0); assert.equal(r.panels.count, 0);
  const junk = [{ name: 'x', watts: '', qty: -2, hours: 'abc', surge: 0 }];
  assert.equal(connectedLoad(junk), 0);
  assert.equal(dailyEnergy(junk), 0);
  assert.deepEqual(workings(r), ['Add appliances to see the workings.']);
});

test('inverter rounds up to the next standard size, exact sizes stay', () => {
  assert.equal(inverterSize(640, 640, A).kva, 1);      // 800 × 1.25 ... 640×1.25/0.8 = 1000 VA exactly
  assert.equal(inverterSize(641, 641, A).kva, 1.5);
  assert.equal(inverterSize(0, 1960, A).kva, 2.5);    // 2450 VA
  assert.equal(inverterSize(0, 2400, A).kva, 3.5);    // 3000 VA
  assert.equal(inverterSize(0, 4800, A).kva, 6);      // 6000 VA
  assert.equal(inverterSize(0, 8000, A).kva, 10);
});

test('inverter above 10 kVA rounds to whole kVA and warns', () => {
  const r = inverterSize(0, 9000, A);                // 11250 VA
  assert.equal(r.kva, 12); assert.equal(r.oversize, true);
  const s = sizeSystem([{ name: 'Big', watts: 9000, qty: 1, hours: 1, surge: 1 }]);
  assert.equal(s.warnings.length, 1);
});

test('system voltage thresholds', () => {
  assert.equal(systemVoltage(1), 12);
  assert.equal(systemVoltage(1.5), 24);
  assert.equal(systemVoltage(2.5), 24);
  assert.equal(systemVoltage(3.5), 48);
  assert.equal(systemVoltage(10), 48);
});

test('lead-acid uses 50% usable depth', () => {
  const b = batteryCapacity(3200, 12, 'lead', A);
  assert.ok(Math.abs(b.ah - 1920 / (12 * 0.5 * 0.9)) < 1e-9);
  assert.equal(b.ahRounded, 356);
});

test('panels round up to whole panels; exact fit does not add a panel', () => {
  assert.equal(panelArray(3200, 550, A).count, 2);
  assert.equal(panelArray(3200, 300, A).count, 4);             // 948 / 300 = 3.16
  assert.equal(panelArray(4.5 * 0.75 * 1100, 550, A).count, 2); // exactly 1100 W
  assert.equal(panelArray(3200, 0, A).count, 0);
});

test('assumptions are editable', () => {
  const r = sizeSystem(ACCEPTANCE, 'lithium', 550, { peakSunHours: 5.5, batteryShare: 1, powerFactor: 1 });
  assert.equal(r.inverter.requiredVA, 710);
  assert.ok(Math.abs(r.battery.ah - 3200 / 9.72) < 1e-9);
  assert.equal(r.panels.count, 2); // 3200 / 4.125 = 776 W
});

test('PV limit warnings', () => {
  assert.equal(pvLimitWarnings(1100, { controller: { pvMaxW: 1000 } }).length, 1);
  assert.equal(pvLimitWarnings(1100, { controller: { pvMaxW: 600, count: 2 } }).length, 0);
  assert.equal(pvLimitWarnings(1100, { inverter: { pvMaxW: 1000 } }).length, 1);
  assert.equal(pvLimitWarnings(1100, { inverter: { pvMaxW: 0 } }).length, 0); // not stated
});

test('workings show the real numbers', () => {
  const w = workings(sizeSystem(ACCEPTANCE, 'lithium', 550)).join('\n');
  assert.match(w, /= 410 W/);
  assert.match(w, /Peak = 410 \+ 300 = 710 W/);
  assert.match(w, /887\.5 VA/);
  assert.match(w, /3,200 Wh/);
  assert.match(w, /197\.5 Ah → 198 Ah/);
  assert.match(w, /2 × 550 W = 1,100 W/);
});

test('bad assumption values fall back to defaults instead of breaking the maths', () => {
  const r = sizeSystem(ACCEPTANCE, 'lithium', 550, { powerFactor: 0, peakSunHours: -1, batteryShare: 'abc', inverterSizes: [], hacker: 5 });
  assert.equal(r.inverter.kva, 1);
  assert.equal(r.panels.count, 2);
  assert.equal(r.battery.ahRounded, 198);
  assert.equal('hacker' in r.a, false);
});
