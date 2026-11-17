# SolarQuote NG

A small web app for solar installers in Nigeria. You pick the client's appliances, and it works out the system size (inverter, batteries, panels). It then prices everything from your own price list and gives you a neat quote in Naira, which you can send on WhatsApp or save as a PDF.

- Works on a phone (even a small one) and on a computer.
- Works **without internet** after you open it once.
- You can **install it like an app** ("Add to Home screen").
- Your data stays **on your phone**, in the browser. Nothing is sent to any server.

---

## 1. Before you send your first quote

1. Open **Profile**. Type your business name, phone and address, add your logo, and check the defaults (labour %, VAT, how many days a quote is valid).
2. Open **Prices**. The prices you see there are **samples only**. Change them to your own prices. Each item has a yellow **SAMPLE** tag until you edit it.
3. Open **Quotes → + New quote**. Add the client and their appliances, check the numbers, and tap **WhatsApp** or **Preview & PDF**.

> **Important — backups.** Your quotes live only in the browser on that phone. If the phone is lost, or someone clears the browser data, the quotes are gone. Go to **Profile → Download backup** often, and send the file to yourself on WhatsApp or email. **Restore from backup** brings everything back, on the same phone or a new one.

---

## 2. How the sizing works (in plain words)

Open **Show workings** on any quote to see every step with your numbers. You can also change any assumption for that job, for example more sun hours in the North.

| What | How it is worked out | Normal value |
|---|---|---|
| Connected load | add up watts × quantity of every appliance | — |
| Peak load | connected load + the biggest extra "kick" when one motor starts (fridge, freezer, AC, pump). Kick = watts × (surge − 1) | Fridge, AC, pump: 3× |
| Inverter | the bigger of (connected × 1.25) and peak, ÷ 0.8, then round **up** to a size you can buy | 1, 1.5, 2.5, 3.5, 5, 6, 10 kVA |
| Battery voltage | 12 V up to 1 kVA, 24 V up to 3 kVA, 48 V above | — |
| Daily energy | add up watts × quantity × hours per day | — |
| Battery size (Ah) | daily energy × 60% ÷ (voltage × usable depth × 0.9) | lithium 0.9, lead-acid 0.5 |
| Solar panels | daily energy ÷ (sun hours × 0.75), then round up to whole panels | 4.5 sun hours |
| Charge controller | panel watts ÷ battery voltage × 1.25 (only if the inverter has no built-in solar charger) | — |

The app picks matching items from your price list automatically. For the battery it picks the cheapest combination that works. You can choose a different panel, battery, inverter or controller in the **Equipment** box. You can also change **any line** of the quote (name, quantity or price): edited lines get a yellow mark and a "Reset" button.

The app shows a red warning box if, for example, the panels are more than the controller or inverter can take, or nothing in your price list is big enough.

**Example (this is also the built-in test):** 4 LED bulbs (10 W, 6 h), 1 TV (100 W, 5 h), 2 fans (60 W, 8 h) and 1 fridge (150 W, 10 h, 3× surge) work out to:
410 W connected, 710 W peak, 3,200 Wh a day, a **1 kVA 12 V inverter**, **≈198 Ah lithium** (so a 200 Ah battery), and **2 × 550 W panels**.

> A quote keeps a copy of your prices from the day you made it. If you change your price list later, old quotes don't change by surprise. To update one, open it and tap **Use current prices**. **Duplicate** always makes a new draft with today's prices.

---

## 3. What each file does

The app itself is everything inside the **`public`** folder. That is the folder you put online.

| File | What it is for |
|---|---|
| `public/index.html` | The page itself: the top bar, the space where each screen appears, and the bottom tabs (Quotes, Prices, Profile). |
| `public/css/styles.css` | The look: colours, spacing and the phone layout. It also holds the **print rules**, which hide the buttons and lay the quote out on A4 when you save a PDF. |
| `public/js/app.js` | Draws each screen and responds to taps and typing. It also builds the WhatsApp link and opens the print dialog. |
| `public/js/sizing.js` | **The sizing maths** (the table in section 2) and the "Show workings" text. It only does calculations, so it can be tested on its own. |
| `public/js/quote.js` | Picks equipment from the price list, builds the quote lines, and adds up labour, VAT and the total. It also writes the WhatsApp message. Calculations only. |
| `public/js/data.js` | The starting data: the appliance list (with watts, hours and surge), the **sample** price list and the default business settings. |
| `public/js/store.js` | Saves and loads your data in the browser, and makes and reads backup files. It also checks that a backup file is valid before using it. |
| `public/js/format.js` | Small helpers. They write money as ₦1,250,000 and numbers with commas, write dates, and turn 0803… into the 234803… format WhatsApp needs. |
| `public/manifest.webmanifest` | Tells the phone the app's name, colours and icon, so "Add to Home screen / Install app" works. |
| `public/sw.js` | The "service worker". It keeps a copy of the app on the phone so it opens **without internet**. |
| `public/icons/` | The app icon (sun over a solar panel), in the sizes phones ask for. |
| `tests/sizing.test.js` | Automatic checks of the sizing maths, including the example above and tricky cases (empty quote, exact sizes, very big loads, bad inputs). |
| `tests/quote.test.js` | Automatic checks of equipment picking, totals, VAT, labour, edited lines, the WhatsApp text, number formatting and backup files. |
| `package.json` | Only tells the computer how to run the tests (`npm test`). The app uses **no** extra packages. |
| `SPEC.md` | The full description of what the app must do. |
| `TASKS.md` | The checklist used to build it. |
| `README.md` | This file. |

---

## 4. Put it online with Netlify (free, drag-and-drop)

You need a free Netlify account. No programming.

1. Get the files onto your computer. On the GitHub page, click the green **Code** button, then **Download ZIP**. Open (unzip) the downloaded file.
2. Go to **https://app.netlify.com** and sign up or log in (signing in with Google or email is fine).
3. In the Netlify dashboard, click **Add new site** (or **Add new project**), then **Deploy manually**.
4. You'll see a box that says *"Drag and drop your site output folder here"*.
5. In the unzipped files, find the folder called **`public`**. Drag **that folder** (not the whole project folder) into the box.
6. Wait a few seconds. Netlify shows a link like `https://lucky-sun-12345.netlify.app`. That's your app.
7. Optional: click **Site configuration → Change site name** to get a nicer link, like `https://sunnypower-quotes.netlify.app`.
8. Open the link on your phone in **Chrome**. Tap the **⋮** menu, then **Add to Home screen** (or **Install app**). On iPhone, open it in **Safari**, tap **Share**, then **Add to Home Screen**.

**To update the app later:** in Netlify, open your site, go to **Deploys**, and drag the new `public` folder into the box at the bottom of that page. Phones pick up the new version the next time they open the app with internet. If you changed any files yourself, first open `public/sw.js` and change `solarquote-v1` to `solarquote-v2` (then v3, and so on). Otherwise phones may keep the old copy.

Your quotes are **not** stored on Netlify. They stay on each phone, so updating the site does not touch them.

---

## 5. Run it on your own computer (optional)

The app must be opened through a web address. Double-clicking `index.html` will not work: browsers block the app's code when it's opened as a file.

- If Python is installed, open a terminal in the `public` folder and type `python3 -m http.server 8000`, then visit **http://localhost:8000**.
- Or, with Node.js installed: `npx serve public`, then open the address it prints.

**Run the automatic tests** (needs Node.js 18 or newer, nothing to install): open a terminal in the project folder and type `npm test`, or `node --test`. Every line should say `ok`.
