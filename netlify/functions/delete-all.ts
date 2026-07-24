import { pgDelete, jsonResponse } from "./lib/supabaseRest";

/**
 * DELETE /delete-all
 * Porting di DELETE /matches/all (server.py) — cancella TUTTE le partite e
 * i pronostici. Azione distruttiva, invocata solo da un tasto esplicito lato UI.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "DELETE") return jsonResponse({ error: "Usa DELETE" }, 405);
  try {
    await pgDelete(`matches?id=not.is.null`);
    await pgDelete(`predictions?id=not.is.null`);
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
