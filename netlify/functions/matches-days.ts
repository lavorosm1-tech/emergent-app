import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /matches-days
 * Porting di GET /matches/days (server.py) — elenco giorni distinti, ordinati.
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgGet(`matches?select=day&order=day.asc`);
    const days = Array.from(new Set(rows.map((r: any) => r.day))).sort();
    return jsonResponse(days);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
