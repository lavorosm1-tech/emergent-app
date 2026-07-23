import { pgGet, pgPatch, pgRpc, jsonResponse } from "./lib/supabaseRest";
import { evaluateMarket, parseResult, STANDARD_MARKETS } from "./lib/marketEval";

/**
 * POST /match-result
 * Body: { "matchId": "<uuid>", "result": "2-1" }
 *
 * Porting di POST /matches/{match_id}/result (server.py) — salva il risultato
 * e aggiorna family_counters / market_scores (la parte di "apprendimento").
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let body: { matchId?: string; result?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const { matchId, result } = body;
  if (!matchId || !result) {
    return jsonResponse({ error: "Servono 'matchId' e 'result' (es. '2-1')" }, 400);
  }

  const parsed = parseResult(result);
  if (!parsed) {
    return jsonResponse({ error: "Formato risultato non valido (es. 2-1)" }, 400);
  }
  const [home, away] = parsed;

  try {
    const matches = await pgGet(`matches?id=eq.${encodeURIComponent(matchId)}&select=*`);
    if (!matches.length) return jsonResponse({ error: "Match not found" }, 404);
    const match = matches[0];

    await pgPatch(`matches?id=eq.${encodeURIComponent(matchId)}`, {
      result,
      updated_at: new Date().toISOString(),
    });

    const preds = await pgGet(
      `predictions?match_id=eq.${encodeURIComponent(matchId)}&select=*&order=created_at.desc&limit=1`
    );

    let learning: any = { applied: false };

    if (preds.length) {
      const prediction = preds[0];
      const family: string = prediction.family || "INSTABILE";
      const manif: string | null = match.manifestazione || null;
      const playable: { market: string }[] = prediction.playable_markets || [];
      const marketsToUpdate = playable.map((m) => m.market).filter(Boolean);
      if (prediction.main_prediction && !marketsToUpdate.includes(prediction.main_prediction)) {
        marketsToUpdate.unshift(prediction.main_prediction);
      }

      // Contatore partite per famiglia (globale + per campionato)
      await pgRpc("increment_family_counter", { p_family: family, p_league: null });
      if (manif) {
        await pgRpc("increment_family_counter", { p_family: family, p_league: manif });
      }

      // Mercati effettivamente pronosticati: aggiorna wins/losses
      for (const market of marketsToUpdate) {
        const outcome = evaluateMarket(market, home, away);
        if (outcome === null) continue;
        await pgRpc("increment_market_score", {
          p_family: family, p_market: market, p_league: null, p_win: outcome,
        });
        if (manif) {
          await pgRpc("increment_market_score", {
            p_family: family, p_market: market, p_league: manif, p_win: outcome,
          });
        }
      }

      // Mercati standard NON pronosticati ma che avrebbero vinto -> "occasione persa"
      for (const market of STANDARD_MARKETS) {
        if (marketsToUpdate.includes(market)) continue;
        const outcome = evaluateMarket(market, home, away);
        if (outcome !== true) continue;
        await pgRpc("increment_missed_win", { p_family: family, p_market: market, p_league: null });
        if (manif) {
          await pgRpc("increment_missed_win", { p_family: family, p_market: market, p_league: manif });
        }
      }

      const mainPred = prediction.main_prediction;
      learning = mainPred
        ? { applied: true, main_prediction: mainPred, result_ok: evaluateMarket(mainPred, home, away) }
        : { applied: false };
    }

    return jsonResponse({ ok: true, learning });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
