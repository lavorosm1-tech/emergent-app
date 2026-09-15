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
    // 15/09/2026 — ORDINE. Supabase restituisce le righe senza un ordine
    // garantito, quindi nel prompt le partite arrivavano sparse: prima una
    // delle 21:00, poi una delle 15:00, poi un'altra competizione. Ora sono
    // ordinate per giorno, poi orario, poi competizione e squadra di casa —
    // lo stesso ordine in cui Rossi le vede in Schedina.
    const selected = rows.map(rowToMatch).sort((a: any, b: any) =>
      String(a.day || "").localeCompare(String(b.day || "")) ||
      String(a.time || "").localeCompare(String(b.time || "")) ||
      String(a.manifestazione || "").localeCompare(String(b.manifestazione || "")) ||
      String(a.squadra1 || "").localeCompare(String(b.squadra1 || ""))
    );

    const header = "Data,Ora,Lega,Competizione,Casa,Ospite,1,X,2,1X,X2,U1.5,O1.5,U2.5,O2.5,U3.5,O3.5,GG,NG";
    const lines = [header];
    const v = (x: number | undefined | null) => (x === undefined || x === null ? "" : String(x));
    const s = (x: string) => String(x).replace(/,/g, " ").trim();

    for (const m of selected as any[]) {
      const o = m.odds || {};
      const compLabel = parseLeagueLabel(m.manifestazione) || "";
      lines.push([
        s(m.day || ""), m.time, s(m.manifestazione), s(compLabel), s(m.squadra1), s(m.squadra2),
        v(o.odd_1), v(o.odd_X), v(o.odd_2),
        v(o.odd_1X), v(o.odd_X2),
        v(o.odd_U15), v(o.odd_O15),
        v(o.odd_U25), v(o.odd_O25),
        v(o.odd_U35), v(o.odd_O35),
        v(o.odd_GG), v(o.odd_NG),
      ].join(","));
    }

    // ========================================================================
    // 15/09/2026 — PROMPT SOSTITUITO con la specifica scritta da Rossi.
    //
    // Prima erano quattro righe ("fai un pronostico, multipla da almeno 13").
    // Ora e' una consegna da analista quantitativo, con soglie di edge per
    // mercato, vincoli di correlazione e formato di output preteso.
    //
    // I segnaposto della specifica ({data}, {lista_campionati}, {target_quota})
    // NON restano da riempire a mano: li compiliamo qui dai dati veri della
    // Schedina. La specifica diceva "partite di OGGI", ma le partite
    // selezionate hanno la LORO data, che non e' detto sia oggi: usiamo quella,
    // altrimenti il modello cercherebbe formazioni per il giorno sbagliato.
    // ========================================================================
    const TARGET_QUOTA = 15;

    const giorni = (Array.from(new Set(selected.map((m: any) => m.day).filter(Boolean))) as string[]).sort();
    const itDate = (d: string) => {
      const [y, mo, da] = String(d).split("-");
      return da && mo && y ? `${da}/${mo}/${y}` : String(d);
    };
    const dataTxt = giorni.length
      ? giorni.map(itDate).join(", ")
      : "(data non disponibile)";

    const campionati = (Array.from(
      new Set(selected.map((m: any) => parseLeagueLabel(m.manifestazione) || m.manifestazione))
    ) as string[]).sort();
    const campionatiTxt = campionati.length ? campionati.join(", ") : "(non disponibili)";

    const istruzioni = [
      "**Ruolo:** Quantitative Sports Betting Analyst (Poisson/Dixon-Coles + Copula correlazione + Kelly Criterion).",
      "",
      `**Task:** Costruisci **1 multipla mista (max 6-8 gambe)** per le partite del **${dataTxt}** nei campionati: ${campionatiTxt}.`,
      `Obiettivo: **Quota totale ≥ ${TARGET_QUOTA}** con **Expected Value (EV) complessivo > +3%**.`,
      "",
      "**Mercati Ammessi & Regole Specifiche:**",
      "",
      "1.  **1X2 / Doppia Chance / Draw No Bet** → Edge min **≥ 4%**. Max 4 gambe.",
      "2.  **Goal/NoGoal (BTTS)** → Edge min **≥ 6%**. *Vietato abbinare a Over 2.5 o Multigol Totale della STESSA partita.*",
      "3.  **Over/Under 2.5 (o 1.5/3.5 se value)** → Edge min **≥ 6%**. *Max 2 gambe totali nella multipla.*",
      "4.  **Multigol Casa / Ospite / Totale (es. 2-4, 1-3, 0-2)** → **Solo se hai modello Dixon-Coles + Copula**.",
      "    - Calcola P(Exact Goals) per range.",
      "    - Edge min **≥ 8%** (overround alto).",
      "    - **Max 1 gamba Multigol per multipla.**",
      "5.  **Marcatore Anytime / Primo Marc. / Assist** → **Solo se formazioni UFFICIALI confermate**.",
      "    - Usa xG90 + xA90 + penalità/rigori + posizione (titolare garantito 90').",
      "    - Edge min **≥ 10%**. **Max 1 gamba.** *No multipla se line-up non out.*",
      "",
      "**Vincoli Strutturali (Anti-Correlazione):**",
      "- **Matrice Correlazione (Pearson/Spearman su simulazioni 10k Monte Carlo):**",
      "  - Se ρ( Gamba_i , Gamba_j ) > 0.35 → **SCARTA una delle due** (tieni quella con EV/σ più alto).",
      "  - Es. `Over 2.5 Partita A` + `BTTS Partita A` → ρ ≈ 0.75 → **VIETATO**.",
      "  - Es. `Vittoria Casa Forte Partita A` + `Over 1.5 Casa Partita A` → ρ ≈ 0.6 → **VIETATO**.",
      "- **Esposizione per campionato:** Max **2 gambe nello stesso campionato** (diversificazione sistemica).",
      "- **Esposizione per orario:** Max **2 gambe nello stesso slot orario** (live-hedge impossibile altrimenti).",
      "",
      "**Processo Obbligatorio (Chain-of-Thought visibile):**",
      "1.  **Data Ingestion:** Partite del giorno → Formazioni probabili/ufficiose → xG/xGA ultime 6 (home/away split) → Assenze chiave (pesate per xG contribution) → Motivazioni (classifica, coppe, derby).",
      "2.  **Fair Odds Engine per partita:**",
      "    - Fit **Dixon-Coles** (time-decay ξ=0.0018, ρ per low-scoring correction).",
      "    - Simula **10.000 match** → Distribuzione esatta P(Home Goals, Away Goals).",
      "    - Deriva **Fair Odds** per *ogni mercato ammesso* (1X2, O/U 0.5-4.5, BTTS, Multigol 0-1, 2-3, 4+, Marcatori top 3 per squadra).",
      "3.  **Value Detection:** Per ogni mercato, `Edge% = (Quota_Book / Fair_Odds) - 1`. Filtra `Edge% ≥ Soglia_Mercato`.",
      "4.  **Portfolio Optimization (Knapsack + Correlazione):**",
      "    - Obiettivo: `Max Σ log(1 + Edge_i)` s.t. `Π Quota_i ≥ Target` ∧ `ρ_ij < 0.35 ∀ i≠j` ∧ `Vincoli_Strutturali`.",
      "    - Risolvi con **Greedy + Local Search** (o MILP se hai solver).",
      "5.  **Output Finale:**",
      "    - **Tabella Partite (con Fair Odds calcolate vs Quote Book).**",
      "    - **Multipla Selezionata:** {Evento, Mercato, Pick, Quota_Book, Fair_Odds, Edge%, Kelly%_suggerito}.",
      "    - **Matrice Correlazione (heatmap o tabella ρ_ij).**",
      "    - **Simulazione Monte Carlo Multipla:** P(Vittoria), ROI atteso, Drawdown max 95° percentile.",
      "    - **Varianti:** \"Low Risk\" (sostituisci gambe ρ-alte con 1X2/DC), \"High EV\" (accetta ρ fino a 0.45 per quota > Target*1.5).",
      "    - **Checklist Pre-Bet:** Formazioni confermate? Quote ancora valide? Limiti bookmaker ok?",
      "",
      "**Tono:** Clinico, matematico, zero narrative. Mostra i numeri (λ_home, λ_away, ρ, Edge%, Kelly). Includendo le partite che sono state selezionate.",
      "",
      "---",
      "",
      `**Partite selezionate (${selected.length})** — quote del bookmaker in formato CSV:`,
      "",
    ].join("\n");

    return jsonResponse({ csv: istruzioni + lines.join("\n"), count: selected.length });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
