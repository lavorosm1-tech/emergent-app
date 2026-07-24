import { nameSimilarity } from "./nameSimilarity";

export type FotmobResult =
  | { found: true; home_score: number; away_score: number; confidence: number; matched_home: string; matched_away: string; matched_date: string; source: "fotmob" }
  | { found: false; reason: string };

/**
 * Porting di _fetch_fotmob_match() da server.py — cerca la partita su Fotmob
 * (endpoint "suggest") e restituisce il risultato con un punteggio di
 * confidenza basato sulla similarità dei nomi squadra.
 *
 * NOTA: nel Python originale il fallback "Sofascore/TheSportsDB" era codice
 * morto (mai raggiungibile, funzione mai definita) — qui si usa solo Fotmob,
 * che era l'unico metodo realmente funzionante.
 */
export async function fetchFotmobMatch(home: string, away: string, day: string): Promise<FotmobResult> {
  let data: any;
  try {
    const url = `https://www.fotmob.com/api/searchapi/suggest?term=${encodeURIComponent(home).replace(/%20/g, "+")}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { found: false, reason: `fotmob ${res.status}` };
    data = await res.json();
  } catch (e: any) {
    return { found: false, reason: `fotmob err: ${e.message}` };
  }

  const candidates: any[] = [];
  if (data && typeof data === "object") {
    const groups = data.suggests || data.suggestions || [data];
    for (const group of groups) {
      const options = group?.options;
      if (!options) continue;
      for (const opt of options) {
        const payload = opt?.payload || opt;
        if (payload && typeof payload === "object") candidates.push(payload);
      }
    }
  }
  if (!candidates.length) return { found: false, reason: "no fotmob candidates" };

  let best: FotmobResult | null = null;
  let bestConf = 0;
  for (const c of candidates) {
    const h = c.home_team || c.homeTeam || c.h?.name || "";
    const a = c.away_team || c.awayTeam || c.a?.name || "";
    if (!h || !a) continue;
    const sh = nameSimilarity(home, h);
    const sa = nameSimilarity(away, a);
    const avg = (sh + sa) / 2;
    if (avg < 0.55) continue;

    const hsRaw = c.home_score ?? (typeof c.h === "object" ? c.h?.score : undefined);
    const asRaw = c.away_score ?? (typeof c.a === "object" ? c.a?.score : undefined);
    if (hsRaw === undefined || hsRaw === null || asRaw === undefined || asRaw === null) continue;
    const hs = parseInt(String(hsRaw), 10);
    const as_ = parseInt(String(asRaw), 10);
    if (Number.isNaN(hs) || Number.isNaN(as_)) continue;

    const conf = Math.round(avg * 1000) / 10;
    if (conf > bestConf) {
      best = {
        found: true,
        home_score: hs,
        away_score: as_,
        confidence: conf,
        matched_home: h,
        matched_away: a,
        matched_date: day,
        source: "fotmob",
      };
      bestConf = conf;
    }
  }

  return best || { found: false, reason: "no fotmob match" };
}
