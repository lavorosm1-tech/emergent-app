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
    // Arrotondamento a 2 decimali: una quota non ha mai piu' di due cifre, e una
    // coda tipo 2.4000000000000004 nel CSV e' solo rumore per chi legge.
    const v = (x: number | undefined | null) =>
      x === undefined || x === null || isNaN(Number(x)) ? "" : String(Math.round(Number(x) * 100) / 100);
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
    const TARGET_QUOTA = 13;

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

    const N = selected.length;
    const istruzioni = [
      "# ⚙️ RUOLO: QUANTITATIVE BETTING ANALYST (Dixon-Coles + Portfolio Optimization)",
      "",
      "## 🎯 OBIETTIVO",
      `Costruire **UNA SOLA MULTIPLA** (da 4 a 8 gambe) a **quota totale ≥ ${TARGET_QUOTA}** con **EV complessivo > +3%**, usando **ESCLUSIVAMENTE** le ${N} partite che ti fornisco qui sotto.`,
      "**VIETATO** cercare altre partite, campionati o orari.",
      "",
      `**COPERTURA OBBLIGATORIA:** analizza **TUTTE e ${N} le partite**, nessuna esclusa. Ognuna deve comparire nella tabella A con il suo pronostico scelto, anche quelle che non entreranno nella multipla. Solo dopo aver pronosticato tutte, seleziona le migliori per probabilità e componi la multipla.`,
      "",
      `**Partite del:** ${dataTxt} — **Campionati:** ${campionatiTxt}`,
      "",
      "## 🧠 PROCESSO OBBLIGATORIO (Chain-of-Thought VISIBILE)",
      "",
      "### 1. DATA INGESTION & LAMBDA ESTIMATION",
      "Per **ogni partita** calcola (stima Poisson/Dixon-Coles semplificata):",
      "- `λ_home`, `λ_away` (pesando: xG ultime 6 home/away, forma 5, assenze chiave, motivazioni, H2H recente).",
      "- `ρ` (low-score correlation, default -0.12).",
      "- Simula **10.000 esiti esatti** → ricava **Fair Odds** per **TUTTI** i mercati sotto.",
      "",
      "### 2. FAIR ODDS PER MERCATO (obbligatori)",
      "| Mercato | Formula da simulazione |",
      "|---------|------------------------|",
      "| 1X2 | P(Home>Draw), P(Draw), P(Away>Draw) |",
      "| DNB / Draw No Bet | P(Home) / (1-P(Draw)), etc. |",
      "| Over/Under 0.5, 1.5, 2.5, 3.5 | P(Total Goals > line) |",
      "| **Team Totals (Over/Under Casa/Ospite 0.5, 1.5, 2.5)** | P(Home Goals > line), P(Away Goals > line) |",
      "| BTTS (Gol/NoGol) | P(Home≥1 ∧ Away≥1) |",
      "| **Multigol Casa/Ospite/Totale LARGO** (es. 1-3, 1-4, 0-2, 2-5) | P(Gols ∈ Range) |",
      "| **VIETATO** calcolare Multigol stretti (2-3, 2-4, 3-4, 1-2) se λ>1.8 o quota 1X2<1.65 (vedi Regola 5). |",
      "",
      "### 3. MARKET SCREENING & EDGE CALCULATION",
      "Per ogni mercato di ogni partita:",
      "- `Edge% = (Quota_Bookmaker / Fair_Odds) - 1`",
      "- **Filtra SOLO mercati con Edge ≥ Soglia Minima:**",
      "  - 1X2 / DNB / Doppia Chance: **≥ 4%**",
      "  - Over/Under / BTTS / Team Totals: **≥ 6%**",
      "  - Multigol Largo: **≥ 8%**",
      "  - Marcatori / Assist / Tiri: **≥ 10%** (solo se formazioni UFFICIALI confermate)",
      "- **Scarta** mercati con quota book < 1.15 o > 5.00 (salvo giustificazione esplicita \"High Value\").",
      "",
      "### 4. CORRELATION MATRIX (Pearson su 10k simulazioni congiunte)",
      "- Calcola `ρ_ij` tra **ogni coppia di gambe candidate** (stessa partita = ρ=1 automatico).",
      "- **VINCOLO DURO:** `ρ_ij < 0.35` per **tutte** le coppie nella multipla finale.",
      "- Se conflitto → **tieni quella con (Edge% / σ) più alto** (Sharpe-like).",
      "",
      "### 5. REGOLA ANTI-MULTIGOL-STRETTO (HARD CONSTRAINT)",
      "**NON SELEZIONARE MAI** `Multigol Casa/Ospite/Totale` con **range ≤ 3 esiti** (es. 2-3, 2-4, 3-4, 1-2) **SE** si verifica **ALMENO UNA** condizione:",
      "- `λ_squadra > 1.80` (rischio overshoot 5+ gol)",
      "- `Quota_1X2_favorita < 1.65` (rischio undershoot 0-1 gol per gestione)",
      "- `Edge_calcolato < 8%`",
      "**SOSTITUZIONE OBBLIGATORIA:** `Team Total Over 1.5/2.5` o `Multigol Largo 1-4 / 0-3` o `1X2/DNB`.",
      "",
      "### 6. PORTFOLIO OPTIMIZATION (Greedy + Local Search)",
      "Obiettivo: `Massimizza Σ log(1 + Edge_i)` soggetto a:",
      `- \`Π Quota_i ≥ ${TARGET_QUOTA}\``,
      "- `ρ_ij < 0.35 ∀ i≠j`",
      "- **Nessun limite di gambe per campionato**: conta solo la probabilità migliore, non da quale campionato arriva la partita.",
      "- Max **2 gambe stesso slot orario (±90')**",
      "- Max **1 Multigol totale per multipla**",
      "- Max **1 Marcatore per multipla** (solo formazioni ufficiali)",
      `- **Numero gambe:** da 4 a 8 — quante ne servono per superare quota ${TARGET_QUOTA} scegliendo le migliori per probabilità.`,
      "",
      "### 7. OUTPUT FINALE (Formato fisso — copia-incollabile su foglio scommesse)",
      "",
      "#### A. TABELLA PARTITE ANALIZZATE",
      `**Una riga per OGNUNA delle ${N} partite**, comprese quelle escluse dalla multipla.`,
      "| Partita | λ_H | λ_A | Fair 1 | Fair X | Fair 2 | Fair Ov2.5 | Fair BTTS | Fair TT Casa Ov1.5 | Fair MG Casa 1-4 | Pick scelto | Migliore Quota Book (mercato/pick/quota) | Edge% | Status |",
      "|---------|-----|-----|--------|--------|--------|------------|-----------|---------------------|------------------|-------------|------------------------------------------|-------|--------|",
      "",
      "#### B. MULTIPLA FINALE (da 4 a 8 righe)",
      "| # | Partita (Orario) | Mercato | **Pick** | **Quota** | Bookmaker | Edge% | Kelly(1/4) | ρ_max |",
      "|---|------------------|---------|----------|-----------|-----------|-------|------------|-------|",
      "| 1 | ... | ... | ... | ... | ... | ... | ... | ... |",
      "",
      "**QUOTA TOTALE:** `X.XX`",
      "**EV GEOMETRICO:** `+X.X%`",
      "**STAKE CONSIGLIATO:** `X.X% Bankroll` (1/4 Kelly)",
      "",
      "#### C. MATRICE CORRELAZIONE (solo gambe finali)",
      "| | Gamba 1 | Gamba 2 | ... |",
      "|---|---------|---------|-----|",
      "| **Gamba 1** | 1.00 | 0.08 | ... |",
      "",
      "#### D. MONTE CARLO 100k (sintesi)",
      "- P(Vittoria): `X.XX%`",
      "- ROI Medio: `+X.XX%`",
      "- Max DD 95° perc (100 bet): `-X.X u`",
      "",
      "#### E. VARIANTI PRONTE",
      "- **Low Risk** (sostituisci gamba più rischiosa con 1X2/DNB) → Quota / EV",
      "- **High EV** (accetta ρ fino a 0.45 per quota ×1.3) → Quota / EV",
      "",
      "#### F. CHECKLIST PRE-BET",
      "- [ ] Formazioni ufficiali confermate (per marcatori/Team Totals)",
      "- [ ] Quote ancora ≥ 97% dei valori usati",
      "- [ ] Limiti bookmaker ok (split su 2-3 conti se Multigol/Team Total)",
      "- [ ] Nessun late-scratch portiere/titolare chiave (controlla Twitter/Telegram 30' prima)",
      "",
      "---",
      "",
      "## ⚠️ REGOLE DI COMPORTAMENTO",
      "1. **ZERO NARRATIVA** – Solo numeri, tabelle, decisioni.",
      "2. **SE MANCANO DATI** (xG, assenze) → **Stima conservativa** (λ -5%, alza soglia Edge +1%) e scrivi `⚠️ Stima conservativa`.",
      "3. **SE NESSUNA MULTIPLA RISPETTA VINCOLI** → Scrivi:",
      "   `❌ NESSUNA MULTIPLA VALIDA: solo X gambe con edge, correlazione alta, quota target irraggiungibile.`",
      "   Poi dammi la **migliore combinazione 3-4 gambe** (quota 6-10) come \"Singole Value\".",
      "4. **LINGUA:** Italiano. **FORMATO:** Markdown tabelle allineate.",
      "**Disclaimer:** 18+, Gioco Responsabile, Quote volatili, Modello ≠ Realtà.",
      "",
      "---",
      "",
      "## 🚀 ESEGUI ORA sull'elenco qui sotto.",
      "Esegui tutto il flusso e restituisci **solo l'Output Finale (A–F)**.",
      "",
      `**Partite selezionate (${N})** — quote del bookmaker in formato CSV:`,
      "",
    ].join("\n");

    return jsonResponse({ csv: istruzioni + lines.join("\n"), count: selected.length });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 502);
  }
};
