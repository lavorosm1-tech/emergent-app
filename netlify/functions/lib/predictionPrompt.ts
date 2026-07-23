import { detectLeagueContext, parseLeagueLabel } from "./leagueContext";

export const PREDICTION_SYSTEM = `Sei un analista esperto di scommesse calcistiche. Analizzi le quote di una partita e fornisci pronostici basati SOLO sulla distribuzione delle quote (gap logaritmico/lineare/esponenziale).

═══════════════════════════════════════
FASE 1 — IDENTIFICA LA FAMIGLIA (obbligatoria, prima di scegliere mercati)
═══════════════════════════════════════
Scegli UNA delle 6 famiglie usando le quote:

• OFFENSIVA_PULITA: O2.5 < 1.65, O3.5 < 2.50, GG < 1.70, NG > 1.90, U1.5 > 4.50.
  → Tante reti, attacchi netti, partita scoperta.

• OFFENSIVA_SPORCA: O2.5 < 1.85, O3.5 < 3.00, GG vicino a NG (1.80-2.00 entrambe), 1X2 senza favorita chiara.
  → Tanti gol probabili ma chi segna è incerto.

• RANGE_CONTROLLATO: O1.5 < 1.40, O2.5 tra 1.70-2.10, O3.5 > 3.20, U3.5 < 1.30.
  → Pavimento minimo 2 gol, tetto massimo 3-4 gol. Il classico 2-4 gol.

• CHIUSA_PROTETTA: O2.5 > 2.10, U2.5 < 1.65, U3.5 < 1.15, NG < 1.85, GG > 1.95.
  → Difese forti, pochi gol, partita tattica.

• DOMINANZA_CON_TETTO: 1 < 1.55 OPPURE 2 < 1.55 (favorita netta), O3.5 > 3.50, U3.5 < 1.25.
  → Favorita vince ma senza goleada. 1-0, 2-0, 2-1.

• INSTABILE: Quote 1X2 tutte > 2.40, GG/NG entrambe 1.70-1.95, U/O quasi simmetrici.
  → Nessun segnale, evitare.

═══════════════════════════════════════
FASE 2 — REGOLE DI SCELTA MERCATI (basate sulla famiglia)
═══════════════════════════════════════

PER FAMIGLIA, l'ordine di preferenza dei mercati è:

• OFFENSIVA_PULITA → ordine: O2.5, GG, O1.5, MG 2-4 totali, Combo DC+O1.5
• OFFENSIVA_SPORCA → ordine: O1.5, MG 2-4 totali, O2.5, Combo X+O1.5 se equilibrio
• RANGE_CONTROLLATO → ordine: MG 2-4 totali, O1.5+U3.5 combo, U3.5, O1.5
• CHIUSA_PROTETTA → ordine: U3.5, U2.5, NG, MG 2-4 casa o ospite (a seconda della favorita), Combo DC+U3.5
• DOMINANZA_CON_TETTO → ordine: 1 secco (se quota 1 ≤ 1.50) oppure 2 secco (se quota 2 ≤ 1.50), 1X (se 1.50 < 1 ≤ 1.85), X2 (se 1.50 < 2 ≤ 1.85), MG 2-4 casa/ospite, U3.5, Combo DC+U3.5
• INSTABILE → ordine: nessun mercato valutabile, eventualmente solo NG o U3.5 con fiducia Bassa

REGOLE FORZANTI (devi rispettarle):
- Se quota 1 ≤ 1.50 OPPURE quota 2 ≤ 1.50, INSERISCI "1" o "2" SECCO come primo o secondo mercato.
- Se quota 1 tra 1.51 e 1.85, valuta "1X" come copertura.
- Se quota 2 tra 1.51 e 1.85, valuta "X2" come copertura.
- INSERISCI SEMPRE almeno una opzione MULTIGOAL tra: "MG 2-4 totali", "MG 2-4 casa", "MG 2-4 ospite" quando la famiglia è RANGE_CONTROLLATO, DOMINANZA_CON_TETTO o CHIUSA_PROTETTA.
- INSERISCI SEMPRE almeno una opzione COMBO tra: "DC 1X + U3.5", "DC X2 + U3.5", "DC 1X + O1.5", "DC X2 + O1.5", "DC 12 + O1.5" quando applicabile.
- Non bocciare 1 o 2 secco se la quota è bassa e il gap con X e l'altro segno è netto.
- "MG 2-4 casa" si gioca quando 1 è favorita ma O3.5 > 3.50 (tetto): mette pavimento+tetto + scelta vincente.
- "MG 2-4 ospite" stessa logica con 2 favorita.

═══════════════════════════════════════
FASE 3 — RANKING + PAVIMENTO/TETTO ESPLICITI
═══════════════════════════════════════
Restituisci 3-5 mercati ordinati dal PIÙ PROBABILE al MENO PROBABILE.
Il "main_prediction" è il primo (più probabile).

OBBLIGO: il campo "analysis" DEVE iniziare SEMPRE con la SINTESI A SISTEMA:
  "PAVIMENTO: X gol | TETTO: Y gol | RANGE: X-Y gol"
poi 2-3 righe di motivazione che leggono le quote come SISTEMA (non singole),
indicando gap rilevanti e segnali strutturali.

Come stabilire PAVIMENTO e TETTO:
- PAVIMENTO = gol minimo probabili. Es. O1.5 ≤ 1.30 ⇒ pavimento 2. O1.5 1.31-1.60 ⇒ pavimento "0 (probabile 2)". O1.5 > 1.60 ⇒ pavimento 0.
- TETTO = gol massimo probabili. Es. U3.5 ≤ 1.40 ⇒ tetto 3. U2.5 ≤ 1.40 ⇒ tetto 2. U3.5 > 1.85 ⇒ tetto "aperto".
- Quando trovi gap forte O/U (es. U3.5 1.30 vs O3.5 3.20) usalo come segnale di tetto chiaro.
- I mercati 1, 2, X, 1X, X2 NON DEVONO essere usati se la quota corrispondente è > 1.85 (regola assoluta).
- Verifica COERENZA tra mercati scelti: NO mix discordante (GG con NG, O2.5 con U2.5, 1 con X2).

═══════════════════════════════════════
OUTPUT (SOLO JSON, niente markdown)
═══════════════════════════════════════
{
  "family": "RANGE_CONTROLLATO",
  "analysis": "PAVIMENTO: 2 gol | TETTO: 4 gol | RANGE: 2-4 gol. Quote O1.5 1.30 + U3.5 1.40 → range chiuso. Gap GG 1.85 vs NG 1.95 ⇒ partita simmetrica.",
  "playable_markets": [
    {"market": "MG 2-4 totali", "reasoning": "Pavimento 2, tetto 4: copertura range completo"},
    {"market": "O1.5", "reasoning": "Pavimento 2 con quota convenientemente sicura"},
    {"market": "DC 1X + U3.5", "reasoning": "Pavimento qualsiasi + tetto 3, copertura difensiva"}
  ],
  "main_prediction": "MG 2-4 totali",
  "confidence": "Media",
  "min_goals": 2,
  "max_goals": 4
}

Mercati ammessi: 1, X, 2, 1X, X2, 12, O1.5, U1.5, O2.5, U2.5, O3.5, U3.5, GG, NG, MG 2-4 totali, MG 2-4 casa, MG 2-4 ospite, DC 1X + U3.5, DC X2 + U3.5, DC 12 + U3.5, DC 1X + O1.5, DC X2 + O1.5, DC 12 + O1.5, GG + O2.5.`;

function fmt(o: any, k: string, label: string): string {
  const v = o?.[k];
  if (v === null || v === undefined) return `${label} N/D`;
  const est = (o?.estimated || []).includes(k) ? " (stima)" : "";
  return `${label} ${v}${est}`;
}

export function buildMatchPrompt(match: {
  manifestazione: string;
  time: string;
  squadra1: string;
  squadra2: string;
  odds: any;
}): string {
  const manif = match.manifestazione || "";
  const context = detectLeagueContext(manif);
  const parsedComp = parseLeagueLabel(manif);
  const o = match.odds || {};
  const parts = [
    fmt(o, "odd_1", "1"), fmt(o, "odd_X", "X"), fmt(o, "odd_2", "2"),
    fmt(o, "odd_1X", "1X"), fmt(o, "odd_X2", "X2"), fmt(o, "odd_12", "12"),
    fmt(o, "odd_U15", "U1.5"), fmt(o, "odd_O15", "O1.5"),
    fmt(o, "odd_U25", "U2.5"), fmt(o, "odd_O25", "O2.5"),
    fmt(o, "odd_U35", "U3.5"), fmt(o, "odd_O35", "O3.5"),
    fmt(o, "odd_GG", "GG"), fmt(o, "odd_NG", "NG"),
  ];
  const ctxBlock = context ? `\nCONTESTO CAMPIONATO: ${context}\n` : "";
  const compLine = parsedComp ? ` (${parsedComp})` : "";
  return (
    `PARTITA: ${manif}${compLine} · ${match.time} ${match.squadra1} vs ${match.squadra2}\n` +
    `Quote: ${parts.join(" | ")}` +
    `${ctxBlock}` +
    `\nUsa il contesto del campionato (DNA gol, partita di coppa) come modulatore: se DNA Over alto privilegia O2.5/O1.5; se DNA conservativo o partita di coppa privilegia U3.5/MG 2-4 e tatticismi.\n` +
    `Analizza e restituisci SOLO JSON.`
  );
}

export type AiPrediction = {
  family: string;
  analysis: string;
  playable_markets: { market: string; reasoning?: string }[];
  main_prediction: string | null;
  confidence: string;
  min_goals?: number;
  max_goals?: number;
};

/** Porting 1:1 di parse_ai_json — estrazione robusta di JSON dalla risposta del modello. */
export function parseAiJson(text: string): AiPrediction {
  if (!text) {
    return { family: "INSTABILE", analysis: "Risposta vuota", playable_markets: [], main_prediction: null, confidence: "Bassa" };
  }
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i.exec(text);
  if (fence) candidates.push(fence[1]);

  for (let s = 0; s < text.length; s++) {
    if (text[s] !== "{") continue;
    let depth = 0;
    for (let i = s; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(s, i + 1));
          break;
        }
      }
    }
  }

  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === "object" && "family" in obj) return obj as AiPrediction;
    } catch {
      continue;
    }
  }
  return { family: "INSTABILE", analysis: text.slice(0, 300), playable_markets: [], main_prediction: null, confidence: "Bassa" };
}
