import { parseExcelBytes, type ParsedMatch } from "./lib/excelParser";
import { pgGet, pgPost, pgPatch, jsonResponse, supabaseConfig } from "./lib/supabaseRest";

/**
 * POST /upload-excel  (multipart/form-data, campo "file")
 * Porting di POST /upload-excel (server.py) — stesso parsing, stessa logica
 * di insert/update/unchanged, ma scrive su Supabase invece che MongoDB.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST" }, 405);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch (e: any) {
    return jsonResponse({ error: `Errore lettura form: ${e.message}` }, 400);
  }
  if (!file) return jsonResponse({ error: "Campo 'file' mancante" }, 400);

  let parsed;
  try {
    const buf = await file.arrayBuffer();
    parsed = parseExcelBytes(buf, file.name || "upload.xlsx");
  } catch (e: any) {
    return jsonResponse({ error: `Errore parsing Excel: ${e.message}` }, 400);
  }

  const { matches: validMatches, skipped, rows_seen } = parsed;

  let inserted = 0, updated = 0, unchanged = 0;

  for (const m of validMatches) {
    const filter =
      `squadra1=eq.${encodeURIComponent(m.squadra1)}` +
      `&squadra2=eq.${encodeURIComponent(m.squadra2)}` +
      `&day=eq.${encodeURIComponent(m.day)}`;

    const existingRows = await pgGet(`matches?${filter}&select=*`);
    const existing = existingRows[0];

    if (existing) {
      const oldOdds = extractOddsForCompare(existing);
      const newOdds = extractOddsForCompare(m.odds);
      if (sameOdds(oldOdds, newOdds)) {
        unchanged++;
        continue;
      }
      await pgPatch(`matches?id=eq.${existing.id}`, {
        odd_1: m.odds.odd_1, odd_x: m.odds.odd_X, odd_2: m.odds.odd_2,
        odd_1x: m.odds.odd_1X, odd_x2: m.odds.odd_X2, odd_12: m.odds.odd_12,
        odd_u15: m.odds.odd_U15, odd_o15: m.odds.odd_O15,
        odd_u25: m.odds.odd_U25, odd_o25: m.odds.odd_O25,
        odd_u35: m.odds.odd_U35, odd_o35: m.odds.odd_O35,
        odd_gg: m.odds.odd_GG, odd_ng: m.odds.odd_NG,
        estimated: m.odds.estimated,
        time: m.time,
        manifestazione: m.manifestazione,
        updated_at: new Date().toISOString(),
      });
      // Le quote sono cambiate: il pronostico precedente non è più valido
      await deletePredictions(existing.id);
      updated++;
    } else {
      await pgPost("matches", {
        day: m.day, time: m.time, manifestazione: m.manifestazione,
        squadra1: m.squadra1, squadra2: m.squadra2,
        odd_1: m.odds.odd_1, odd_x: m.odds.odd_X, odd_2: m.odds.odd_2,
        odd_1x: m.odds.odd_1X, odd_x2: m.odds.odd_X2, odd_12: m.odds.odd_12,
        odd_u15: m.odds.odd_U15, odd_o15: m.odds.odd_O15,
        odd_u25: m.odds.odd_U25, odd_o25: m.odds.odd_O25,
        odd_u35: m.odds.odd_U35, odd_o35: m.odds.odd_O35,
        odd_gg: m.odds.odd_GG, odd_ng: m.odds.odd_NG,
        estimated: m.odds.estimated,
      }, "return=minimal");
      inserted++;
    }
  }

  try {
    await pgPost("upload_skipped", {
      id: "latest",
      filename: file.name || "upload.xlsx",
      uploaded_at: new Date().toISOString(),
      rows_seen,
      valid_matches: validMatches.length,
      inserted, updated, unchanged,
      skipped_count: skipped.length,
      skipped,
    }, "resolution=merge-duplicates,return=minimal");
  } catch {
    // diagnostica non critica: non blocchiamo la risposta se fallisce
  }

  return jsonResponse({
    inserted, updated, unchanged,
    skipped: skipped.length,
    total_parsed: validMatches.length,
    rows_seen,
  });
};

function extractOddsForCompare(o: any): Record<string, number | null> {
  return {
    odd_1: numOrNull(o.odd_1 ?? o.odd_X1 ?? o["odd_1"]),
    odd_X: numOrNull(o.odd_X ?? o["odd_X"] ?? o.odd_x),
    odd_2: numOrNull(o.odd_2 ?? o["odd_2"]),
    odd_1X: numOrNull(o.odd_1X ?? o.odd_1x),
    odd_X2: numOrNull(o.odd_X2 ?? o.odd_x2),
    odd_12: numOrNull(o.odd_12),
    odd_U15: numOrNull(o.odd_U15 ?? o.odd_u15),
    odd_O15: numOrNull(o.odd_O15 ?? o.odd_o15),
    odd_U25: numOrNull(o.odd_U25 ?? o.odd_u25),
    odd_O25: numOrNull(o.odd_O25 ?? o.odd_o25),
    odd_U35: numOrNull(o.odd_U35 ?? o.odd_u35),
    odd_O35: numOrNull(o.odd_O35 ?? o.odd_o35),
    odd_GG: numOrNull(o.odd_GG ?? o.odd_gg),
    odd_NG: numOrNull(o.odd_NG ?? o.odd_ng),
  };
}

function numOrNull(v: any): number | null {
  return v === undefined || v === null ? null : Number(v);
}

function sameOdds(a: Record<string, number | null>, b: Record<string, number | null>): boolean {
  const keys = Object.keys(a);
  return keys.every((k) => a[k] === b[k]);
}

async function deletePredictions(matchId: string) {
  const { url, key } = supabaseConfig();
  await fetch(`${url}/rest/v1/predictions?match_id=eq.${encodeURIComponent(matchId)}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}
