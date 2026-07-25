/**
 * Porting 1:1 di evaluate_market() e parse_result() da backend/server.py.
 * Usato per valutare vinto/perso di un mercato dato il risultato reale
 * (diverso da evaluateMarketStrict in clusterEngine.ts, che valuta sul
 * cluster ipotetico — qui si valuta il risultato VERO della partita).
 */
import { CANDIDATE_MARKETS } from "./clusterEngine";

export function evaluateMarket(market: string, home: number, away: number): boolean | null {
  const total = home + away;
  const m = market.trim().toUpperCase().replace(/\s+/g, "");

  if (m.includes("+")) {
    const parts = market.toUpperCase().split("+").map((p) => p.trim());
    const results = parts.map((p) => evaluateMarket(p, home, away));
    if (results.some((r) => r === null)) return null;
    return results.every((r) => r === true);
  }

  if (m === "1") return home > away;
  if (m === "X") return home === away;
  if (m === "2") return away > home;
  if (m === "1X" || m === "DC1X") return home >= away;
  if (m === "X2" || m === "DCX2") return away >= home;
  if (m === "12" || m === "DC12") return home !== away;

  if (m.startsWith("O") || m.startsWith("OVER")) {
    const match = m.match(/[\d.]+/);
    if (!match) return null;
    return total > parseFloat(match[0]);
  }
  if (m.startsWith("U") || m.startsWith("UNDER")) {
    const match = m.match(/[\d.]+/);
    if (!match) return null;
    return total < parseFloat(match[0]);
  }

  if (m === "GG" || m === "BTTS") return home > 0 && away > 0;
  if (m === "NG" || m === "NOBTTS") return home === 0 || away === 0;

  // MG X-Y (qualsiasi range, non solo 2-4): "MG 1-3 CASA", "MG 2-5 TOTALI", ecc.
  if (m.includes("MG")) {
    const range = m.match(/(\d+)-(\d+)/);
    if (!range) return null;
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    if (m.includes("CASA")) return home >= lo && home <= hi;
    if (m.includes("OSPITE")) return away >= lo && away <= hi;
    return total >= lo && total <= hi;
  }

  return null;
}

export function parseResult(resultStr: string | null | undefined): [number, number] | null {
  if (!resultStr) return null;
  const m = resultStr.match(/\s*(\d+)\s*[-:.]\s*(\d+)\s*/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

// Fonte unica di verità: gli stessi 42 mercati che il motore Poisson
// considera candidati (CANDIDATE_MARKETS in clusterEngine.ts). Prima qui
// c'era un sottoinsieme di 21 mercati, quindi lo storico non copriva
// molte combo (es. "1 + O2.5", "DC 12 + GG", i range MG oltre 2-4) — un
// pick 2/combo diverso da questi non aveva mai un riscontro storico.
export const STANDARD_MARKETS: string[] = CANDIDATE_MARKETS;
