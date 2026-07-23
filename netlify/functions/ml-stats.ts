import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /ml-stats
 * Porting di GET /ml/stats (server.py) — usato dalla schermata "Profilo".
 * Restituisce { markets: [...], family_totals: {...} } dai dati GLOBALI
 * (league IS NULL) di market_scores / family_counters.
 */
export default async (): Promise<Response> => {
  try {
    const docs = await pgGet(`market_scores?league=is.null&select=*&limit=500`);
    const counters = await pgGet(`family_counters?league=is.null&select=*&limit=50`);

    const familyTotals: Record<string, number> = {};
    for (const c of counters) familyTotals[c.family] = c.matches || 0;

    const out = [];
    for (const d of docs) {
      const total = d.total || 0;
      const missed = d.missed_wins || 0;
      const wins = d.wins || 0;
      const family = d.family || "";
      if (total === 0 && missed === 0) continue;
      const ft = familyTotals[family] || 0;
      out.push({
        family,
        market: d.market || "",
        wins,
        losses: Math.max(0, total - wins),
        total,
        missed,
        family_total: ft,
        miss_rate: ft > 0 ? Math.round((missed / ft) * 1000) / 10 : 0,
        win_rate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      });
    }
    out.sort((a, b) => b.total - a.total || b.win_rate - a.win_rate);

    return jsonResponse({ markets: out, family_totals: familyTotals });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
