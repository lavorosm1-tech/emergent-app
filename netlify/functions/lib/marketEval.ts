/**
 * Porting 1:1 di evaluate_market() e parse_result() da backend/server.py.
 * Usato per valutare vinto/perso di un mercato dato il risultato reale
 * (diverso da evaluateMarketStrict in clusterEngine.ts, che valuta sul
 * cluster ipotetico — qui si valuta il risultato VERO della partita).
 */

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

  if (m.includes("MG") && m.includes("2-4")) {
    if (m.includes("CASA")) return home >= 2 && home <= 4;
    if (m.includes("OSPITE")) return away >= 2 && away <= 4;
    return total >= 2 && total <= 4;
  }

  return null;
}

export function parseResult(resultStr: string | null | undefined): [number, number] | null {
  if (!resultStr) return null;
  const m = resultStr.match(/\s*(\d+)\s*[-:.]\s*(\d+)\s*/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

export const STANDARD_MARKETS: string[] = [
  "1", "X", "2", "1X", "X2", "12",
  "O1.5", "U1.5", "O2.5", "U2.5", "O3.5", "U3.5",
  "GG", "NG", "MG 2-4 totali", "MG 2-4 casa", "MG 2-4 ospite",
  "DC 1X + U3.5", "DC X2 + U3.5", "DC 1X + O1.5", "DC X2 + O1.5",
];
