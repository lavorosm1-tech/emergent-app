import { pgGet, pgPost, jsonResponse } from "./lib/supabaseRest";

/**
 * POST /import-db
 * Porting di POST /import (server.py) — reimporta matches/predictions da un
 * export precedente, saltando le partite già esistenti (stessa chiave
 * squadra1+squadra2+day usata dall'originale).
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let body: { matches?: any[]; predictions?: any[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const matches = body.matches || [];
  const predictions = body.predictions || [];
  let insertedMatches = 0;
  let skippedMatches = 0;

  try {
    for (const m of matches) {
      const existing = await pgGet(
        `matches?squadra1=eq.${encodeURIComponent(m.squadra1)}&squadra2=eq.${encodeURIComponent(m.squadra2)}&day=eq.${encodeURIComponent(m.day)}&select=id&limit=1`,
      );
      if (existing.length) {
        skippedMatches++;
        continue;
      }
      const { id: _drop, ...rest } = m;
      await pgPost(`matches`, rest, "return=minimal");
      insertedMatches++;
    }

    let insertedPredictions = 0;
    for (const p of predictions) {
      const existing = p.match_id
        ? await pgGet(`predictions?match_id=eq.${encodeURIComponent(p.match_id)}&select=id&limit=1`)
        : [];
      if (existing.length) continue;
      const { id: _drop, ...rest } = p;
      await pgPost(`predictions`, rest, "return=minimal");
      insertedPredictions++;
    }

    return jsonResponse({
      inserted_matches: insertedMatches,
      skipped_matches: skippedMatches,
      inserted_predictions: insertedPredictions,
    });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
