import { jsonResponse, pgGet, pgPatch } from "./lib/supabaseRest";

/**
 * POST /save-verdict
 * Body: { matchId, market, prob? }
 *
 * FASE 0 — salva il verdetto finale della fusione (buildFinalVerdict), che
 * finora veniva calcolato solo nel browser e andava perso alla chiusura della
 * schermata. Due effetti:
 *  1. riaprendo la partita il pick torna com'era, senza ricalcolo;
 *  2. a risultato inserito si può misurare la precisione della fusione, non
 *     solo quella dell'IA (che è l'unica registrata oggi in main_prediction).
 *
 * Non tocca `main_prediction` né alcun campo esistente, e non riscrive nulla
 * su partite già concluse (registrare un pick dopo il fatto falserebbe la
 * pagella).
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let body: { matchId?: string; market?: string; prob?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const { matchId, market, prob } = body;
  if (!matchId || !market) return jsonResponse({ error: "matchId e market richiesti" }, 400);

  try {
    const rows = await pgGet(
      `matches?id=eq.${encodeURIComponent(matchId)}&select=id,result,pick_finale,pick_finale_prob`,
    );
    if (!rows.length) return jsonResponse({ error: "Match not found" }, 404);

    const row = rows[0];
    if (row.result) return jsonResponse({ ok: true, skipped: "partita già conclusa" });

    const nextProb = typeof prob === "number" && isFinite(prob) ? prob : null;
    if (row.pick_finale === market && row.pick_finale_prob === nextProb) {
      return jsonResponse({ ok: true, unchanged: true });
    }

    await pgPatch(`matches?id=eq.${encodeURIComponent(matchId)}`, {
      pick_finale: market,
      pick_finale_prob: nextProb,
    });
    return jsonResponse({ ok: true, pick_finale: market });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
