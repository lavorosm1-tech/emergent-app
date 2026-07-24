import { pgDelete, jsonResponse } from "./lib/supabaseRest";

/**
 * POST /stats-reset
 * Porting di POST /stats/reset (server.py) — azzera market_scores e
 * family_counters (l'apprendimento del motore), NON tocca le partite.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);
  try {
    await pgDelete(`market_scores?id=not.is.null`);
    await pgDelete(`family_counters?id=not.is.null`);
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
