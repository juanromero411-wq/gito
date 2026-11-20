const SYSTEM = `Eres Dito, el guía amigable del Complejo Deportivo Ditaires (Itagüí, Colombia). Ayudas a los visitantes, incluidas personas mayores que usan poco la tecnología. Responde en español, en máximo 4 frases cortas, con palabras sencillas, tono cercano y sin markdown. Para preguntas sobre clases y horarios usa SOLO la lista de HORARIOS DE CLASES que recibes; si algo no está en la lista (precios, profesores, inscripciones, salones), di que no lo sabes y sugiere preguntar al personal. No inventes ubicaciones dentro del complejo (baños, salidas, parqueaderos): hoy no hay mapas; sugiere preguntarle al personal de vigilancia. Para otras preguntas generales puedes usar tu conocimiento, pero no puedes navegar internet; si no estás seguro, dilo.`;

const resp = (statusCode, o) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(o),
});

exports.handler = async (event) => {
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = event.headers.origin || event.headers.Origin || "";
  if (allowed && origin && origin !== allowed) return resp(403, { error: "forbidden" });
  if (event.httpMethod !== "POST") return resp(405, { error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return resp(500, { error: "sin_clave" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return resp(400, { error: "json" }); }
  const q = String(body.q || "").trim().slice(0, 300);
  if (!q) return resp(400, { error: "vacia" });
  const ctx = String(body.ctx || "").slice(0, 3000);

  const raw = (Array.isArray(body.turns) ? body.turns : [])
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .map((t) => ({ role: t.role, content: t.content.slice(0, 800) }))
    .slice(-6);
  const turns = [];
  for (const t of raw) {
    const prev = turns[turns.length - 1];
    if ((!prev && t.role === "user") || (prev && prev.role !== t.role)) turns.push(t);
  }
  while (turns.length && turns[turns.length - 1].role !== "assistant") turns.pop();
  const messages = [...turns, { role: "user", content: q }];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.DITO_MODEL || "claude-haiku-5-5",
        max_tokens: 400,
        system: SYSTEM + (ctx ? "\n\nHORARIOS DE CLASES:\n" + ctx : ""),
        messages,
      }),
    });
    if (!r.ok) return resp(502, { error: "api_" + r.status });
    const d = await r.json();
    const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return resp(200, { text: text || "No se me ocurrió qué responder, intenta con otra pregunta." });
  } catch (e) {
    return resp(502, { error: "red" });
  }
};
