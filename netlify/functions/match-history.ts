import { pgGet, pgRpc, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /match-history?id=<uuid>
 * Porting di GET /match/{match_id}/history (server.py) — statistiche
 * globali + per-campionato usate come contesto nel prompt AI.
 *
 * Include anche (punto 3 roadmap 25/07/2026, versione leggera del
 * Distribution Engine): media gol fatti/subiti per le due squadre, dalla
 * combinazione di match_results_training (storico ScoreBlast) + matches
 * (risultati salvati in-app, quindi cresce nel tempo). Solo se la squadra
 * ha almeno 5 partite con risultato — sotto soglia il dato è troppo
 * rumoroso per essere utile (oggi solo ~27% delle squadre lo supera).
 */
const MIN_TEAM_SAMPLE = 5;

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

async function teamForm(team: string, role: "home" | "away") {
  try {
    const rows = await pgRpc("team_goal_stats", { p_team: team, p_role: role });
    const r = rows?.[0];
    if (!r || r.matches_count < MIN_TEAM_SAMPLE) return null;
    return { matches: r.matches_count, avg_scored: r.avg_scored, avg_conceded: r.avg_conceded };
  } catch {
    return null;
  }
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "Parametro 'id' mancante" }, 400);

  try {
    const matches = await pgGet(`matches?id=eq.${encodeURIComponent(id)}&select=manifestazione,squadra1,squadra2`);
    if (!matches.length) return jsonResponse({ error: "match not found" }, 404);
    const { manifestazione: league, squadra1, squadra2 } = matches[0];

    const globalDocs = await pgGet(`market_scores?league=is.null&select=*&order=total.desc&limit=200`);
    const leagueDocs = league
      ? await pgGet(`market_scores?league=eq.${encodeURIComponent(league)}&select=*&order=total.desc&limit=200`)
      : [];

    const [homeForm, awayForm] = await Promise.all([
      teamForm(squadra1, "home"),
      teamForm(squadra2, "away"),
    ]);

    return jsonResponse({
      league,
      global: fmt(globalDocs),
      league_specific: fmt(leagueDocs),
      team_form: { home: homeForm, away: awayForm },
    });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
