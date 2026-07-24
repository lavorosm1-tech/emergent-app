import { pgGet, jsonResponse } from "./lib/supabaseRest";
import { fetchFotmobMatch } from "./lib/fotmobFetch";
import { applyMatchResult } from "./lib/applyResult";

/**
 * POST /results-fetch
 * Body: { ids: string[], apply?: boolean, apply_threshold?: number }
 * Porting di POST /results/fetch (server.py) — recupero automatico risultati
 * via Fotmob per le partite indicate (tipicamente la Schedina).
 *
 * NOTA: il Python originale tentava anche un fallback "Sofascore", ma era
 * codice morto (la funzione richiamata non era mai definita, quindi ogni
 * chiamata falliva silenziosamente e ripiegava comunque su Fotmob). Qui si
 * usa solo Fotmob, l'unico metodo che funzionava davvero.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let body: { ids?: string[]; apply?: boolean; apply_threshold?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const ids = body.ids || [];
  const apply = body.apply !== false;
  const threshold = body.apply_threshold ?? 80.0;

  if (!ids.length) return jsonResponse({ results: [], applied: 0, skipped: 0, not_found: 0 });

  try {
    const idsList = ids.map((i) => `"${i}"`).join(",");
    const matches = await pgGet(`matches?id=in.(${idsList})&select=*`);

    const CONCURRENCY = 4;
    const out: any[] = [];
    let cursor = 0;

    async function worker() {
      while (cursor < matches.length) {
        const m = matches[cursor++];
        if (m.result) {
          out.push({ id: m.id, status: "already_set", score: m.result });
          continue;
        }
        try {
          const info = await fetchFotmobMatch(m.squadra1 || "", m.squadra2 || "", m.day || "");
          if (!info.found) {
            out.push({ id: m.id, status: "not_found", reason: (info as any).reason || "" });
            continue;
          }
          const scoreStr = `${info.home_score}-${info.away_score}`;
          const matched = `${info.matched_home} vs ${info.matched_away}`;
          if (apply && info.confidence >= threshold) {
            await applyMatchResult(m.id, scoreStr, info.home_score, info.away_score);
            out.push({ id: m.id, status: "applied", score: scoreStr, confidence: info.confidence, matched });
          } else {
            out.push({ id: m.id, status: "review", score: scoreStr, confidence: info.confidence, matched });
          }
        } catch (e: any) {
          out.push({ id: m.id, status: "error", reason: e.message });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, matches.length) }, () => worker()));

    let applied = 0, notFound = 0, skipped = 0;
    for (const r of out) {
      if (r.status === "applied") applied++;
      else if (r.status === "not_found") notFound++;
      else if (r.status === "review" || r.status === "already_set") skipped++;
    }

    return jsonResponse({ results: out, applied, not_found: notFound, skipped });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
