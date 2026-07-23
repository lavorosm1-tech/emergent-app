import { pgGet, pgPost, jsonResponse } from "./lib/supabaseRest";
import { LLM_OPTIONS, DEFAULT_LLM, CONFIGURED_PROVIDERS } from "./lib/llmProviders";

/**
 * GET /llm-settings          -> { options, selected_id }
 * POST /llm-settings { id }  -> { ok, selected_id }
 * Porting di GET/POST /settings/llm (server.py). Ogni opzione include ora
 * anche "configured" (se la relativa API key esiste su Netlify) cosi' il
 * frontend puo' mostrare quali modelli sono davvero utilizzabili subito.
 */
export default async (req: Request): Promise<Response> => {
  try {
    if (req.method === "GET") {
      const rows = await pgGet(`settings?key=eq.llm_model&select=value`);
      const selectedId = rows.length ? rows[0].value : DEFAULT_LLM;
      const options = LLM_OPTIONS.map((o) => ({ ...o, configured: CONFIGURED_PROVIDERS.has(o.provider) }));
      return jsonResponse({ options, selected_id: selectedId });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const id = body?.id;
      if (!LLM_OPTIONS.some((o) => o.id === id)) {
        return jsonResponse({ error: "LLM id non valido" }, 400);
      }
      await pgPost(
        "settings",
        { key: "llm_model", value: id },
        "resolution=merge-duplicates,return=minimal"
      );
      return jsonResponse({ ok: true, selected_id: id });
    }

    return jsonResponse({ error: "Metodo non supportato" }, 405);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};
