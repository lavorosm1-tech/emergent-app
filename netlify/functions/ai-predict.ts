import { pgGet, pgPost, pgPatch, jsonResponse, rowToOdds } from "./lib/supabaseRest";
import { structuralAnalysis } from "./lib/clusterEngine";
import { buildMatchPrompt, PREDICTION_SYSTEM, parseAiJson } from "./lib/predictionPrompt";
import { LLM_OPTIONS, DEFAULT_LLM, callLlm, type LlmOption } from "./lib/llmProviders";

/**
 * POST /ai-predict?matchId=<uuid>&force=true
 * Porting di POST /matches/{id}/predict (server.py) — genera il pronostico AI,
 * iniettando il PIN strutturale calcolato dal motore Poisson (clusterEngine.ts)
 * e lo storico dei mercati (market_scores) come feedback, poi salva su Supabase.
 */
export default async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (e: any) {
    return jsonResponse({ error: `Errore interno: ${e?.message || String(e)}` }, 500);
  }
};

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  const force = url.searchParams.get("force") === "true";
  if (!matchId) return jsonResponse({ error: "Parametro 'matchId' mancante" }, 400);

  const matches = await pgGet(`matches?id=eq.${encodeURIComponent(matchId)}&select=*`);
  if (!matches.length) return jsonResponse({ error: "Match not found" }, 404);
  const match = matches[0];

  if (!force) {
    const existing = await pgGet(
      `predictions?match_id=eq.${encodeURIComponent(matchId)}&select=*&order=created_at.desc&limit=1`
    );
    if (existing.length) return jsonResponse(existing[0]);
  }

  const llmOption = await getSelectedLlm();

  const feedback = await getAllFamiliesStats(match.manifestazione);
  let prompt = buildMatchPrompt({
    manifestazione: match.manifestazione,
    time: match.time,
    squadra1: match.squadra1,
    squadra2: match.squadra2,
    odds: rowToOdds(match),
  });
  if (feedback) {
    prompt =
      feedback +
      "\n\nUSA QUESTO STORICO per aggiustare il ranking: dai priorità a mercati che hanno vinto più volte nella stessa famiglia, e considera anche i mercati con tanti 'persi opportunità' (avrebbero vinto ma non li avevi previsti).\n\n" +
      prompt;
  }

  // PIN strutturale: iniettiamo pavimento/tetto/famiglia calcolati dal motore Poisson,
  // cosi' l'AI li usa come input fisso invece di ricalcolarli (vedi note in cluster_engine.py originale).
  try {
    const sa = structuralAnalysis(rowToOdds(match));
    const s = sa.structure;
    const ceilingStr = s.goal_ceiling_open ? "APERTO (no max)" : String(s.goal_ceiling);
    const rangeStr = s.goal_range || `${s.goal_floor}-${ceilingStr}`;
    const pin = `\n\n============================================================
🔒 PIN STRUTTURALE (calcolato dal Motore Poisson — usa QUESTI valori, NON ricalcolarli):
============================================================
- PAVIMENTO: ${s.goal_floor} gol minimi attesi
- TETTO: ${ceilingStr} gol massimi attesi
- RANGE: ${rangeStr}
- FAMIGLIA STRUTTURALE: ${s.family}
- λ Poisson Casa: ${s.lambda_home.toFixed(2)}
- λ Poisson Ospite: ${s.lambda_away.toFixed(2)}

REGOLE OBBLIGATORIE basate sul PIN:
1. Il "PAVIMENTO" e "TETTO" sopra sono CALCOLATI MATEMATICAMENTE con
   "borderline buffer" (zona incerta → step verso sicurezza). USALI ESATTAMENTE.
2. NON proporre mercati incoerenti col PIN:
   - Se PAVIMENTO=0 → NON proporre MG che inizia da 2+ (es. "MG 2-4 totali" VIETATO)
   - Se TETTO=APERTO → NON proporre U2.5 / U3.5 / "MG 2-4" (range chiuso VIETATO)
   - Se TETTO=4 e PAVIMENTO=2 → NON proporre "MG 1-3" (lo=1≠2 VIETATO)
   - MG range valido: lo ≤ pavimento+1 AND (aperto: hi≥6 ; chiuso: hi≥tetto)
3. Nel campo "analysis" devi SCRIVERE LETTERALMENTE: "PAVIMENTO: ${s.goal_floor} gol | TETTO: ${ceilingStr} gol | RANGE: ${rangeStr}"
4. Nei "playable_markets" PROPONI SOLO mercati coerenti con questo PIN.
============================================================\n`;
    prompt = prompt + pin;
  } catch {
    // se il PIN fallisce, procediamo comunque senza (come nell'originale)
  }

  let prediction;
  try {
    const text = await callLlm(llmOption, PREDICTION_SYSTEM, prompt);
    prediction = parseAiJson(text);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }

  // Traccia il costo stimato (0 per i provider gratuiti come Groq)
  try {
    await incrementSetting("ai_spent", llmOption.cost_per_pred);
    await incrementSetting("ai_count", 1);
  } catch {
    /* non bloccante */
  }

  const saved = await pgPost(
    "predictions",
    {
      match_id: matchId,
      family: prediction.family,
      analysis: prediction.analysis,
      playable_markets: prediction.playable_markets,
      main_prediction: prediction.main_prediction,
      confidence: prediction.confidence,
      min_goals: prediction.min_goals ?? null,
      max_goals: prediction.max_goals ?? null,
    },
    "return=representation"
  );

  await pgPatch(`matches?id=eq.${encodeURIComponent(matchId)}`, {
    family: prediction.family,
    main_prediction: prediction.main_prediction,
    updated_at: new Date().toISOString(),
  });

  return jsonResponse(Array.isArray(saved) ? saved[0] : saved);
}

async function getSelectedLlm(): Promise<LlmOption> {
  try {
    const rows = await pgGet(`settings?key=eq.llm_model&select=value`);
    const id = rows.length ? rows[0].value : DEFAULT_LLM;
    return LLM_OPTIONS.find((o) => o.id === id) || LLM_OPTIONS[0];
  } catch {
    return LLM_OPTIONS[0];
  }
}

async function incrementSetting(key: string, delta: number) {
  const rows = await pgGet(`settings?key=eq.${key}&select=*`);
  const current = rows.length ? Number(rows[0].value) || 0 : 0;
  await pgPost(
    "settings",
    { key, value: current + delta },
    "resolution=merge-duplicates,return=minimal"
  );
}

/** Porting di get_all_families_stats — costruisce il testo di feedback dallo storico market_scores. */
async function getAllFamiliesStats(league?: string): Promise<string> {
  const globalDocs = await pgGet(`market_scores?league=is.null&select=*&order=total.desc&limit=200`);
  if (!globalDocs.length && !league) return "";

  function renderBlock(items: any[], title: string): string {
    const lines = [title];
    for (const d of items.slice(0, 8)) {
      const total = d.total || 0;
      const wins = d.wins || 0;
      const missed = d.missed_wins || 0;
      if (total === 0 && missed === 0) continue;
      const rate = total > 0 ? (wins / total) * 100 : 0;
      const extra = missed ? ` | persi ${missed}` : "";
      lines.push(`  - ${d.market}: ${wins}W/${total} (${rate.toFixed(0)}%)${extra}`);
    }
    return lines.length > 1 ? lines.join("\n") : "";
  }

  const blocks: string[] = [];
  const byFamily: Record<string, any[]> = {};
  for (const d of globalDocs) (byFamily[d.family] ||= []).push(d);
  for (const [fam, items] of Object.entries(byFamily)) {
    const b = renderBlock(items, `STORICO GLOBALE ${fam}:`);
    if (b) blocks.push(b);
  }

  if (league) {
    const leagueDocs = await pgGet(
      `market_scores?league=eq.${encodeURIComponent(league)}&select=*&order=total.desc&limit=200`
    );
    if (leagueDocs.length) {
      const byLf: Record<string, any[]> = {};
      for (const d of leagueDocs) (byLf[d.family] ||= []).push(d);
      for (const [fam, items] of Object.entries(byLf)) {
        const b = renderBlock(items, `STORICO ${league} ${fam}:`);
        if (b) blocks.push(b);
      }
    }
  }

  return blocks.join("\n\n");
}
