import { pgGet, pgRpc, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /matches-days — elenco dei giorni con almeno una partita, ordinati.
 *
 * BUG CORRETTO (25/07/2026). Prima questa funzione scaricava TUTTE le righe di
 * `matches` (`select=day`) e ne ricavava i giorni distinti in JavaScript.
 * PostgREST però tronca la risposta a 1000 righe: con 1.739 partite ordinate
 * per giorno crescente, la millesima cadeva sul 2026-07-25 e i 29 giorni
 * successivi non arrivavano mai al frontend. Il calendario restava bloccato
 * lì, e caricare un Excel nuovo non lo sbloccava — le partite entravano nel
 * database ma il loro giorno non compariva fra quelli selezionabili.
 *
 * Strada principale: i giorni distinti li calcola il database (61 righe invece
 * di 1.739), quindi il tetto non è più raggiungibile.
 *
 * Rete di sicurezza: se la funzione SQL non è raggiungibile (per esempio
 * perché PostgREST non ha ancora ricaricato lo schema dopo la migration), si
 * ricade su due letture con `limit` ESPLICITO, una dal giorno più vecchio e
 * una dal più recente, e si uniscono. Così i giorni in coda — quelli che
 * servono davvero, le partite future — ci sono comunque. Il calendario non
 * deve mai dipendere da una singola strada.
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgRpc("matches_distinct_days", {});
    const days = normalize(rows);
    if (days.length) return jsonResponse(days);
  } catch {
    // Si passa alla rete di sicurezza qui sotto.
  }

  try {
    const [asc, desc] = await Promise.all([
      pgGet(`matches?select=day&order=day.asc&limit=1000`),
      pgGet(`matches?select=day&order=day.desc&limit=1000`),
    ]);
    return jsonResponse(normalize([...(asc || []), ...(desc || [])]));
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};

function normalize(rows: any): string[] {
  const list = Array.isArray(rows) ? rows : [];
  const days = list
    .map((r: any) => (typeof r === "string" ? r : r?.day))
    .filter((d: any): d is string => typeof d === "string" && d.length > 0);
  return Array.from(new Set(days)).sort();
}
