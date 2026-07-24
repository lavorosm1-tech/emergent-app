import { pgGet, jsonResponse, rowToMatch } from "./lib/supabaseRest";
import { parseLeagueLabel } from "./lib/leagueContext";

/**
 * GET /aistudio-prompt
 * Porting di GET /aistudio/prompt (server.py) — genera un CSV delle partite
 * in Schedina, da incollare in AI Studio per un'analisi esterna.
 */
export default async (): Promise<Response> => {
  try {
    const rows = await pgGet(`matches?selected=eq.true&select=*`);
    if (!rows.length) return jsonResponse({ csv: "", count: 0 });
    const selected = rows.map(rowToMatch);

    const header = "Ora,Lega,Competizione,Casa,Ospite,1,X,2,1X,X2,U1.5,O1.5,U2.5,O2.5,U3.5,O3.5,GG,NG";
    const lines = [header];
    const v = (x: number | undefined | null) => (x === undefined || x === null ? "" : String(x));
    const s = (x: string) => String(x).replace(/,/g, " ").trim();

    for (const m of selected as any[]) {
      const o = m.odds || {};
      const compLabel = parseLeagueLabel(m.manifestazione) || "";
      lines.push([
        m.time, s(m.manifestazione), s(compLabel), s(m.squadra1), s(m.squadra2),
        v(o.odd_1), v(o.odd_X), v(o.odd_2),
        v(o.odd_1X), v(o.odd_X2),
        v(o.odd_U15), v(o.odd_O15),
        v(o.odd_U25), v(o.odd_O25),
        v(o.odd_U35), v(o.odd_O35),
        v(o.odd_GG), v(o.odd_NG),
      ].join(","));
    }

    return jsonResponse({ csv: lines.join("\n"), count: selected.length });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
