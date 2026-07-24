import { jsonResponse } from "./lib/supabaseRest";
import { parseResult } from "./lib/marketEval";
import { applyMatchResult } from "./lib/applyResult";

/**
 * POST /results-bulk
 * Body: { items: [{ id, result }, ...] }
 * Porting di POST /results/bulk (server.py) — applicazione multipla di
 * risultati (usato dallo "Schedina risultati automatici / bulk").
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let body: { items?: { id: string; result: string }[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const items = body.items || [];
  let count = 0;
  const learnings: any[] = [];

  for (const item of items) {
    if (!item.id || !item.result) continue;
    const parsed = parseResult(item.result);
    if (!parsed) continue;
    const [home, away] = parsed;
    try {
      const learning = await applyMatchResult(item.id, item.result, home, away);
      count++;
      if (learning.applied && learning.main_prediction) {
        learnings.push({
          match_id: item.id,
          main_prediction: learning.main_prediction,
          result_ok: learning.result_ok,
        });
      }
    } catch {
      // partita non trovata o errore: salta, come nel comportamento originale
      continue;
    }
  }

  return jsonResponse({ updated: count, learnings });
};
