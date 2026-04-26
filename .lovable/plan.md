## Migrate Frontend to Blynk IoT Cloud

Switch the dashboard from local HTTP (`hazardrecon.local` / `192.168.x.x`) to Blynk Cloud so commands and telemetry work globally over the internet.

---

### 1. `public/hazard-addon.js` — Token settings + Blynk health polling

**Settings modal (replace IP UI with Token UI):**
- Rename "⚙ IP" button → "⚙ Token".
- Modal title: "Blynk Auth Token". Replace the IP input + helper text with a token input (placeholder: `Paste Blynk Auth Token`).
- Drop the `http://` auto-prefix and trailing-slash logic — token is a raw string.
- Keep storage key as **`carIp`** in `localStorage` (per spec) so the value the rest of the code reads is the Blynk token.
- Remove the "Reset Default" button (no default token); keep Cancel + Save.

**Remove fetch patching:**
- Delete the entire `patchFetch()` IIFE that rewrote `/data`, `/action`, etc. to a local IP. With Blynk, all requests use absolute `https://blynk.cloud/...` URLs from `app.html` directly — no rewriting needed.

**Health polling → Blynk `isHardwareConnected`:**
- Replace the `/data` poll with `https://blynk.cloud/external/api/isHardwareConnected?token={TOKEN}` every 3 s.
- Response is `"true"` / `"false"`. Map to status:
  - `true` → `ok` / **"GLOBAL LINK ACTIVE"**
  - `false` → `warn` / **"DEVICE OFFLINE"**
  - fetch error / no token → `err` / **"NO CLOUD"**
- Update the trigger pill label, panel status row, and footer (footer shows masked token, e.g. `token: VOEl…WKbjO`).
- Keep latency measurement (round-trip time of the health call).
- Telemetry CSV/JSON log keeps working — push `{ts, latency, online}` samples each poll (temp/humidity/gas now come from Blynk in `app.html`, not from this poller).

---

### 2. `public/app.html` — Motor commands + telemetry via Blynk REST

**`window.sendCmd` (around line 1709):**
- Read token: `const token = localStorage.getItem('carIp');`
- If no token → show toast/console warn and skip the network call (still update UI).
- Replace `fetch('/action?dir=' + cmd)` with:
  ```js
  fetch(`https://blynk.cloud/external/api/update?token=${token}&V0=${cmd}`, {
    mode: 'no-cors', cache: 'no-store'
  }).catch(() => {});
  ```
- `mode: 'no-cors'` keeps commands fast and avoids preflight (response becomes opaque, which is fine — Blynk accepts simple GETs).

**Telemetry poll (around line 1738, currently `setInterval(..., 1500)`):**
- Change interval to **3000 ms** per spec.
- Replace `fetch('/data')` with:
  ```js
  fetch(`https://blynk.cloud/external/api/get?token=${token}&V1&V2&V3`)
    .then(r => r.json())
    .then(arr => {
      // Blynk returns ["<V1>", "<V2>", "<V3>"] as strings
      const t = parseFloat(arr[0]);
      const h = parseFloat(arr[1]);
      const g = parseInt(arr[2], 10);
      const err = isNaN(t) || isNaN(h);
      window.latestTemp = t; window.latestGas = g; window.latestHum = h;
      updateCharts(t, g, err, false);
      // mark global link active
      setHudStatus('GLOBAL LINK ACTIVE', 'ok');
    })
    .catch(() => { /* sim fallback unchanged */ });
  ```
- Update `updateCharts` so `hud-h` shows the **real humidity** (`window.latestHum`) instead of the hard-coded `"45.2%"`.
- When the call succeeds, the HUD status text becomes **"GLOBAL LINK ACTIVE"** (green); on hazard/sensor-error thresholds, the existing HAZARD / SENSOR ERROR states still take priority.

**No firmware/CORS concerns:** Blynk Cloud serves proper CORS headers for `GET /external/api/get` and `isHardwareConnected`, so HTTPS → HTTPS works from the published Lovable site with no mixed-content issues. This fixes the "always offline" problem.

---

### 3. Settings modal copy update
- Title: **"Connect to Blynk Cloud"**
- Helper: "Paste your Blynk Auth Token from Blynk.Console → Devices → Hazard Recon → Device Info. Your car must be powered on and connected to Wi-Fi."
- Add a small note: "Token is stored locally in your browser only."

---

### 4. Files touched
- `public/hazard-addon.js` — token UI + Blynk health poll, remove fetch patch
- `public/app.html` — `sendCmd` + telemetry interval rewritten to Blynk REST, real humidity in HUD

No backend, no edge function, no DB changes. Pure frontend swap.