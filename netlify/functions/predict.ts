import { structuralAnalysis, classifyFamily, type Odds, type MlScoreEntry } from "./lib/clusterEngine";
import { pgGet } from "./lib/supabaseRest";

/**
 * GET /predict?matchId=<uuid>
 *
 * Legge la partita da Supabase (tabella `matches`) e calcola il pronostico
 * strutturale con il motore Poisson portato in TypeScript. Recupera anche
 * lo storico reale (market_scores) per la famiglia della partita e lo passa
 * al motore, che lo usa per correggere lo score dei mercati con
 * performance storica estrema (win-rate ≥70% o ≤30%, meccanismo
 * "ml_adjustment" già presente nel motore ma prima mai alimentato).
 *
 * Non scrive nulla su `predictions` — è solo lettura.
 */
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");

  if (!matchId) {
    return json({ error: "Parametro 'matchId' mancante. Uso: /predict?matchId=<uuid>" }, 400);
  }

  let row: any;
  try {
    const rows = await pgGet(`matches?id=eq.${encodeURIComponent(matchId)}&select=*`);
    if (!rows.length) {
      return json({ error: `Nessuna partita trovata con id=${matchId}` }, 404);
    }
    row = rows[0];
  } catch (e: any) {
    return json({ error: `Errore Supabase: ${e.message}` }, 502);
  }

  const odds: Odds = {
    odd_1: row.odd_1,
    odd_X: row.odd_x,
    odd_2: row.odd_2,
    odd_1X: row.odd_1x,
    odd_X2: row.odd_x2,
    odd_12: row.odd_12,
    odd_O15: row.odd_o15,
    odd_U15: row.odd_u15,
    odd_O25: row.odd_o25,
    odd_U25: row.odd_u25,
    odd_O35: row.odd_o35,
    odd_U35: row.odd_u35,
    odd_GG: row.odd_gg,
    odd_NG: row.odd_ng,
  };

  const family = classifyFamily(odds).family;
  const mlScores = await buildMlScores(family, row.manifestazione || null);

  const result = structuralAnalysis(odds, 1.4, mlScores);

  return json({
    structure: result.structure,
    cluster: result.cluster,
    central_cluster: result.central_cluster,
    pick: result.pick,
    ranking: result.ranking,
    explanation: result.explanation,
    match: {
      id: row.id,
      day: row.day,
      time: row.time,
      manifestazione: row.manifestazione,
      squadra1: row.squadra1,
      squadra2: row.squadra2,
      result: row.result,
    },
    source: "netlify-function + supabase (nessuna dipendenza da Emergent)",
  });
};

/**
 * Costruisce la mappa mercato -> statistiche storiche per la famiglia della
 * partita, da passare al motore. Base globale per famiglia (sempre ben
 * popolata), rifinita col dato per-campionato solo se ha almeno 30
 * partite (stessa soglia usata nel correttivo lato fusione, per coerenza —
 * sotto soglia il dato per-campionato è troppo rumoroso).
 */
async function buildMlScores(family: string, league: string | null): Promise<Record<string, MlScoreEntry>> {
  const map: Record<string, MlScoreEntry> = {};
  try {
    const globalRows = await pgGet(
      `market_scores?family=eq.${encodeURIComponent(family)}&league=is.null&select=market,wins,total,losses`,
    );
    for (const r of globalRows) {
      if (!r.total) continue;
      map[r.market] = { win_rate: Math.round((r.wins / r.total) * 1000) / 10, total: r.total, wins: r.wins, losses: r.losses };
    }
    if (league) {
      const leagueRows = await pgGet(
        `market_scores?family=eq.${encodeURIComponent(family)}&league=eq.${encodeURIComponent(league)}&select=market,wins,total,losses`,
      );
      for (const r of leagueRows) {
        if (!r.total || r.total < 30) continue;
        map[r.market] = { win_rate: Math.round((r.wins / r.total) * 1000) / 10, total: r.total, wins: r.wins, losses: r.losses };
      }
    }
  } catch {
    // Se lo storico non è disponibile, il motore funziona comunque senza
    // ml_adjustment (comportamento identico a prima di questo fix).
  }
  return map;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
