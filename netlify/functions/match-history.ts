import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /match-history?id=<uuid>
 * Porting di GET /match/{match_id}/history (server.py) — statistiche
 * globali + per-campionato usate come contesto nel prompt AI.
 */
function fmt(docs: any[]): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const d of docs) {
    const total = d.total || 0;
    const missed = d.missed_wins || 0;
    if (total === 0 && missed === 0) continue;
    const wins = d.wins || 0;
    const rate = total > 0 ? (wins / total) * 100 : 0;
    const fam = d.family || "";
    if (!out[fam]) out[fam] = [];
    out[fam].push({
      market: d.market,
      wins,
      total,
      win_rate: Math.round(rate * 10) / 10,
      missed,
    });
  }
  return out;
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "Parametro 'id' mancante" }, 400);

  try {
    const matches = await pgGet(`matches?id=eq.${encodeURIComponent(id)}&select=manifestazione`);
    if (!matches.length) return jsonResponse({ error: "match not found" }, 404);
    const league: string | null = matches[0].manifestazione || null;

    const globalDocs = await pgGet(`market_scores?league=is.null&select=*&order=total.desc&limit=100`);
    const leagueDocs = league
      ? await pgGet(`market_scores?league=eq.${encodeURIComponent(league)}&select=*&order=total.desc&limit=100`)
      : [];

    return jsonResponse({
      league,
      global: fmt(globalDocs),
      league_specific: fmt(leagueDocs),
    });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
