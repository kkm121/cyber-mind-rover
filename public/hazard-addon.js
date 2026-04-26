/* Hazard Recon — Addon overlay
   Compact "Link" pill in the top-right that expands into a dropdown panel:
   - Connection Health (status, latency, last seen, fail count)
   - Telemetry session log + CSV / JSON export
   Reads carIp from localStorage and polls /data on its own. Never mutates host UI. */

(function () {
  "use strict";

  const STYLE = `
  #hz-addon { position: fixed; top: 10px; right: 10px; z-index: 99999;
    font-family: 'Space Mono', ui-monospace, monospace; color: #d6f6ff; }
  #hz-addon * { box-sizing: border-box; }

  /* Trigger pill — tiny, unobtrusive */
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

  /* Dropdown panel */
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
  /* Landscape phones — keep it tight */
  @media (max-height: 480px) and (orientation: landscape) {
    #hz-trigger { padding: 4px 9px; font-size: 9px; }
    #hz-panel { padding: 10px 12px; width: 260px; }
    #hz-panel .hz-row { padding: 3px 0; font-size: 10px; }
  }

  /* Settings (IP) modal */
  #hz-ipbtn { margin-left: 6px; background: rgba(8,10,22,0.6); border: 1px solid rgba(255,43,214,0.4);
    color: #ff2bd6; border-radius: 999px; padding: 6px 10px; font-size: 10px; cursor: pointer;
    letter-spacing: .14em; text-transform: uppercase; font-family: inherit; line-height: 1;
    backdrop-filter: blur(12px); transition: all .15s; }
  #hz-ipbtn:hover { box-shadow: 0 0 14px rgba(255,43,214,.4); }
  #hz-modal-bg { position: fixed; inset: 0; background: rgba(2,4,12,.78); backdrop-filter: blur(8px);
    z-index: 100000; display: none; align-items: center; justify-content: center; padding: 20px; }
  #hz-modal-bg.open { display: flex; }
  #hz-modal { width: 100%; max-width: 440px; background: rgba(8,10,22,.92);
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
    outline: none; transition: border-color .15s, box-shadow .15s; }
  #hz-modal input:focus { border-color: #00f0ff; box-shadow: 0 0 12px rgba(0,240,255,.3); }
  #hz-modal .hz-modal-actions { display:flex; gap: 8px; margin-top: 16px; }
  #hz-modal button { flex: 1; padding: 10px; border-radius: 8px; font-family: inherit;
    font-size: 11px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer;
    background: transparent; border: 1px solid rgba(0,240,255,.4); color: #00f0ff;
    transition: all .15s; }
  #hz-modal button.primary { background: linear-gradient(135deg, #00f0ff, #ff2bd6); color:#000;
    border-color: transparent; font-weight: 700; }
  #hz-modal button:hover { box-shadow: 0 0 14px rgba(0,240,255,.4); }
  #hz-modal small { display:block; margin-top: 8px; font-size: 9px; color:#5a6b85; letter-spacing:.06em; }
  `;

  function $(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function injectStyles() { const s = document.createElement("style"); s.textContent = STYLE; document.head.appendChild(s); }

  function getCarIp() {
    const keys = ["carIp", "car_ip", "CAR_IP", "hazardCarIp", "settings.carIp"];
    for (const k of keys) { const v = localStorage.getItem(k); if (v) return v.replace(/\/+$/, ""); }
    try {
      const raw = localStorage.getItem("settings") || localStorage.getItem("hazardSettings");
      if (raw) { const o = JSON.parse(raw); if (o && (o.carIp || o.ip)) return (o.carIp || o.ip).replace(/\/+$/, ""); }
    } catch (_) {}
    return null;
  }
  function setCarIp(v) {
    let val = (v || "").trim().replace(/\/+$/, "");
    if (val && !/^https?:\/\//i.test(val)) val = "http://" + val;
    localStorage.setItem("carIp", val);
    return val;
  }

  // Patch fetch so existing app.html calls like fetch('/data') get rewritten to the car IP.
  (function patchFetch() {
    const orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url && url.startsWith("/") && !url.startsWith("//")) {
          const ip = getCarIp();
          // Don't rewrite app routes — only the hardware endpoints the firmware exposes.
          const hwPaths = ["/data", "/cmd", "/move", "/stop", "/forward", "/backward", "/left", "/right", "/status"];
          if (ip && hwPaths.some(p => url === p || url.startsWith(p + "?") || url.startsWith(p + "/"))) {
            const newUrl = ip + url;
            if (typeof input === "string") return orig(newUrl, init);
            return orig(new Request(newUrl, input), init);
          }
        }
      } catch (_) {}
      return orig(input, init);
    };
  })();

  const state = {
    log: [], maxLog: 5000,
    lastOk: null, lastLatency: null, consecutiveFails: 0,
    pollMs: 2000, open: false,
  };

  const root = $(`
    <div id="hz-addon" aria-label="Connection Health & Telemetry Log">
      <button id="hz-trigger" type="button" aria-haspopup="true" aria-expanded="false">
        <span class="hz-dot err" id="hz-trig-dot"></span>
        <span id="hz-trig-label">Link</span>
        <span class="hz-lat" id="hz-trig-lat">—</span>
        <span class="hz-caret">▾</span>
      </button>
      <button id="hz-ipbtn" type="button" title="Configure Car IP">⚙ IP</button>
      <section id="hz-panel" role="menu">
        <h4>Link Status</h4>
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
    </div>
  `);

  const modal = $(`
    <div id="hz-modal-bg" role="dialog" aria-modal="true" aria-labelledby="hz-modal-title">
      <div id="hz-modal">
        <h3 id="hz-modal-title">Car Connection</h3>
        <p>Enter the local IP address of your Hazard Recon Car. The dashboard will route all hardware requests (/data, /cmd, etc.) through this address.</p>
        <label for="hz-modal-input">Car Local IP Address</label>
        <input id="hz-modal-input" type="text" placeholder="http://192.168.43.50" autocomplete="off" spellcheck="false" />
        <div class="hz-modal-actions">
          <button id="hz-modal-cancel" type="button">Cancel</button>
          <button id="hz-modal-save" type="button" class="primary">Save & Connect</button>
        </div>
        <small>Tip: include the protocol, e.g. <code>http://192.168.1.42</code>. Stored locally in your browser.</small>
      </div>
    </div>
  `);

  function fmtAgo(ts) {
    if (!ts) return "never"; const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return s + "s ago"; const m = Math.floor(s / 60); return m + "m ago";
  }
  function statusClass() {
    if (!state.lastOk) return "err";
    if (state.consecutiveFails === 0) return "ok";
    if (state.consecutiveFails < 3) return "warn";
    return "err";
  }
  function statusText(ip) {
    if (!ip) return "no ip";
    if (!state.lastOk) return "offline";
    if (state.consecutiveFails === 0) return "online";
    if (state.consecutiveFails < 3) return "unstable";
    return "lost";
  }

  function render() {
    const ip = getCarIp();
    const cls = statusClass();
    const txt = statusText(ip);

    // Trigger pill
    root.querySelector("#hz-trig-dot").className = "hz-dot " + cls;
    root.querySelector("#hz-trig-label").className = cls;
    root.querySelector("#hz-trig-label").textContent = txt;
    root.querySelector("#hz-trig-lat").textContent =
      state.lastLatency != null ? state.lastLatency + "ms" : "—";

    // Panel
    const st = root.querySelector("#hz-status");
    st.className = "hz-val " + cls;
    st.textContent = txt;
    root.querySelector("#hz-lat").textContent = state.lastLatency != null ? state.lastLatency + " ms" : "— ms";
    root.querySelector("#hz-last").textContent = fmtAgo(state.lastOk);
    root.querySelector("#hz-fail").textContent = state.consecutiveFails;
    root.querySelector("#hz-count").textContent = state.log.length;
    root.querySelector("#hz-ip").textContent = ip ? "car: " + ip : "car: not configured (open Settings)";
  }

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
        ts: state.lastOk, t: data.t, h: data.h, g: data.g,
        dht_err: !!data.dht_err, latency: state.lastLatency,
      });
      if (state.log.length > state.maxLog) state.log.splice(0, state.log.length - state.maxLog);
    } catch (_) {
      state.consecutiveFails++;
      state.lastLatency = null;
    }
    render();
  }

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

  function setOpen(open) {
    state.open = open;
    root.classList.toggle("open", open);
    root.querySelector("#hz-trigger").setAttribute("aria-expanded", String(open));
  }

  function boot() {
    injectStyles();
    document.body.appendChild(root);

    root.querySelector("#hz-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!state.open);
    });
    root.querySelector("#hz-panel").addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => { if (state.open) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.open) setOpen(false); });

    root.querySelector("#hz-csv").addEventListener("click", exportCSV);
    root.querySelector("#hz-json").addEventListener("click", exportJSON);
    root.querySelector("#hz-clear").addEventListener("click", clearLog);

    render();
    setInterval(poll, state.pollMs);
    setInterval(render, 1000);
    poll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
