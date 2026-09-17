import { pgGet, jsonResponse, rowToMatch } from "./lib/supabaseRest";
import { parseLeagueLabel } from "./lib/leagueContext";

/**
 * GET /aistudio-prompt
 * Genera il testo da incollare in TypingMind per far analizzare le partite
 * in Schedina da un modello esterno con la ricerca web attiva.
 *
 * ==========================================================================
 * 16/09/2026 — RISCRITTA DA ZERO. PROMPT CORTO, SENZA QUOTE.
 * ==========================================================================
 * Le versioni precedenti erano lunghe centinaia di righe: fair odds,
 * Edge%, Kelly, matrice di correlazione con 10.000 simulazioni Monte Carlo,
 * soglie per mercato. Il test sul campo ha mostrato due difetti che nessuna
 * riscrittura del testo poteva sanare:
 *
 *  1) CIRCOLO VIZIOSO. Ricevendo il CSV delle quote, il modello ricavava le
 *     "fair odds" da quelle stesse quote. Confrontare un listino con se
 *     stesso privato del margine da' una somma di edge sempre pari a MENO il
 *     margine: il value non puo' esistere, mai, su nessuna partita. Gli edge
 *     positivi che comparivano erano solo errori di arrotondamento.
 *  2) QUOTE INVENTATE. Su Sunderland-AZ il modello ha consigliato X2 a 1.85
 *     mentre nel CSV c'era 2.10, costruendoci sopra un edge del +8,9%.
 *
 * Rossi ha poi provato a mano un prompt di sei righe, senza quote, con la
 * ricerca web attiva: risultato migliore di tutto l'apparato matematico.
 *
 * Da qui la scelta: diamo SOLO giorno, ora, campionato e squadre. Le quote
 * il modello se le cerca sul web insieme a forma, gol e assenze, cosi' il
 * suo giudizio nasce da dati indipendenti invece che dal listino stesso.
 *
 * Niente fair odds, niente Edge%, niente Kelly: sono calcoli che un modello
 * in chat non puo' eseguire davvero, e produrre numeri che sembrano calcoli
 * e non lo sono e' peggio che non produrne.
 *
 * L'unica regola di sostanza rimasta e' quella che risolve un errore vero:
 * non puntare contro il risultato probabile, cambiare mercato invece.
 * ==========================================================================
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgGet(`matches?selected=eq.true&select=*`);
    if (!rows.length) return jsonResponse({ csv: "", count: 0 });

    // Ordine per giorno, poi orario, poi competizione e squadra di casa: lo
    // stesso in cui Rossi le vede in Schedina. Supabase non garantisce un
    // ordine, e senza questo le partite arrivavano sparse.
    const selected = rows.map(rowToMatch).sort((a: any, b: any) =>
      String(a.day || "").localeCompare(String(b.day || "")) ||
      String(a.time || "").localeCompare(String(b.time || "")) ||
      String(a.manifestazione || "").localeCompare(String(b.manifestazione || "")) ||
      String(a.squadra1 || "").localeCompare(String(b.squadra1 || ""))
    );

    const N = selected.length;

    // Data in formato italiano: il modello deve cercare la partita giusta, e
    // con partite su piu' giorni ogni riga porta la sua.
    const itDate = (d: string) => {
      const [y, mo, da] = String(d || "").split("-");
      return da && mo && y ? `${da}-${mo}-${y}` : String(d || "");
    };

    const righe = (selected as any[]).map((m) => {
      const comp = parseLeagueLabel(m.manifestazione) || m.manifestazione || "";
      return `${itDate(m.day)} | ${m.time || ""} | ${comp} — ${m.squadra1} - ${m.squadra2}`;
    });

    const prompt = [
      "Fai una ricerca via web e analizza queste partite.",
      "",
      `1) Per OGNI partita (tutte e ${N}, nessuna esclusa) scrivi:`,
      "   partita | pronostico scelto | 1 riga di motivazione (forma, gol fatti/subiti, assenze).",
      "",
      "2) Poi componi UNA multipla di 5-8 eventi, scegliendo le partite con la",
      "   probabilità migliore — indipendentemente da campionato e orario.",
      "   Quota totale minima 13. Un solo evento per partita.",
      "   Alla fine indica la quota totale.",
      "",
      "Mercati ammessi (solo questi): 1, 2, 1X, X2, GG, Over 2.5, MG Casa 2-4, MG Ospite 2-4.",
      "",
      "Non puntare contro il risultato probabile: se la favorita paga troppo poco,",
      "cambia mercato (Over 2.5, GG, MG) invece di giocare l'esito opposto.",
      "",
      "Se per una partita non trovi dati sufficienti (partita lontana, formazioni",
      "non uscite), scrivilo invece di inventare.",
      "",
      "Partite:",
      ...righe,
    ].join("\n");

    // La chiave resta "csv" perche' e' quella che il frontend legge da sempre
    // in tre schermate: rinominarla vorrebbe dire toccarle tutte per niente.
    return jsonResponse({ csv: prompt, count: N });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || "Errore" }, 502);
  }
};
