import { pgGet, pgPost, jsonResponse } from "./lib/supabaseRest";

/**
 * GET  /odd-settings              -> { min_odd, options }
 * POST /odd-settings { min_odd }  -> { ok, min_odd }
 *
 * FASE 2 — soglia di quota minima scelta dall'utente.
 *
 * Perché è una scelta e non un numero fisso: probabilità e quota sono la
 * stessa cosa vista da due lati, quindi non esiste un valore "giusto" per
 * tutti. Misurato sul motore vero, su 583 partite storiche:
 *
 *   soglia 1,40 -> precisione 62,3%, quota media 1,56
 *   soglia 1,50 -> precisione 61,6%, quota media 1,62
 *   soglia 1,60 -> precisione 54,0%, quota media 1,86
 *   soglia 1,75 -> precisione 49,7%, quota media 2,08
 *
 * Alzando la soglia si compra quota pagandola in precisione. Il salto più
 * netto è fra 1,50 e 1,60: -7,6 punti di precisione per +24 centesimi.
 */

export const MIN_ODD_OPTIONS = [1.40, 1.50, 1.60, 1.75];
export const DEFAULT_MIN_ODD = 1.40;

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method === "GET") {
      return jsonResponse({ min_odd: await readMinOdd(), options: MIN_ODD_OPTIONS });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const value = Number(body?.min_odd);
      if (!isFinite(value) || !MIN_ODD_OPTIONS.includes(value)) {
        return jsonResponse({ error: `min_odd non valida. Valori ammessi: ${MIN_ODD_OPTIONS.join(", ")}` }, 400);
      }
      await pgPost(
        "settings",
        // La colonna `value` è jsonb: ci scriviamo direttamente un numero.
        { key: "min_odd", value },
        "resolution=merge-duplicates,return=minimal",
      );
      return jsonResponse({ ok: true, min_odd: value });
    }

    return jsonResponse({ error: "Metodo non supportato" }, 405);
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};

/** Legge la soglia salvata; se manca o è illeggibile torna al default. */
export async function readMinOdd(): Promise<number> {
  try {
    const rows = await pgGet(`settings?key=eq.min_odd&select=value`);
    if (!rows.length) return DEFAULT_MIN_ODD;
    const v = Number(rows[0].value);
    return isFinite(v) && v > 1 ? v : DEFAULT_MIN_ODD;
  } catch {
    return DEFAULT_MIN_ODD;
  }
}
