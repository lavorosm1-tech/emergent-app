import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /match-candidates?id=<uuid>
 * Porting di GET /match/{match_id}/candidates (server.py) — mercati "gialli"
 * (alta miss_rate nella famiglia) da segnalare come opportunità mancate.
 */
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "Parametro 'id' mancante" }, 400);

  try {
    const matches = await pgGet(`matches?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!matches.length) return jsonResponse({ error: "match not found" }, 404);
    const match = matches[0];

    const preds = await pgGet(
      `predictions?match_id=eq.${encodeURIComponent(id)}&select=family&order=created_at.desc&limit=1`,
    );
    const family: string | null = preds[0]?.family || match.family || null;

    let familyTotal = 0;
    if (family) {
      const counters = await pgGet(
        `family_counters?family=eq.${encodeURIComponent(family)}&league=is.null&select=matches&limit=1`,
      );
      familyTotal = counters[0]?.matches || 0;
    }

    let scoreFilter = `league=is.null&or=(total.lte.0,total.is.null)`;
    if (family) scoreFilter += `&family=eq.${encodeURIComponent(family)}`;
    const docs = await pgGet(`market_scores?${scoreFilter}&select=*&limit=100`);

    const out: { market: string; family: string; missed: number; family_total: number; miss_rate: number }[] = [];
    for (const d of docs) {
      const missed = d.missed_wins || 0;
      if (missed < 5) continue;
      const missRate = familyTotal > 0 ? (missed / familyTotal) * 100 : 0;
      if (missRate < 50) continue;
      out.push({
        market: d.market,
        family: d.family,
        missed,
        family_total: familyTotal,
        miss_rate: Math.round(missRate * 10) / 10,
      });
    }
    out.sort((a, b) => b.miss_rate - a.miss_rate);

    return jsonResponse({ candidates: out, family, family_total: familyTotal });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
