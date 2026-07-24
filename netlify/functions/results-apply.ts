import { jsonResponse } from "./lib/supabaseRest";
import { parseResult } from "./lib/marketEval";
import { applyMatchResult } from "./lib/applyResult";

/**
 * POST /results-apply
 * Body: { id, score }
 * Porting di POST /results/apply (server.py) — applicazione manuale di un
 * risultato rivisto dall'utente (dopo il fetch automatico).
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let body: { id?: string; score?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const { id, score } = body;
  if (!id || !score) return jsonResponse({ error: "id e score richiesti" }, 400);

  const parsed = parseResult(score);
  if (!parsed) return jsonResponse({ error: "invalid score" }, 400);
  const [home, away] = parsed;

  try {
    await applyMatchResult(id, score, home, away);
    return jsonResponse({ ok: true, result: score });
  } catch (e: any) {
    const status = e.message === "Match not found" ? 404 : 502;
    return jsonResponse({ error: e.message }, status);
  }
};
