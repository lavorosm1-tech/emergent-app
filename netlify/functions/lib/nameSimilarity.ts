/**
 * Porting di _name_similarity() da server.py: similarità 0-1 tra due nomi
 * squadra, case/punteggiatura-insensitive. Python usava difflib.SequenceMatcher;
 * qui si usa un ratio basato su distanza di Levenshtein, che per nomi corti
 * (squadre di calcio) da' risultati sostanzialmente equivalenti.
 */

const SUFFIXES = [" fc", " sc", " cf", " rj", " sp", " mg", " ba", " ca", " ec", " ud", " ad", " club"];

function normName(s: string): string {
  let n = (s || "").toLowerCase().trim();
  for (const suf of SUFFIXES) {
    if (n.endsWith(suf)) n = n.slice(0, -suf.length);
  }
  n = n.replace(/[^\w\s]/g, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen > 0 ? 1 - dist / maxLen : 0;
}
