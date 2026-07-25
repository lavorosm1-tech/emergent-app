import type { Odds } from "./clusterEngine";

export type PreCandidate = { market: string; odd: number; family: string };

/**
 * FASE 0 — porto lato server dell'euristica "pre-pronostico" che oggi vive
 * SOLO nel frontend (frontend/src/api.ts -> quickPredictionFamily) e che
 * partecipa alla fusione con peso 5.
 *
 * Serve per poter registrare, a ogni partita, quale pick avrebbe proposto
 * questo sistema — altrimenti non è misurabile e non sapremo mai se merita
 * il peso che ha.
 *
 * ATTENZIONE: questa funzione deve restare identica a quella del frontend.
 * Se un giorno si toccano le regole, vanno cambiate in entrambi i posti,
 * altrimenti la pagella misura un sistema diverso da quello che vota.
 */
export function preHeuristicPick(odds: Odds): PreCandidate | null {
  const get = (k: keyof Odds, def = Infinity) => (odds[k] ?? def) as number;
  const o1 = get("odd_1"), o2 = get("odd_2");
  const o1X = get("odd_1X"), oX2 = get("odd_X2"), o12 = get("odd_12");
  const oO15 = get("odd_O15"), oO25 = get("odd_O25"), oU25 = get("odd_U25");
  const oO35 = get("odd_O35"), oU35 = get("odd_U35");
  const oGG = get("odd_GG"), oNG = get("odd_NG");

  const out: PreCandidate[] = [];
  const push = (market: string, odd: number, family: string) => {
    if (!isFinite(odd)) return;
    if (odd < 1.40) return;
    if (out.find((c) => c.market === market)) return;
    out.push({ market, odd, family });
  };

  const oneValid = o1 <= 1.85;
  const twoValid = o2 <= 1.85;
  const hasFavorita = oneValid || twoValid;

  if (oneValid) push("1", o1, "DOMINANZA");
  if (twoValid) push("2", o2, "DOMINANZA");
  if (hasFavorita) {
    if (oneValid && o1X <= 1.60) push("1X", o1X, "DOMINANZA_TETTO");
    if (twoValid && oX2 <= 1.60) push("X2", oX2, "DOMINANZA_TETTO");
    if (o12 <= 1.40) push("12", o12, "ANTI_X");
  }

  if (oO15 <= 1.40 && oU35 <= 1.40) {
    push("MG 2-4 totali", Math.max(1.40, (oO15 + oU35) / 2), "RANGE_CONTROLLATO");
  }
  if (oO25 <= 1.85) push("O2.5", oO25, "OFFENSIVA");
  if (oGG <= 1.85) push("GG", oGG, "OFFENSIVA");
  if (oO15 <= 1.50) push("O1.5", oO15, "RANGE_CONTROLLATO");
  if (oO35 <= 1.85) push("O3.5", oO35, "OFFENSIVA_PULITA");

  if (oU25 <= 1.85) push("U2.5", oU25, "CHIUSA_PROTETTA");
  if (oU35 <= 1.40) push("U3.5", oU35, "CHIUSA_PROTETTA");
  if (oNG <= 1.85) push("NG", oNG, "CHIUSA_PROTETTA");

  if (hasFavorita) {
    if (oneValid && oO15 <= 1.50) push("DC 1X + O1.5", Math.max(o1X, oO15), "DOMINANZA_GOL");
    if (twoValid && oO15 <= 1.50) push("DC X2 + O1.5", Math.max(oX2, oO15), "DOMINANZA_GOL");
    if (oneValid && oU35 <= 1.40) push("DC 1X + U3.5", Math.max(o1X, oU35), "DOMINANZA_TETTO");
    if (twoValid && oU35 <= 1.40) push("DC X2 + U3.5", Math.max(oX2, oU35), "DOMINANZA_TETTO");
  }

  out.sort((a, b) => a.odd - b.odd);
  return out[0] || null;
}
