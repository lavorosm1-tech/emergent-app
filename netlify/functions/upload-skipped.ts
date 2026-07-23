import { pgGet, jsonResponse } from "./lib/supabaseRest";

/**
 * GET /upload-skipped
 * Porting di GET /upload/skipped (server.py).
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgGet(`upload_skipped?id=eq.latest&select=*`);
    if (!rows.length) {
      return jsonResponse({
        filename: null, uploaded_at: null, rows_seen: 0, valid_matches: 0,
        inserted: 0, updated: 0, unchanged: 0, skipped_count: 0, skipped: [],
      });
    }
    return jsonResponse(rows[0]);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
