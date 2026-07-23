import { pgPatch, jsonResponse } from "./lib/supabaseRest";

/**
 * POST /selection-update
 * Body: { "ids": ["uuid1","uuid2",...], "selected": true|false }
 * Porting di POST /matches/selection (server.py) — aggiorna il flag "selected"
 * su una o piu' partite in un colpo solo (usato dalla Schedina).
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const selected: boolean = !!body?.selected;
    if (!ids.length) return jsonResponse({ error: "'ids' mancante o vuoto" }, 400);

    const idList = ids.map((id) => `"${id}"`).join(",");
    await pgPatch(`matches?id=in.(${idList})`, { selected });

    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};
