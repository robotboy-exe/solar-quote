// Starting data: appliance presets, SAMPLE price list, default business profile.

/** [name, watts, hours per day, surge multiplier] — surge > 1 for motor loads. */
export const PRESETS = [
  ['LED bulb', 10, 6, 1],
  ['Fan (ceiling/standing)', 60, 8, 1],
  ['TV (LED 32–43")', 100, 5, 1],
  ['Decoder / DSTV', 20, 5, 1],
  ['Sound system', 100, 3, 1],
  ['Laptop', 65, 6, 1],
  ['Desktop computer', 200, 6, 1],
  ['Phone charger', 10, 3, 1],
  ['Wi-Fi router', 15, 24, 1],
  ['Fridge', 150, 10, 3],
  ['Freezer', 200, 12, 3],
  ['AC 1 HP', 900, 6, 3],
  ['AC 1.5 HP', 1300, 6, 3],
  ['Water pump 0.5 HP', 400, 1, 3],
  ['Water pump 1 HP', 750, 1, 3],
  ['Washing machine', 500, 1, 2],
  ['Microwave', 1000, 0.25, 1],
  ['Electric iron', 1000, 0.5, 1],
  ['Blender', 400, 0.25, 2],
  ['Security light', 30, 12, 1],
  ['CCTV set', 40, 24, 1],
  ['Printer', 50, 1, 1],
].map(([name, watts, hours, surge]) => ({ name, watts, hours, surge }));

let seq = 0;
const s = (cat, name, price, extra) => ({ id: `s${++seq}`, cat, name, price, sample: true, ...extra });

/** SAMPLE prices only — the installer must edit these to their own. */
export const SAMPLE_CATALOGUE = [
  s('panel', '550 W mono solar panel', 190000, { watts: 550 }),
  s('panel', '450 W mono solar panel', 155000, { watts: 450 }),
  s('panel', '300 W mono solar panel', 105000, { watts: 300 }),

  s('inverter', '1 kVA 12 V pure sine inverter', 190000, { kva: 1, voltage: 12, pvMaxW: 0 }),
  s('inverter', '1.5 kVA 24 V hybrid inverter (MPPT)', 360000, { kva: 1.5, voltage: 24, pvMaxW: 1500 }),
  s('inverter', '2.5 kVA 24 V hybrid inverter (MPPT)', 480000, { kva: 2.5, voltage: 24, pvMaxW: 3000 }),
  s('inverter', '3.5 kVA 24 V hybrid inverter (MPPT)', 650000, { kva: 3.5, voltage: 24, pvMaxW: 4000 }),
  s('inverter', '5 kVA 48 V hybrid inverter (MPPT)', 850000, { kva: 5, voltage: 48, pvMaxW: 5500 }),
  s('inverter', '6 kVA 48 V hybrid inverter (MPPT)', 1050000, { kva: 6, voltage: 48, pvMaxW: 6500 }),
  s('inverter', '10 kVA 48 V hybrid inverter (MPPT)', 1900000, { kva: 10, voltage: 48, pvMaxW: 11000 }),

  s('battery', '12 V 100 Ah lithium (LiFePO4)', 420000, { chem: 'lithium', ah: 100, voltage: 12 }),
  s('battery', '12 V 200 Ah lithium (LiFePO4)', 750000, { chem: 'lithium', ah: 200, voltage: 12 }),
  s('battery', '24 V 100 Ah lithium (LiFePO4)', 780000, { chem: 'lithium', ah: 100, voltage: 24 }),
  s('battery', '24 V 200 Ah lithium (LiFePO4)', 1400000, { chem: 'lithium', ah: 200, voltage: 24 }),
  s('battery', '48 V 100 Ah lithium (LiFePO4)', 1350000, { chem: 'lithium', ah: 100, voltage: 48 }),
  s('battery', '48 V 200 Ah lithium (LiFePO4)', 2500000, { chem: 'lithium', ah: 200, voltage: 48 }),
  s('battery', '12 V 200 Ah tubular (lead-acid)', 300000, { chem: 'lead', ah: 200, voltage: 12 }),
  s('battery', '12 V 220 Ah tubular (lead-acid)', 340000, { chem: 'lead', ah: 220, voltage: 12 }),

  s('controller', '40 A MPPT charge controller', 90000, { amps: 40, pvMaxW: 1500 }),
  s('controller', '60 A MPPT charge controller', 150000, { amps: 60, pvMaxW: 2500 }),
  s('controller', '80 A MPPT charge controller', 230000, { amps: 80, pvMaxW: 4000 }),
  s('controller', '120 A MPPT charge controller', 380000, { amps: 120, pvMaxW: 6000 }),

  s('cable', '6 mm² solar DC cable (per metre)', 2500, { unit: 'm', per: 'job', qty: 30, include: true }),
  s('cable', '16 mm² battery cable (per metre)', 6000, { unit: 'm', per: 'job', qty: 4, include: true }),
  s('cable', '4 mm² AC output cable (per metre)', 1800, { unit: 'm', per: 'job', qty: 15, include: true }),

  s('mounting', 'Panel rails, clamps & roof hooks (per panel)', 25000, { unit: 'set', per: 'panel', qty: 1, include: true }),
  s('mounting', 'Ground mount frame (per panel)', 45000, { unit: 'set', per: 'panel', qty: 1, include: false }),

  s('other', 'DC breakers & combiner box', 35000, { unit: 'pcs', per: 'job', qty: 1, include: true }),
  s('other', 'AC changeover switch & breaker', 25000, { unit: 'pcs', per: 'job', qty: 1, include: true }),
  s('other', 'Surge protection device', 18000, { unit: 'pcs', per: 'job', qty: 1, include: true }),
  s('other', 'Earthing kit', 20000, { unit: 'pcs', per: 'job', qty: 1, include: false }),
  s('other', 'Battery rack', 40000, { unit: 'pcs', per: 'job', qty: 1, include: false }),
];

export const CATEGORIES = [
  ['panel', 'Solar panels'],
  ['inverter', 'Inverters'],
  ['battery', 'Batteries'],
  ['controller', 'Charge controllers'],
  ['cable', 'Cables'],
  ['mounting', 'Mounting'],
  ['other', 'Other'],
];

export const DEFAULT_PROFILE = {
  name: '',
  phone: '',
  address: '',
  logo: '',
  validityDays: 14,
  labourPct: 10,
  vatOn: false,
  vatRate: 7.5,
  paymentTerms: '70% deposit to confirm order, balance on completion of installation.',
  notes: 'Prices include delivery within the city. Equipment carries manufacturer warranty.',
  nextNo: 1,
};

export const STATUSES = ['draft', 'sent', 'accepted', 'lost'];
