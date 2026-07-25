import type { Odds } from "./clusterEngine";

/**
 * FASE 0 — classificazione della partita in uno "scenario", cioè la
 * combinazione fra quanto è forte la favorita e quanti gol si aspetta il
 * bookmaker. Serve a misurare le prestazioni dei tre sistemi (strutturale,
 * euristica PRE, verdetto finale) separatamente per tipo di partita, invece
 * che con un unico numero medio che nasconde tutto.
 *
 * Le soglie sono quelle usate nell'analisi sulle 5.160 partite storiche:
 * cambiarle qui senza rifare quell'analisi renderebbe i conteggi vecchi e
 * quelli nuovi non confrontabili.
 */
export function classifyScenario(odds: Odds): string {
  const num = (k: keyof Odds): number | null => {
    const v = odds[k];
    return typeof v === "number" && isFinite(v) && v > 0 ? v : null;
  };
  const o1 = num("odd_1"), o2 = num("odd_2"), oO25 = num("odd_O25");
  if (!o1 || !o2 || !oO25) return "sconosciuto";

  const fav = Math.min(o1, o2);
  const dominanza =
    fav <= 1.40 ? "favorita netta" :
    fav <= 1.75 ? "favorita chiara" :
    fav <= 2.30 ? "favorita leggera" :
                  "equilibrio";

  const andamento =
    oO25 <= 1.60 ? "molto offensiva" :
    oO25 <= 1.90 ? "offensiva" :
    oO25 <= 2.20 ? "media" :
                   "chiusa";

  return `${dominanza} / ${andamento}`;
}
