import { pgPatch, jsonResponse } from "./lib/supabaseRest";

/**
 * POST /selection-clear
 * Porting di POST /selection/clear (server.py) — svuota la Schedina.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);
  try {
    await pgPatch(`matches?selected=eq.true`, { selected: false });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};
