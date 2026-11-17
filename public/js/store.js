// Browser storage (localStorage) and JSON backup. Every storage access is wrapped in try/catch.

import { SAMPLE_CATALOGUE, DEFAULT_PROFILE, STATUSES } from './data.js';
import { DEFAULT_ASSUMPTIONS } from './sizing.js';

const KEY = 'solarquote-ng';
const VERSION = 1;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (x) => JSON.parse(JSON.stringify(x));

export function freshState() {
  return { version: VERSION, profile: { ...DEFAULT_PROFILE }, catalogue: clone(SAMPLE_CATALOGUE), quotes: [] };
}

/** Check and repair a state object (from storage or a backup file). Throws if it is not ours. */
export function normalise(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.catalogue) || !Array.isArray(data.quotes))
    throw new Error('This is not a SolarQuote NG backup file.');
  const quotes = data.quotes.filter((q) => q && typeof q === 'object' && q.id).map((q) => ({
    ...newQuoteShape(),
    ...q,
    status: STATUSES.includes(q.status) ? q.status : 'draft',
    assumptions: { ...DEFAULT_ASSUMPTIONS, ...(q.assumptions || {}) },
  }));
  return {
    version: VERSION,
    profile: { ...DEFAULT_PROFILE, ...(data.profile || {}) },
    catalogue: data.catalogue.filter((i) => i && i.id && i.cat),
    quotes,
  };
}

function newQuoteShape() {
  return {
    status: 'draft', client: { name: '', phone: '' }, appliances: [], choices: {},
    catalogue: [], overrides: {}, removed: [], custom: [], total: 0,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalise(JSON.parse(raw)) : freshState();
  } catch {
    return freshState();
  }
}

/** Returns true on success, false if the browser refused (full or blocked). */
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export const exportJSON = (state) => JSON.stringify({ app: 'SolarQuote NG', exportedAt: new Date().toISOString(), ...state }, null, 1);

export function importJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The file could not be read. Pick a .json backup file.'); }
  return normalise(data);
}

/** New quote using the business defaults and a snapshot of the current price list. */
export function newQuote(state) {
  const p = state.profile;
  const now = new Date().toISOString();
  const panels = state.catalogue.filter((i) => i.cat === 'panel').sort((a, b) => b.watts - a.watts);
  const q = {
    ...newQuoteShape(),
    id: uid(),
    no: 'Q-' + String(p.nextNo || 1).padStart(4, '0'),
    createdAt: now,
    updatedAt: now,
    assumptions: { ...DEFAULT_ASSUMPTIONS, inverterSizes: [...DEFAULT_ASSUMPTIONS.inverterSizes] },
    choices: { panelId: panels[0]?.id || '', batteryChem: 'lithium', batteryId: 'auto', inverterId: 'auto', controllerId: 'auto' },
    catalogue: clone(state.catalogue),
    labourPct: p.labourPct,
    vatOn: p.vatOn,
    vatRate: p.vatRate,
    validityDays: p.validityDays,
    paymentTerms: p.paymentTerms,
    notes: p.notes,
  };
  p.nextNo = (p.nextNo || 1) + 1;
  return q;
}

/** Copy of a quote as a new draft with current prices and a new number. */
export function duplicateQuote(state, q) {
  const fresh = newQuote(state);
  return {
    ...clone(q),
    id: fresh.id, no: fresh.no, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt,
    status: 'draft', catalogue: fresh.catalogue,
  };
}
