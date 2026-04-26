/* Hazard Recon — Global Addon (Blynk Version v1.1)
   - Improved Sensor Parsing (Fixed NaN/Straight Line issue)
   - Improved Error Handling */

(function () {
  "use strict";

  function getBlynkToken() {
    const keys = ["carIp", "car_ip", "CAR_IP", "hazardCarIp", "settings.carIp"];
    for (const k of keys) { const v = localStorage.getItem(k); if (v) return v.trim(); }
    return "YourAuthToken";
  }

  (function patchFetch() {
    const orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const token = getBlynkToken();

        if (url.startsWith("/action")) {
          const dir = new URLSearchParams(url.split('?')[1]).get('dir') || "S";
          const blynkUrl = `https://blynk.cloud/external/api/update?token=${token}&V0=${dir}`;
          return orig(blynkUrl, { mode: "no-cors" });
        }

        if (url.startsWith("/data")) {
          const blynkDataUrl = `https://blynk.cloud/external/api/get?token=${token}&V1&V2&V3&V4`;
          const blynkStatusUrl = `https://blynk.cloud/external/api/isHardwareConnected?token=${token}`;

          return Promise.all([
            orig(blynkDataUrl).then(r => r.json()).catch(() => ({})),
            orig(blynkStatusUrl).then(r => r.text()).catch(() => "false")
          ]).then(([data, status]) => {
            const isOnline = status.trim() === "true";
            const t = data.hasOwnProperty('V1') ? parseFloat(data.V1) : null;
            const g = data.hasOwnProperty('V3') ? parseInt(data.V3) : null;
            const s = data.hasOwnProperty('V4') ? parseInt(data.V4) : -100;
            
            return new Response(JSON.stringify({
              t: t !== null ? t : 0,
              h: data.V2 || 0,
              g: g !== null ? g : 0,
              rssi: s,
              dht_err: (t === null || !isOnline),
              is_online: isOnline
            }), { headers: { 'Content-Type': 'application/json' } });
          });
        }
      } catch (_) {}
      return orig(input, init);
    };
  })();

  console.log("🚀 Neural OS: Global v1.1 Active (Sensors Fixed)");
})();
