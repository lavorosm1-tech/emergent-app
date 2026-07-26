import { pgRpc, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /matches-days — elenco dei giorni con almeno una partita, ordinati.
 *
 * BUG CORRETTO (25/07/2026). Prima questa funzione scaricava TUTTE le righe di
 * `matches` (`select=day`) e ne ricavava i giorni distinti in JavaScript.
 * PostgREST però tronca la risposta a 1000 righe: con 1.739 partite ordinate
 * per giorno crescente, la millesima cadeva sul 2026-07-25 e i 29 giorni
 * successivi non arrivavano mai al frontend. Il calendario restava bloccato
 * lì, e caricare un Excel nuovo non cambiava niente — le partite entravano nel
 * database ma il loro giorno non compariva fra quelli selezionabili.
 *
 * Ora i giorni distinti li calcola il database (61 righe invece di 1.739),
 * quindi il tetto non è più raggiungibile nemmeno con anni di partite.
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgRpc("matches_distinct_days", {});
    const days = (rows || [])
      .map((r: any) => (typeof r === "string" ? r : r.day))
      .filter(Boolean);
    return jsonResponse(days);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
