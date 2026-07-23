import { pgGet, jsonResponse, rowToMatch } from "./lib/supabaseRest";

/**
 * GET /selected-list
 * Porting di GET /matches/selected/list (server.py) — tutte le partite
 * attualmente selezionate (Schedina), con il pronostico piu' recente allegato.
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgGet(`matches?selected=eq.true&select=*&order=day.asc,time.asc`);
    const matches = rows.map(rowToMatch);

    if (matches.length) {
      const ids = matches.map((m: any) => `"${m.id}"`).join(",");
      const preds = await pgGet(
        `predictions?match_id=in.(${ids})&select=*&order=created_at.desc`
      );
      const latestByMatch: Record<string, any> = {};
      for (const p of preds) {
        if (!latestByMatch[p.match_id]) latestByMatch[p.match_id] = p;
      }
      for (const m of matches) (m as any).prediction = latestByMatch[m.id] || null;
    }

    return jsonResponse(matches);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
