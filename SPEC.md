# SolarQuote NG — Specification

A web app for small Nigerian solar installers to produce a professional quote in minutes, usually sent by WhatsApp.

## 1. Users

A small installer (not an engineer), mostly on an Android phone, often with poor or no data connection. They need:

- to pick the client's appliances, get a sensible system size, and see a priced quote immediately;
- to adjust any price or line before sending;
- to send the quote by WhatsApp or as a PDF.

## 2. Constraints

| Constraint | Decision |
|---|---|
| Tech | Static site only: vanilla HTML, CSS, JavaScript ES modules. No framework, no build step, no backend, no external network requests (no CDNs, fonts, analytics). |
| Storage | `localStorage`, every read/write wrapped in `try/catch`. JSON export and import for backup. |
| Device | Mobile-first, must work at 360px wide. |
| Size | Under 200 KB total for the deployed site. |
| Offline | Installable PWA (manifest + service worker). Works offline after the first visit. |
| Money | Naira (₦), whole naira, thousands separators on every number shown (₦1,250,000; 3,200 Wh). |

## 3. Features

### 3.1 Business profile
Fields: business name, phone, address, logo (uploaded image, shrunk and stored as a data URL), quote validity (days, default 14), default labour % (default 10), VAT toggle (default **OFF**), VAT rate (editable, default **7.5%**), default payment terms, default notes.
Backup: "Download backup" (JSON file of everything) and "Restore from backup" (validates the file, asks before replacing).

### 3.2 Price list
Editable catalogue, grouped by category:

| Category | Fields |
|---|---|
| Panels | name, watts, price |
| Inverters | name, kVA, battery voltage, PV input limit W (0 = no built-in solar charger), price |
| Batteries | name, type (lithium / lead-acid), Ah, voltage, price |
| Charge controllers | name, amps, PV limit W, price |
| Cables, Mounting, Other | name, unit, quantity rule (per job or per panel), default quantity, include automatically (yes/no), price |

The app ships with **sample** prices, labelled "sample, edit to your prices". Each sample item carries a "sample" tag until edited, and a banner shows while any sample prices remain.

### 3.3 New quote
- Client name and phone.
- Appliance picker with presets (watts, hours per day and surge multiplier pre-filled; motor loads have surge > 1). Every field is editable per row. Custom appliance allowed.
- Presets: LED bulb 10 W, Ceiling/standing fan 60 W, TV (LED 32–43") 100 W, Decoder 20 W, Sound system 100 W, Laptop 65 W, Desktop computer 200 W, Phone charger 10 W, Wi-Fi router 15 W, Fridge 150 W ×3, Freezer 200 W ×3, AC 1 HP 900 W ×3, AC 1.5 HP 1,300 W ×3, Water pump 0.5 HP 400 W ×3, Water pump 1 HP 750 W ×3, Washing machine 500 W ×2, Microwave 1,000 W, Electric iron 1,000 W, Blender 400 W ×2, Security light 30 W, CCTV set 40 W, Printer 50 W.

### 3.4 Sizing engine
Pure functions in their own module (`public/js/sizing.js`), with no DOM or storage access. Every assumption is editable per quote and listed in a **"Show workings"** panel that prints each step with the actual numbers.

| Step | Formula | Default assumption |
|---|---|---|
| Connected load W | Σ(watts × qty) | — |
| Surge extra (per appliance) | watts × (surge − 1), **one unit** (motors don't all start at the same instant) | — |
| Peak W | connected + largest surge extra | — |
| Inverter VA | max(connected × 1.25, peak) ÷ 0.8 | margin 1.25, power factor 0.8 |
| Inverter size | round **up** to next standard size | 1, 1.5, 2.5, 3.5, 5, 6, 10 kVA |
| System voltage | 12 V if ≤ 1 kVA; 24 V if ≤ 3 kVA; else 48 V | thresholds 1 and 3 kVA |
| Daily energy Wh | Σ(watts × qty × hours) | — |
| Battery Wh | daily Wh × battery share | share 60% |
| Battery Ah | battery Wh ÷ (voltage × usable depth × 0.9) | lithium 0.9, lead-acid 0.5, efficiency 0.9 |
| Array W | daily Wh ÷ (peak sun hours × derate) | 4.5 h, derate 0.75 |
| Panel count | round up array W ÷ chosen panel watts | — |
| Controller current A | array W ÷ system V × safety factor | 1.25 |

Edge rules:
- Inverter need above the largest standard size: the engine rounds up to the next whole kVA and warns.
- Negative or blank inputs count as 0. With no appliances, everything is 0 and no equipment is priced.
- Rounding uses a tiny tolerance, so an exact 1,000 VA is still 1 kVA.

Warnings:
- The array exceeds the selected charge controller's stated PV limit.
- The array exceeds the selected inverter's stated PV input limit (hybrid inverters).
- No inverter in the price list is big enough. No battery of the chosen type fits the system voltage.
- The chosen battery voltage is higher than the system voltage.

### 3.5 Picking equipment from the price list (`public/js/quote.js`, pure)
- **Panel:** the installer chooses the model (default: highest wattage). Count comes from the engine.
- **Inverter (auto):** the smallest inverter with kVA ≥ need and voltage = system voltage. Fallback: the smallest with kVA ≥ need.
- **Battery (auto):** batteries of the chosen type whose voltage divides the system voltage. Bank = series (system V ÷ battery V) × parallel strings (round up of Ah needed ÷ battery Ah). Auto mode picks the cheapest whole bank.
- **Charge controller (auto):** none if the inverter has a built-in solar charger (PV limit > 0). Otherwise the smallest controller with amps ≥ required. If no single controller is large enough, it uses several of the largest and warns.
- **Cables / Mounting / Other:** every item marked "include automatically". Quantity = default qty (per job) or default qty × panel count (per panel).
- The installer can override the model in every "auto" choice.

### 3.6 Quote output
- Itemised table: description, qty, unit price, amount. **Every line is editable** (description, qty, price). Edited lines are marked, and each can be reset to its calculated value. Lines can be removed, and custom lines added.
- Labour line: labour % × equipment subtotal, editable as an amount.
- VAT (optional, per quote) = rate × (equipment + labour). Grand total.
- Validity ("valid until" date = quote date + validity days), payment terms, notes.
- Preview page laid out as a document: logo, business details, quote number, client, system summary, table, totals and terms. **Print / Save PDF** uses `window.print()` with a clean print stylesheet (A4, no app chrome).
- **Share on WhatsApp:** opens `https://wa.me/<client phone in 234 format>?text=<summary>`. With no phone, it opens `https://wa.me/?text=` so the installer picks a contact. Sharing a draft marks it "sent".
- **Price snapshot:** each quote keeps a copy of the price list from when it was created, so later price edits don't silently change quotes already sent. "Use current prices" refreshes it.

### 3.7 Saved quotes
List (newest first) with quote number, client, date and total. Status dropdown (draft, sent, accepted, lost). Open, duplicate (a new draft with current prices), delete (asks first). Search by client name or phone. Quotes autosave while editing.

## 4. Data model (localStorage key `solarquote-ng`)
```
{ version: 1,
  profile:   { name, phone, address, logo, validityDays, labourPct, vatOn, vatRate, paymentTerms, notes, nextNo },
  catalogue: [ { id, cat, name, price, sample, ...category fields } ],
  quotes:    [ { id, no, createdAt, updatedAt, status, client:{name,phone}, appliances:[{id,name,watts,qty,hours,surge}],
                 assumptions:{...}, choices:{panelId,batteryChem,batteryId,inverterId,controllerId},
                 catalogue:[snapshot], overrides:{key:{desc?,qty?,price?}}, removed:[key], custom:[{id,desc,qty,price}],
                 labourPct, vatOn, vatRate, validityDays, paymentTerms, notes, total } ] }
```

## 5. Acceptance test
Appliances: 4 LED bulbs 10 W 6 h; 1 TV 100 W 5 h; 2 fans 60 W 8 h; 1 fridge 150 W 10 h, 3× surge.

| Quantity | Hand calculation | Result |
|---|---|---|
| Connected | 40 + 100 + 120 + 150 | **410 W** |
| Peak | 410 + 150 × (3 − 1) | **710 W** |
| Daily | 240 + 500 + 960 + 1,500 | **3,200 Wh** |
| Inverter | max(512.5, 710) ÷ 0.8 = 887.5 VA → | **1 kVA**, **12 V** |
| Battery | 3,200 × 0.6 = 1,920 ÷ (12 × 0.9 × 0.9) = 197.5 → | **≈198 Ah** lithium |
| Panels | 3,200 ÷ (4.5 × 0.75) = 948 W → | **2 × 550 W** |

All the original numbers check out. Automated tests: `node --test` (Node 18+, no packages).
