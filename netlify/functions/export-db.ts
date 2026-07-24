import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /export-db
 * Porting di GET /export (server.py) — export completo matches + predictions.
 */
export default async (): Promise<Response> => {
  try {
    const matches = await pgGet(`matches?select=*&limit=100000`);
    const predictions = await pgGet(`predictions?select=*&limit=100000`);
    return jsonResponse({
      version: 1,
      exported_at: new Date().toISOString(),
      matches,
      predictions,
    });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
