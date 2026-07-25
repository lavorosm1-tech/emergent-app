import { structuralAnalysis, type Odds, type MlScoreEntry } from "./lib/clusterEngine";
import { pgGet, pgPatch } from "./lib/supabaseRest";
import { preHeuristicPick } from "./lib/preHeuristic";
import { classifyScenario } from "./lib/scenario";
import { readMinOdd } from "./odd-settings";

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
 * Non scrive nulla su `predictions`. Da FASE 0 registra però sulla riga della
 * partita il pick del motore strutturale e quello dell'euristica PRE, per
 * poterne misurare le prestazioni a risultato inserito. La registrazione è
 * "best effort": se fallisce, la risposta al frontend resta identica e il
 * pronostico non cambia in alcun modo.
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

  // FASE 3 — lo storico che alimenta il motore non e' piu' quello per FAMIGLIA
  // ma quello per SCENARIO (forza della favorita x gol attesi). Motivo: le
  // famiglie sono 8 e mescolano partite molto diverse; gli scenari separano i
  // casi in cui un mercato regge da quelli in cui non regge.
  const scenario = classifyScenario(odds);
  const mlScores = await buildScenarioScores(scenario);

  // FASE 2 — la soglia di quota minima è una scelta dell'utente, non più un
  // 1.4 fisso. Il parametro in query ha la precedenza (utile per confronti
  // rapidi); altrimenti si usa quella salvata nelle impostazioni.
  const paramMinOdd = Number(url.searchParams.get("minOdd"));
  const minOdd = isFinite(paramMinOdd) && paramMinOdd > 1 ? paramMinOdd : await readMinOdd();

  const result = structuralAnalysis(odds, minOdd, mlScores);

  // FASE 0 — pagella dei tre sistemi. Registriamo cosa avrebbe scelto ciascuno
  // PRIMA di sapere il risultato, così a risultato inserito si può dire chi
  // aveva ragione. Non incide sul pronostico restituito qui sotto.
  await recordPicks(row, odds, result.pick?.market ?? null);

  return json({
    min_odd: minOdd,
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
 * Scrive sulla riga della partita il pick strutturale, quello dell'euristica
 * PRE e lo scenario. Non tocca `main_prediction` (che resta il pick dell'IA)
 * né alcun altro campo esistente. Se la partita ha già un risultato non
 * riscrive nulla: registrare un pick dopo il fatto falserebbe la pagella.
 */
async function recordPicks(row: any, odds: Odds, structuralPick: string | null): Promise<void> {
  if (row.result) return;

  const prePick = preHeuristicPick(odds);
  const patch: Record<string, unknown> = {};
  if (structuralPick && row.pick_strutturale !== structuralPick) patch.pick_strutturale = structuralPick;
  if (prePick?.market && row.pick_pre !== prePick.market) patch.pick_pre = prePick.market;

  const scenario = classifyScenario(odds);
  if (scenario !== "sconosciuto" && row.scenario !== scenario) patch.scenario = scenario;

  if (!Object.keys(patch).length) return;

  try {
    await pgPatch(`matches?id=eq.${encodeURIComponent(row.id)}`, patch);
  } catch {
    // Best effort: la misurazione non deve mai far fallire un pronostico.
  }
}

/**
 * Statistiche storiche reali per lo scenario di questa partita: per ogni
 * mercato, quante volte ha vinto in partite con lo stesso profilo di quote.
 * Il motore le mescola con la propria probabilita' pesandole sul numero di
 * partite viste (vedi il correttivo in clusterEngine.ts).
 *
 * Se lo storico non e' raggiungibile il motore lavora senza, esattamente come
 * prima della Fase 3.
 */
async function buildScenarioScores(scenario: string): Promise<Record<string, MlScoreEntry>> {
  const map: Record<string, MlScoreEntry> = {};
  if (!scenario || scenario === "sconosciuto") return map;
  try {
    const rows = await pgGet(
      `scenario_market_scores?scenario=eq.${encodeURIComponent(scenario)}&select=market,wins,losses,total`,
    );
    for (const r of rows) {
      if (!r.total) continue;
      map[r.market] = {
        win_rate: Math.round((r.wins / r.total) * 1000) / 10,
        total: r.total,
        wins: r.wins,
        losses: r.losses,
      };
    }
  } catch {
    // Nessuno storico disponibile: il motore funziona comunque.
  }
  return map;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
