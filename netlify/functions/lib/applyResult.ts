import { pgGet, pgPatch, pgRpc } from "./supabaseRest";
import { evaluateMarket, STANDARD_MARKETS } from "./marketEval";

/**
 * Applica un risultato a una partita e aggiorna market_scores/family_counters
 * (stessa logica di match-result.ts, estratta qui per essere riusata anche
 * da results-apply.ts e results-bulk.ts senza duplicare/rischiare di rompere
 * match-result.ts che è già in produzione).
 */
export async function applyMatchResult(
  matchId: string,
  result: string,
  home: number,
  away: number,
): Promise<{ applied: boolean; main_prediction?: string; result_ok?: boolean | null }> {
  const matches = await pgGet(`matches?id=eq.${encodeURIComponent(matchId)}&select=*`);
  if (!matches.length) throw new Error("Match not found");
  const match = matches[0];

  await pgPatch(`matches?id=eq.${encodeURIComponent(matchId)}`, {
    result,
    updated_at: new Date().toISOString(),
  });

  const preds = await pgGet(
    `predictions?match_id=eq.${encodeURIComponent(matchId)}&select=*&order=created_at.desc&limit=1`,
  );
  if (!preds.length) return { applied: false };

  const prediction = preds[0];
  const family: string = prediction.family || "INSTABILE";
  const manif: string | null = match.manifestazione || null;
  const playable: { market: string }[] = prediction.playable_markets || [];
  const marketsToUpdate = playable.map((m) => m.market).filter(Boolean);
  if (prediction.main_prediction && !marketsToUpdate.includes(prediction.main_prediction)) {
    marketsToUpdate.unshift(prediction.main_prediction);
  }

  await pgRpc("increment_family_counter", { p_family: family, p_league: null });
  if (manif) await pgRpc("increment_family_counter", { p_family: family, p_league: manif });

  for (const market of marketsToUpdate) {
    const outcome = evaluateMarket(market, home, away);
    if (outcome === null) continue;
    await pgRpc("increment_market_score", { p_family: family, p_market: market, p_league: null, p_win: outcome });
    if (manif) {
      await pgRpc("increment_market_score", { p_family: family, p_market: market, p_league: manif, p_win: outcome });
    }
  }

  for (const market of STANDARD_MARKETS) {
    if (marketsToUpdate.includes(market)) continue;
    const outcome = evaluateMarket(market, home, away);
    if (outcome !== true) continue;
    await pgRpc("increment_missed_win", { p_family: family, p_market: market, p_league: null });
    if (manif) await pgRpc("increment_missed_win", { p_family: family, p_market: market, p_league: manif });
  }

  const mainPred = prediction.main_prediction;
  return mainPred
    ? { applied: true, main_prediction: mainPred, result_ok: evaluateMarket(mainPred, home, away) }
    : { applied: false };
}
