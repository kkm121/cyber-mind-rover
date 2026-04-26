/* Hazard Recon — Blynk Cloud Addon overlay
   - "⚙ Token" button → modal to paste your Blynk Auth Token (stored in localStorage as `carIp`)
   - "Link" pill → polls https://blynk.cloud/external/api/isHardwareConnected every 3s
   - Telemetry session log + CSV / JSON export
   Non-intrusive — never mutates host UI. */

(function () {
  "use strict";

  const STYLE = `
  #hz-addon { position: fixed; top: 10px; right: 10px; z-index: 99999;
    font-family: 'Space Mono', ui-monospace, monospace; color: #d6f6ff; }
  #hz-addon * { box-sizing: border-box; }

  #hz-trigger { display: inline-flex; align-items: center; gap: 8px;
    background: rgba(8, 10, 22, 0.6); backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 999px;
    padding: 6px 12px; cursor: pointer; user-select: none;
    box-shadow: 0 4px 20px rgba(0, 240, 255, 0.12);
    transition: all .15s ease; font-size: 10px; letter-spacing: .14em;
    text-transform: uppercase; color: #00f0ff; line-height: 1; }
  #hz-trigger:hover { box-shadow: 0 4px 24px rgba(0, 240, 255, 0.28); }
  #hz-trigger .hz-dot { display:inline-block; width:7px; height:7px; border-radius:50%;
    box-shadow:0 0 8px currentColor; }
  #hz-trigger .hz-lat { color:#fff; font-weight:700; letter-spacing:.05em; text-transform:none; }
  #hz-trigger .hz-caret { font-size: 8px; opacity:.7; transition: transform .2s; }
  #hz-addon.open #hz-trigger .hz-caret { transform: rotate(180deg); }

  #hz-panel { position: absolute; top: calc(100% + 8px); right: 0;
    width: 280px; max-width: calc(100vw - 20px);
    background: rgba(8, 10, 22, 0.78); backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    border: 1px solid rgba(0, 240, 255, 0.28); border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, .5), 0 0 24px rgba(0, 240, 255, 0.18),
      inset 0 0 0 1px rgba(255,255,255,0.04);
    padding: 12px 14px; opacity: 0; transform: translateY(-6px) scale(.98);
    pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
  #hz-addon.open #hz-panel { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

  #hz-panel h4 { margin:0 0 8px; font-family:'Syncopate', sans-serif; font-size:10px;
    letter-spacing:.18em; color:#00f0ff; text-transform:uppercase; }
  #hz-panel .hz-row { display:flex; justify-content:space-between; align-items:center;
    font-size:11px; padding:4px 0; border-bottom:1px dashed rgba(255,255,255,.06); }
  #hz-panel .hz-row:last-of-type { border-bottom:0; }
  #hz-panel .hz-label { color:#7a8aa3; text-transform:uppercase; letter-spacing:.1em; font-size:9px; }
  #hz-panel .hz-val { color:#fff; font-weight:700; font-size: 11px; }
  .ok    { color:#22f5a3 !important; }
  .warn  { color:#ffb648 !important; }
  .err   { color:#ff3860 !important; }
  #hz-panel .hz-actions { display:flex; gap:6px; margin-top:10px; }
  #hz-panel .hz-btn { flex:1; background:transparent; border:1px solid rgba(0,240,255,.35);
    color:#00f0ff; font-family:inherit; font-size:10px; padding:6px 4px; border-radius:6px;
    cursor:pointer; letter-spacing:.08em; text-transform:uppercase; transition: all .15s; }
  #hz-panel .hz-btn:hover { background:rgba(0,240,255,.12); box-shadow:0 0 10px rgba(0,240,255,.4); }
  #hz-panel .hz-btn.pink { color:#ff2bd6; border-color:rgba(255,43,214,.4); }
  #hz-panel .hz-btn.pink:hover { background:rgba(255,43,214,.1); box-shadow:0 0 10px rgba(255,43,214,.4); }
  #hz-panel footer { margin-top:8px; font-size:9px; color:#5a6b85; text-align:center;
    letter-spacing:.06em; word-break: break-all; }

  @media (max-width: 640px) {
    #hz-addon { top: 8px; right: 8px; }
    #hz-trigger { padding: 5px 10px; font-size: 9px; gap: 6px; }
    #hz-panel { width: calc(100vw - 16px); max-width: 300px; }
  }
  @media (max-height: 480px) and (orientation: landscape) {
    #hz-trigger { padding: 4px 9px; font-size: 9px; }
    #hz-panel { padding: 10px 12px; width: 260px; }
    #hz-panel .hz-row { padding: 3px 0; font-size: 10px; }
  }

  #hz-ipbtn { margin-left: 6px; background: rgba(8,10,22,0.6); border: 1px solid rgba(255,43,214,0.4);
    color: #ff2bd6; border-radius: 999px; padding: 6px 10px; font-size: 10px; cursor: pointer;
    letter-spacing: .14em; text-transform: uppercase; font-family: inherit; line-height: 1;
    backdrop-filter: blur(12px); transition: all .15s; }
  #hz-ipbtn:hover { box-shadow: 0 0 14px rgba(255,43,214,.4); }
  #hz-modal-bg { position: fixed; inset: 0; background: rgba(2,4,12,.78); backdrop-filter: blur(8px);
    z-index: 100000; display: none; align-items: center; justify-content: center; padding: 20px; }
  #hz-modal-bg.open { display: flex; }
  #hz-modal { width: 100%; max-width: 460px; background: rgba(8,10,22,.92);
    border: 1px solid rgba(0,240,255,.35); border-radius: 16px; padding: 22px;
    box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 40px rgba(0,240,255,.2);
    font-family: 'Space Mono', ui-monospace, monospace; color: #d6f6ff; }
  #hz-modal h3 { margin:0 0 6px; font-family:'Syncopate', sans-serif; font-size: 14px;
    letter-spacing:.2em; color:#00f0ff; text-transform:uppercase; }
  #hz-modal p { margin: 0 0 14px; font-size: 11px; color: #7a8aa3; line-height: 1.5; }
  #hz-modal label { display:block; font-size: 9px; letter-spacing: .14em; color:#7a8aa3;
    text-transform: uppercase; margin-bottom: 6px; }
  #hz-modal input { width: 100%; background: rgba(0,0,0,.5); border: 1px solid rgba(0,240,255,.3);
    color: #fff; padding: 10px 12px; border-radius: 8px; font-family: inherit; font-size: 13px;
    outline: none; transition: border-color .15s, box-shadow .15s; letter-spacing: .03em; }
  #hz-modal input:focus { border-color: #00f0ff; box-shadow: 0 0 12px rgba(0,240,255,.3); }
  #hz-modal .hz-modal-actions { display:flex; gap: 8px; margin-top: 16px; }
  #hz-modal button { flex: 1; padding: 10px; border-radius: 8px; font-family: inherit;
    font-size: 11px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer;
    background: transparent; border: 1px solid rgba(0,240,255,.4); color: #00f0ff;
    transition: all .15s; }
  #hz-modal button.primary { background: linear-gradient(135deg, #00f0ff, #ff2bd6); color:#000;
    border-color: transparent; font-weight: 700; }
  #hz-modal button:hover { box-shadow: 0 0 14px rgba(0,240,255,.4); }
  #hz-modal small { display:block; margin-top: 10px; font-size: 9px; color:#5a6b85; letter-spacing:.06em; line-height: 1.5; }
  #hz-modal code { color:#00f0ff; background: rgba(0,240,255,.08); padding: 1px 5px; border-radius: 4px; }
  `;

  function $(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function injectStyles() { const s = document.createElement("style"); s.textContent = STYLE; document.head.appendChild(s); }

  // ---------- Token storage (key kept as `carIp` per spec) ----------
  function getToken() {
    const v = localStorage.getItem("carIp");
    return v ? v.trim() : "";
  }
  function setToken(v) {
    const val = (v || "").trim();
    localStorage.setItem("carIp", val);
    return val;
  }
  function maskToken(t) {
    if (!t) return "no token";
    if (t.length <= 8) return t;
    return t.slice(0, 4) + "…" + t.slice(-4);
  }

  // ---------- State ----------
  const state = {
    log: [], maxLog: 5000,
    lastOk: null, lastLatency: null, consecutiveFails: 0,
    online: false,         // last reported isHardwareConnected
    pollMs: 3000,
    open: false,
  };

  // ---------- DOM ----------
  const root = $(`
    <div id="hz-addon" aria-label="Blynk Cloud Link Status">
      <button id="hz-trigger" type="button" aria-haspopup="true" aria-expanded="false">
        <span class="hz-dot err" id="hz-trig-dot"></span>
        <span id="hz-trig-label">No Cloud</span>
        <span class="hz-lat" id="hz-trig-lat">—</span>
        <span class="hz-caret">▾</span>
      </button>
      <button id="hz-ipbtn" type="button" title="Configure Blynk Auth Token">⚙ Token</button>
      <section id="hz-panel" role="menu">
        <h4>Blynk Link Status</h4>
        <div class="hz-row"><span class="hz-label">Status</span><span class="hz-val err" id="hz-status">no cloud</span></div>
        <div class="hz-row"><span class="hz-label">Latency</span><span class="hz-val" id="hz-lat">— ms</span></div>
        <div class="hz-row"><span class="hz-label">Last seen</span><span class="hz-val" id="hz-last">never</span></div>
        <div class="hz-row"><span class="hz-label">Fails</span><span class="hz-val" id="hz-fail">0</span></div>
        <div class="hz-row"><span class="hz-label">Logged</span><span class="hz-val" id="hz-count">0</span></div>
        <div class="hz-actions">
          <button class="hz-btn" id="hz-csv">CSV</button>
          <button class="hz-btn" id="hz-json">JSON</button>
          <button class="hz-btn pink" id="hz-clear">Clear</button>
        </div>
        <footer id="hz-ip">token: not configured</footer>
      </section>
    </div>
  `);

  const modal = $(`
    <div id="hz-modal-bg" role="dialog" aria-modal="true" aria-labelledby="hz-modal-title">
      <div id="hz-modal">
        <h3 id="hz-modal-title">Connect to Blynk Cloud</h3>
        <p>Paste your Blynk Auth Token from <code>Blynk.Console → Devices → Hazard Recon → Device Info</code>. Your car must be powered on and connected to Wi-Fi.</p>
        <label for="hz-modal-input">Blynk Auth Token</label>
        <input id="hz-modal-input" type="text" placeholder="Paste Blynk Auth Token" autocomplete="off" spellcheck="false" />
        <div class="hz-modal-actions">
          <button id="hz-modal-cancel" type="button">Cancel</button>
          <button id="hz-modal-save" type="button" class="primary">Save & Connect</button>
        </div>
        <small>Token is stored locally in your browser only. Once saved, the dashboard will route motor commands to <code>blynk.cloud</code> and stream live telemetry every 3 s — works from anywhere on the internet.</small>
      </div>
    </div>
  `);

  // ---------- Helpers ----------
  function fmtAgo(ts) {
    if (!ts) return "never"; const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return s + "s ago"; const m = Math.floor(s / 60); return m + "m ago";
  }

  function statusClass() {
    if (!getToken()) return "err";
    if (!state.lastOk) return "err";
    if (state.online && state.consecutiveFails === 0) return "ok";
    if (state.consecutiveFails < 3) return "warn";
    return "err";
  }
  function statusText() {
    if (!getToken()) return "no token";
    if (!state.lastOk) return "no cloud";
    if (state.online && state.consecutiveFails === 0) return "global link active";
    if (!state.online) return "device offline";
    return "unstable";
  }

  function render() {
    const tok = getToken();
    const cls = statusClass();
    const txt = statusText();

    root.querySelector("#hz-trig-dot").className = "hz-dot " + cls;
    const label = root.querySelector("#hz-trig-label");
    label.className = cls;
    label.textContent = txt;
    root.querySelector("#hz-trig-lat").textContent =
      state.lastLatency != null ? state.lastLatency + "ms" : "—";

    const st = root.querySelector("#hz-status");
    st.className = "hz-val " + cls;
    st.textContent = txt;
    root.querySelector("#hz-lat").textContent = state.lastLatency != null ? state.lastLatency + " ms" : "— ms";
    root.querySelector("#hz-last").textContent = fmtAgo(state.lastOk);
    root.querySelector("#hz-fail").textContent = state.consecutiveFails;
    root.querySelector("#hz-count").textContent = state.log.length;
    root.querySelector("#hz-ip").textContent = tok ? "token: " + maskToken(tok) : "token: not configured (tap ⚙ Token)";
  }

  // ---------- Polling Blynk Cloud ----------
  async function poll() {
    const tok = getToken();
    if (!tok) { state.online = false; render(); return; }
    const t0 = performance.now();
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5000);
      const url = `https://blynk.cloud/external/api/isHardwareConnected?token=${encodeURIComponent(tok)}`;
      const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      clearTimeout(to);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = (await res.text()).trim().toLowerCase();
      state.lastLatency = Math.round(performance.now() - t0);
      state.lastOk = Date.now();
      state.consecutiveFails = 0;
      state.online = (text === "true");
      state.log.push({
        ts: state.lastOk,
        latency: state.lastLatency,
        online: state.online,
      });
      if (state.log.length > state.maxLog) state.log.splice(0, state.log.length - state.maxLog);
    } catch (_) {
      state.consecutiveFails++;
      state.lastLatency = null;
      state.online = false;
    }
    render();
  }

  // ---------- Export ----------
  function download(name, mime, data) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function exportCSV() {
    if (!state.log.length) return;
    const head = "iso,unix_ms,online,latency_ms\n";
    const rows = state.log.map(r => [
      new Date(r.ts).toISOString(), r.ts, r.online ? 1 : 0, r.latency ?? ""
    ].join(",")).join("\n");
    download(`hazard-link-${Date.now()}.csv`, "text/csv", head + rows);
  }
  function exportJSON() {
    if (!state.log.length) return;
    download(`hazard-link-${Date.now()}.json`, "application/json",
      JSON.stringify({ exportedAt: new Date().toISOString(), count: state.log.length, samples: state.log }, null, 2));
  }
  function clearLog() {
    if (!state.log.length) return;
    if (confirm("Clear " + state.log.length + " link samples?")) { state.log = []; render(); }
  }

  function setOpen(open) {
    state.open = open;
    root.classList.toggle("open", open);
    root.querySelector("#hz-trigger").setAttribute("aria-expanded", String(open));
  }

  function openModal() {
    const input = modal.querySelector("#hz-modal-input");
    input.value = getToken();
    modal.classList.add("open");
    setTimeout(() => input.focus(), 50);
  }
  function closeModal() { modal.classList.remove("open"); }

  function boot() {
    injectStyles();
    document.body.appendChild(root);
    document.body.appendChild(modal);

    root.querySelector("#hz-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!state.open);
    });
    root.querySelector("#hz-ipbtn").addEventListener("click", (e) => {
      e.stopPropagation();
      openModal();
    });
    root.querySelector("#hz-panel").addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => { if (state.open) setOpen(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modal.classList.contains("open")) closeModal();
        else if (state.open) setOpen(false);
      }
    });

    root.querySelector("#hz-csv").addEventListener("click", exportCSV);
    root.querySelector("#hz-json").addEventListener("click", exportJSON);
    root.querySelector("#hz-clear").addEventListener("click", clearLog);

    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector("#hz-modal-cancel").addEventListener("click", closeModal);
    modal.querySelector("#hz-modal-save").addEventListener("click", () => {
      const v = modal.querySelector("#hz-modal-input").value;
      setToken(v);
      closeModal();
      render();
      poll();
    });
    modal.querySelector("#hz-modal-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") modal.querySelector("#hz-modal-save").click();
    });

    render();
    setInterval(poll, state.pollMs);
    setInterval(render, 1000);
    poll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
