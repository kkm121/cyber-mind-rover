// Neural OS chat proxy → Lovable AI Gateway
// Public function (no JWT). Returns plain text (or a JSON-array string for sequences).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, telemetry } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const t = telemetry || {};
    const sysPrompt =
`You are Neural OS, the onboard tactical AI for a Hazard Recon Car.
Current Telemetry: Core Temp ${t.t ?? "?"}°C, Humidity ${t.h ?? "?"}%, Gas Density ${t.g ?? "?"} PPM. Sensor Error: ${t.dht_err ? "YES" : "NO"}.
CRITICAL DIRECTIVE: If the user commands a physical maneuver (e.g., "do a 3-point turn", "evade right"), output ONLY a valid JSON array, no markdown.
Format: [{"cmd":"F","dur":1000},{"cmd":"S","dur":0}].
Valid cmds: F (Forward), B (Reverse), L (Turn Left), R (Turn Right), S (Stop). dur = milliseconds.
If the user just asks a question, answer in brief tactical sci-fi text (max 2 sentences). NEVER mix prose with JSON.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace → Usage." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    let reply: string =
      data?.choices?.[0]?.message?.content?.toString().trim() || "NO RESPONSE FROM MAINFRAME.";

    // strip code fences if present
    if (reply.startsWith("```json")) reply = reply.slice(7);
    if (reply.startsWith("```")) reply = reply.slice(3);
    if (reply.endsWith("```")) reply = reply.slice(0, -3);
    reply = reply.trim();

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("neural-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
