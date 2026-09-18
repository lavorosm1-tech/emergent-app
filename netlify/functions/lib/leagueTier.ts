/**
 * Livelli di campionato per la multipla automatica (build-multipla.ts).
 *
 * Decisi da Rossi il 18/09/2026:
 *  - LIVELLO 1: le sette leghe principali (ING1, ITA1, SPA1, GER1, FRA1,
 *    OLA1, POR1). NON e' la lista del tasto PRINCIPALI dell'app
 *    (frontend/src/utils/leagues.ts, che ha anche NOR1/USA1/SVE1/DAN1): per
 *    la multipla vale la lista stretta.
 *  - LIVELLO 2: le altre prime divisioni (Belgio, Turchia, Norvegia, USA...),
 *    le seconde divisioni dei paesi di livello 1 (Serie B, Championship,
 *    2. Bundesliga, Liga 2, Ligue 2...) e le coppe europee per club.
 *  - LIVELLO 3: tutto il resto (altre seconde divisioni, coppe nazionali,
 *    riserve, femminili, giovanili, amichevoli).
 *
 * Il codice del campionato e' `manifestazione` della tabella `matches`
 * (es. "ITA1", "ING2", "EUCHL", "BRA1RS"). Le funzioni del frontend non sono
 * importabili dalle function: la logica e' ricopiata qui, tenuta minima.
 */

export const TIER1_CODES = ["ING1", "ITA1", "SPA1", "GER1", "FRA1", "OLA1", "POR1"];

/** Paesi di livello 1: la loro seconda divisione vale come livello 2. */
const TIER1_COUNTRIES = TIER1_CODES.map((c) => c.slice(0, -1));

export type LeagueTier = 1 | 2 | 3;

export function leagueTier(manifestazione: string | null | undefined): LeagueTier {
  const c = (manifestazione || "").toUpperCase().trim();
  if (!c) return 3;
  if (TIER1_CODES.includes(c)) return 1;
  // Coppe europee per club (EUCHL, EUEL, EUCONFL, ...)
  if (/^EU/.test(c)) return 2;
  // Prima divisione "pulita": 2-4 lettere di paese + "1", niente suffissi
  // (ITA1F femminile, BRA1RS riserve e simili restano fuori).
  if (/^[A-Z]{2,4}1$/.test(c)) return 2;
  // Seconda divisione dei paesi di livello 1 (ITA2, ING2, GER2, ...).
  if (/^[A-Z]{2,4}2$/.test(c) && TIER1_COUNTRIES.includes(c.slice(0, -1))) return 2;
  return 3;
}

export function tierLabel(t: LeagueTier): string {
  return t === 1 ? "principale" : t === 2 ? "secondario" : "minore";
}
