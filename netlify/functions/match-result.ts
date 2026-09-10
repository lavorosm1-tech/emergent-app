import { jsonResponse } from "./lib/supabaseRest";
import { parseResult } from "./lib/marketEval";
import { applyMatchResult } from "./lib/applyResult";

/**
 * POST /match-result
 * Body: { "matchId": "<uuid>", "result": "2-1" }
 *
 * Salva il risultato di una partita e fa imparare il sistema.
 *
 * 10/09/2026 — QUESTA FUNZIONE ORA DELEGA A applyMatchResult().
 * Prima aveva una copia PROPRIA della logica di apprendimento, rimasta ferma
 * a luglio: quando applyResult.ts e' stato scritto (con la protezione contro
 * il doppio conteggio e l'apprendimento per scenario) e' stato collegato solo
 * a results-apply / results-bulk / results-fetch, mentre questo endpoint —
 * quello del pulsante "Salva" nella schermata risultato, il piu' usato — e'
 * rimasto sulla vecchia strada. Due conseguenze concrete:
 *
 *  1) salvando da qui, `scenario_market_scores` e `system_scorecard` non
 *     venivano MAI aggiornate: l'apprendimento incrementale era spento
 *     proprio sulla via principale;
 *  2) non c'era il controllo sul risultato precedente, quindi risalvare la
 *     stessa partita contava tutto una seconda volta e correggere un
 *     risultato sbagliato lasciava i conteggi vecchi al loro posto. E' lo
 *     stesso bug trovato il 26/07 su Mariehamn-Ac Oulu, che credevamo chiuso.
 *
 * In piu' la vecchia versione aggiornava i contatori un mercato alla volta:
 * fino a ~110 richieste in sequenza a Supabase prima di rispondere. Era li'
 * che se ne andavano i secondi di attesa dopo ogni "Salva". applyMatchResult
 * fa lo stesso lavoro con una sola RPC (`apply_family_result`).
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
    const learning = await applyMatchResult(matchId, result, home, away);
    return jsonResponse({ ok: true, learning });
  } catch (e: any) {
    const msg = e?.message || "Errore";
    return jsonResponse({ error: msg }, msg === "Match not found" ? 404 : 502);
  }
};
