import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /match-detail?id=<uuid>
 * Porting di GET /matches/{match_id} (server.py) — dettaglio partita + ultimo pronostico collegato.
 */
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "Parametro 'id' mancante" }, 400);

  try {
    const matches = await pgGet(`matches?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!matches.length) return jsonResponse({ error: "Match not found" }, 404);
    const match = matches[0];

    const preds = await pgGet(
      `predictions?match_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=1`
    );
    match.prediction = preds.length ? preds[0] : null;

    return jsonResponse(match);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
