/* Hazard Recon — Global Addon (Blynk Version)
   This script redirects all motor and telemetry calls to the Blynk Cloud API.
   The "IP" box on the website should now contain your BLYNK_AUTH_TOKEN. */

(function () {
  "use strict";

  function getBlynkToken() {
    const keys = ["carIp", "car_ip", "CAR_IP", "hazardCarIp", "settings.carIp"];
    for (const k of keys) { const v = localStorage.getItem(k); if (v) return v.trim(); }
    return "YourAuthToken";
  }

  // Patch fetch so existing app.html calls are routed to Blynk Cloud
  (function patchFetch() {
    const orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const token = getBlynkToken();

        // 1. REWRITE COMMANDS (/action?dir=F)
        if (url.startsWith("/action")) {
          const dir = new URLSearchParams(url.split('?')[1]).get('dir') || "S";
          const blynkUrl = `https://blynk.cloud/external/api/update?token=${token}&V0=${dir}`;
          // Use no-cors for fast one-way commands
          return orig(blynkUrl, { mode: "no-cors" });
        }

        // 2. REWRITE TELEMETRY (/data)
        if (url.startsWith("/data")) {
          // Get V1 (Temp), V2 (Hum), V3 (Gas)
          const blynkUrl = `https://blynk.cloud/external/api/get?token=${token}&V1&V2&V3`;
          return orig(blynkUrl).then(res => res.json()).then(data => {
            // Convert Blynk response back to Hazard format
            return new Response(JSON.stringify({
              t: parseFloat(data.V1) || 0,
              h: parseFloat(data.V2) || 0,
              g: parseInt(data.V3) || 0,
              dht_err: !data.V1
            }), { headers: { 'Content-Type': 'application/json' } });
          });
        }
      } catch (_) {}
      return orig(input, init);
    };
  })();

  console.log("🚀 Neural OS: Global Blynk Link Active");
})();
