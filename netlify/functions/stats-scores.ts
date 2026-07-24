import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /stats-scores
 * Porting di GET /stats/scores (server.py) — punteggi mercati GLOBALI
 * (league=null), raggruppati per famiglia.
 */
export default async (): Promise<Response> => {
  try {
    const docs = await pgGet(`market_scores?league=is.null&select=*&limit=500`);
    const byFamily: Record<string, any[]> = {};
    for (const d of docs) {
      const total = d.total || 0;
      const wins = d.wins || 0;
      d.win_rate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
      const fam = d.family || "";
      if (!byFamily[fam]) byFamily[fam] = [];
      byFamily[fam].push(d);
    }
    for (const fam of Object.keys(byFamily)) {
      byFamily[fam].sort((a, b) => (b.win_rate - a.win_rate) || ((b.total || 0) - (a.total || 0)));
    }
    return jsonResponse(byFamily);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
