/* Hazard Recon — Addon overlay
   Adds: (1) Connection Health panel with ping latency, status, auto-reconnect attempts.
         (2) Telemetry session log + CSV/JSON export.
   Non-intrusive: reads carIp from localStorage (same key the host app uses, with fallbacks),
   polls /data on its own, and renders a fixed-position glass panel. Never mutates host UI. */

(function () {
  "use strict";

  const STYLE = `
  #hz-addon { position: fixed; top: 12px; right: 12px; z-index: 99999;
    font-family: 'Space Mono', ui-monospace, monospace; color: #d6f6ff;
    width: 280px; max-width: calc(100vw - 24px);
    background: rgba(8, 10, 22, 0.55); backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 14px;
    box-shadow: 0 8px 40px rgba(0, 240, 255, 0.12), inset 0 0 0 1px rgba(255,255,255,0.03);
    padding: 12px 14px; transition: transform .25s ease, opacity .25s ease;
  }
  #hz-addon.hz-min { transform: translateY(-100%) translateY(34px); opacity: .85; }
  #hz-addon header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  #hz-addon h4 { margin:0; font-family:'Syncopate', sans-serif; font-size:10px; letter-spacing:.18em;
    color:#00f0ff; text-transform:uppercase; }
  #hz-addon .hz-btn { background:transparent; border:1px solid rgba(0,240,255,.35); color:#00f0ff;
    font-family:inherit; font-size:10px; padding:4px 8px; border-radius:6px; cursor:pointer;
    letter-spacing:.08em; text-transform:uppercase; transition: all .15s; }
  #hz-addon .hz-btn:hover { background:rgba(0,240,255,.12); box-shadow:0 0 12px rgba(0,240,255,.4); }
  #hz-addon .hz-btn.pink { color:#ff2bd6; border-color:rgba(255,43,214,.4); }
  #hz-addon .hz-btn.pink:hover { background:rgba(255,43,214,.1); box-shadow:0 0 12px rgba(255,43,214,.4); }
  #hz-addon .hz-row { display:flex; justify-content:space-between; align-items:center;
    font-size:11px; padding:4px 0; border-bottom:1px dashed rgba(255,255,255,.06); }
  #hz-addon .hz-row:last-child { border-bottom:0; }
  #hz-addon .hz-label { color:#7a8aa3; text-transform:uppercase; letter-spacing:.1em; font-size:9px; }
  #hz-addon .hz-val { color:#fff; font-weight:700; }
  #hz-addon .hz-dot { display:inline-block; width:8px; height:8px; border-radius:50%;
    margin-right:6px; vertical-align:middle; box-shadow:0 0 8px currentColor; }
  #hz-addon .ok    { color:#22f5a3; }
  #hz-addon .warn  { color:#ffb648; }
  #hz-addon .err   { color:#ff3860; }
  #hz-addon .hz-actions { display:flex; gap:6px; margin-top:10px; }
  #hz-addon .hz-actions .hz-btn { flex:1; }
  #hz-addon footer { margin-top:8px; font-size:9px; color:#5a6b85; text-align:center; letter-spacing:.08em; }
  @media (max-width: 640px) {
    #hz-addon { width: 220px; top: 8px; right: 8px; padding: 10px; }
  }
  `;

  function $(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  function injectStyles() {
    const s = document.createElement("style"); s.textContent = STYLE; document.head.appendChild(s);
  }

  // Try several known keys the host app might use.
  function getCarIp() {
    const keys = ["carIp", "car_ip", "CAR_IP", "hazardCarIp", "settings.carIp"];
    for (const k of keys) { const v = localStorage.getItem(k); if (v) return v.replace(/\/+$/, ""); }
    // Try parsed settings object
    try {
      const raw = localStorage.getItem("settings") || localStorage.getItem("hazardSettings");
      if (raw) { const o = JSON.parse(raw); if (o && (o.carIp || o.ip)) return (o.carIp || o.ip).replace(/\/+$/, ""); }
    } catch (_) {}
    return null;
  }

  // ---------- State ----------
  const state = {
    log: [],            // {ts, t, h, g, dht_err}
    maxLog: 5000,
    lastOk: null,
    lastLatency: null,
    consecutiveFails: 0,
    pollMs: 2000,
    minimized: false,
  };

  // ---------- UI ----------
  const panel = $(`
    <section id="hz-addon" aria-label="Connection Health & Telemetry Log">
      <header>
        <h4><span class="hz-dot err" id="hz-dot"></span>Link Status</h4>
        <button class="hz-btn" id="hz-toggle" title="Minimize">_</button>
      </header>
      <div class="hz-row"><span class="hz-label">Status</span><span class="hz-val err" id="hz-status">offline</span></div>
      <div class="hz-row"><span class="hz-label">Latency</span><span class="hz-val" id="hz-lat">— ms</span></div>
      <div class="hz-row"><span class="hz-label">Last seen</span><span class="hz-val" id="hz-last">never</span></div>
      <div class="hz-row"><span class="hz-label">Fails</span><span class="hz-val" id="hz-fail">0</span></div>
      <div class="hz-row"><span class="hz-label">Logged</span><span class="hz-val" id="hz-count">0</span></div>
      <div class="hz-actions">
        <button class="hz-btn" id="hz-csv">CSV</button>
        <button class="hz-btn" id="hz-json">JSON</button>
        <button class="hz-btn pink" id="hz-clear">Clear</button>
      </div>
      <footer id="hz-ip">car: not configured</footer>
    </section>
  `);

  function fmtTime(ts) {
    const d = new Date(ts), p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function fmtAgo(ts) {
    if (!ts) return "never"; const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return s + "s ago"; const m = Math.floor(s / 60); return m + "m ago";
  }

  function render() {
    const ip = getCarIp();
    panel.querySelector("#hz-ip").textContent = ip ? "car: " + ip : "car: not configured (open Settings)";
    const dot = panel.querySelector("#hz-dot"), st = panel.querySelector("#hz-status");
    dot.className = "hz-dot " + (state.consecutiveFails === 0 && state.lastOk ? "ok"
      : state.consecutiveFails < 3 && state.lastOk ? "warn" : "err");
    st.className = "hz-val " + dot.className.split(" ")[1];
    st.textContent = !ip ? "no ip" : !state.lastOk ? "offline"
      : state.consecutiveFails === 0 ? "online"
      : state.consecutiveFails < 3 ? "unstable" : "lost";
    panel.querySelector("#hz-lat").textContent = state.lastLatency != null ? state.lastLatency + " ms" : "— ms";
    panel.querySelector("#hz-last").textContent = fmtAgo(state.lastOk);
    panel.querySelector("#hz-fail").textContent = state.consecutiveFails;
    panel.querySelector("#hz-count").textContent = state.log.length;
  }

  // ---------- Polling ----------
  async function poll() {
    const ip = getCarIp();
    if (!ip) { render(); return; }
    const t0 = performance.now();
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(ip + "/data", { signal: ctl.signal, cache: "no-store" });
      clearTimeout(to);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.lastLatency = Math.round(performance.now() - t0);
      state.lastOk = Date.now();
      state.consecutiveFails = 0;
      state.log.push({
        ts: state.lastOk,
        t: data.t, h: data.h, g: data.g,
        dht_err: !!data.dht_err,
        latency: state.lastLatency,
      });
      if (state.log.length > state.maxLog) state.log.splice(0, state.log.length - state.maxLog);
    } catch (e) {
      state.consecutiveFails++;
      state.lastLatency = null;
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
    const head = "iso,unix_ms,temp_c,humidity,gas_ppm,dht_err,latency_ms\n";
    const rows = state.log.map(r => [
      new Date(r.ts).toISOString(), r.ts, r.t ?? "", r.h ?? "", r.g ?? "", r.dht_err ? 1 : 0, r.latency ?? ""
    ].join(",")).join("\n");
    download(`hazard-telemetry-${Date.now()}.csv`, "text/csv", head + rows);
  }
  function exportJSON() {
    if (!state.log.length) return;
    download(`hazard-telemetry-${Date.now()}.json`, "application/json",
      JSON.stringify({ exportedAt: new Date().toISOString(), count: state.log.length, samples: state.log }, null, 2));
  }
  function clearLog() {
    if (!state.log.length) return;
    if (confirm("Clear " + state.log.length + " telemetry samples?")) { state.log = []; render(); }
  }

  // ---------- Boot ----------
  function boot() {
    injectStyles();
    document.body.appendChild(panel);
    panel.querySelector("#hz-csv").addEventListener("click", exportCSV);
    panel.querySelector("#hz-json").addEventListener("click", exportJSON);
    panel.querySelector("#hz-clear").addEventListener("click", clearLog);
    panel.querySelector("#hz-toggle").addEventListener("click", () => {
      state.minimized = !state.minimized;
      panel.classList.toggle("hz-min", state.minimized);
    });
    render();
    setInterval(poll, state.pollMs);
    setInterval(render, 1000); // refresh "last seen"
    poll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
