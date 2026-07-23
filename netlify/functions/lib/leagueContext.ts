/**
 * Porting 1:1 di detect_league_context / parse_league_label / LEAGUE_DNA
 * da backend/server.py — usato per arricchire il prompt AI con il contesto
 * del campionato (DNA gol, partita di coppa, ecc.)
 */

export const LEAGUE_DNA: Record<string, string> = {
  BUNDES: "Bundesliga (Germania) — DNA Over molto alto (media 3+ gol), difese aperte, ritmi alti",
  GER1: "Bundesliga — DNA Over alto (3+ gol)",
  GER2: "2.Bundesliga — DNA Over medio-alto (2.7 gol)",
  EREDIVISIE: "Eredivisie (Olanda) — DNA Over alto (3+ gol), tante reti",
  NED1: "Eredivisie — DNA Over alto",
  MLS: "MLS (USA) — DNA Over alto (2.9 gol)",
  USA1: "MLS — DNA Over alto",
  BRA1: "Serie A Brasile — DNA equilibrato (2.5 gol), GG frequente",
  BRA2: "Serie B Brasile — DNA conservativo (2.2 gol), molti pareggi 0-0/1-1",
  ARG1: "Liga Argentina — DNA molto conservativa (2.1 gol), tante U2.5",
  ITA1: "Serie A — DNA medio (2.5 gol), tattiche, U3.5 frequente",
  ITA2: "Serie B — DNA conservativo (2.3 gol), molti pareggi e under",
  SPA1: "La Liga — DNA medio-alto (2.6 gol)",
  SPA2: "Liga 2 — DNA equilibrato (2.4 gol)",
  ING1: "Premier League — DNA Over alto (2.8 gol), ritmi alti",
  ING2: "Championship — DNA equilibrato, ritmi alti ma difese deboli",
  FRA1: "Ligue 1 — DNA medio (2.5 gol)",
  POR1: "Liga Portuguesa — DNA equilibrato",
  TUR1: "Süper Lig — DNA Over alto, difese sgangherate",
  SCO1: "Scottish Premiership — DNA medio-alto",
  NOR: "Eliteserien (Norvegia) — DNA Over alto",
  SWE: "Allsvenskan (Svezia) — DNA Over alto",
  AUS: "A-League — DNA Over",
  JAP: "J-League — DNA medio (2.5 gol)",
  KOR: "K-League — DNA equilibrato",
};

const CUP_KEYWORDS = [
  "COPPA", "CUP", "CHAMP", "EUROPA", "CONFERENCE", "LIBERTADORES",
  "SUDAMERICANA", "ASIAN", "CAF", "CONCACAF", "TROPHY", "POKAL",
  "FA ", "EFL", "DFB", "COPPA ITALIA",
];

const LEAGUE_COUNTRY_CODES: Record<string, string> = {
  AFG: "Afghanistan", ALB: "Albania", ALG: "Algeria", AND: "Andorra",
  ANG: "Angola", ARA: "Arabia Saudita", ARG: "Argentina", ARM: "Armenia",
  AUS: "Australia", AUT: "Austria", AZE: "Azerbaigian", BEL: "Belgio",
  BOL: "Bolivia", BRA: "Brasile", BUL: "Bulgaria", CAM: "Camerun",
  CAN: "Canada", CHI: "Cile", CIN: "Cina", COL: "Colombia",
  COR: "Corea del Sud", COS: "Costa Rica", CRO: "Croazia", DAN: "Danimarca",
  ECU: "Ecuador", EGI: "Egitto", ESA: "El Salvador", EST: "Estonia",
  FIL: "Filippine", FIN: "Finlandia", FRA: "Francia", GAL: "Galles", GEO: "Georgia",
  GER: "Germania", GHA: "Ghana", GIA: "Giappone", GIO: "Giordania",
  GRE: "Grecia", GUA: "Guatemala", GUI: "Guinea", HON: "Honduras",
  IND: "India", ING: "Inghilterra", IRA: "Iran", IRL: "Irlanda",
  ISL: "Islanda", ISR: "Israele", ITA: "Italia", KAZ: "Kazakistan",
  KEN: "Kenya", LET: "Lettonia", LIT: "Lituania", LUX: "Lussemburgo",
  MAR: "Marocco", MEX: "Messico", MOL: "Moldavia", MON: "Montenegro",
  NIG: "Nigeria", NOR: "Norvegia", NUA: "Nuova Zelanda", OLA: "Olanda",
  PAN: "Panama", PAR: "Paraguay", PER: "Perù", POL: "Polonia",
  POR: "Portogallo", QAT: "Qatar", REP: "Repubblica Ceca", ROM: "Romania",
  RUS: "Russia", SCO: "Scozia", SEN: "Senegal", SER: "Serbia",
  SIN: "Singapore", SLO: "Slovenia", SPA: "Spagna", SRI: "Sri Lanka",
  SUD: "Sudafrica", SUR: "Suriname", SVE: "Svezia", SVI: "Svizzera",
  TAG: "Tagikistan", TAI: "Thailandia", TUN: "Tunisia", TUR: "Turchia",
  UCR: "Ucraina", UNG: "Ungheria", URU: "Uruguay", USA: "Stati Uniti",
  UZB: "Uzbekistan", VEN: "Venezuela", VIE: "Vietnam",
};

const LEAGUE_CATEGORY: Record<string, string> = {
  "1": "Prima Lega", "2": "Seconda Lega", "3": "Terza Lega",
  "4": "Quarta Lega", "5": "Quinta Lega", "6": "Sesta Lega",
  F: "Femminile", U17: "Under 17", U19: "Under 19",
  U20: "Under 20", U21: "Under 21", U23: "Under 23",
  CP: "Coppa", CUP: "Coppa", RS: "Riserve",
  CH: "Champions League", EU: "Europa League", CONF: "Conference League",
};

const LEAGUE_SPECIAL: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^AMIU(\d{2})/, (m) => `Amichevole Under ${m[1]}`],
  [/^AMINAZ/, () => "Amichevole Nazionali"],
  [/^AMICLUB/, () => "Amichevole Club"],
  [/^AMIF/, () => "Amichevole Femminile"],
  [/^AMI/, () => "Amichevole"],
  [/^EUCONFL/, () => "Euro Conference League"],
  [/^CPSUDAM/, () => "Coppa Sudamerica"],
  [/^CPLIB/, () => "Coppa Libertadores"],
  [/^CPCAR/, () => "Coppa Caraibica"],
  [/^CONCAF/, () => "Concacaf"],
  [/^CHAM/, () => "Champions League"],
  [/^EUR(?!O)/, () => "Europa League"],
  [/^CONF/, () => "Conference League"],
  [/^MOND/, () => "Mondiali"],
];

export function parseLeagueLabel(code: string): string {
  if (!code) return "";
  const c = code.trim().toUpperCase();
  for (const [pat, builder] of LEAGUE_SPECIAL) {
    const m = c.match(pat);
    if (m) return builder(m);
  }
  for (const [prefix, name] of Object.entries(LEAGUE_COUNTRY_CODES)) {
    if (c.startsWith(prefix)) {
      const parts = [name];
      const rest = c.slice(prefix.length);
      if (rest.includes("CP")) {
        parts.push("Coppa");
        if (rest.endsWith("F")) parts.push("Femminile");
        if (rest.endsWith("RS")) parts.push("Riserve");
        return parts.join(" ");
      }
      const catMatch = rest.match(/^(U\d{2}|F|CP|CUP|RS|CH|EU|CONF)/);
      if (catMatch) {
        parts.push(LEAGUE_CATEGORY[catMatch[1]] || catMatch[1]);
      } else {
        const numMatch = rest.match(/^(\d+)/);
        if (numMatch) {
          const n = numMatch[1];
          parts.push(LEAGUE_CATEGORY[n] || `Serie ${n}`);
          const tail = rest.slice(n.length);
          if (tail && LEAGUE_CATEGORY[tail]) parts.push(LEAGUE_CATEGORY[tail]);
        }
      }
      return parts.join(" ");
    }
  }
  return "";
}

export function detectLeagueContext(manifestazione: string): string {
  if (!manifestazione) return "";
  const code = manifestazione.toUpperCase().trim();
  const parts: string[] = [];
  for (const [key, desc] of Object.entries(LEAGUE_DNA)) {
    if (code.includes(key)) {
      parts.push(`CAMPIONATO: ${desc}`);
      break;
    }
  }
  if (CUP_KEYWORDS.some((kw) => code.includes(kw))) {
    parts.push(
      "TIPO: PARTITA DI COPPA — tendenza a tatticismi, gestione conservativa nelle fasi a eliminazione, attenzione a supplementari (escludere O3.5 se eliminazione)"
    );
  } else if (code.endsWith("1") || code.slice(-2).includes("1")) {
    parts.push("TIPO: Campionato di prima divisione");
  } else if (code.endsWith("2")) {
    parts.push("TIPO: Campionato di seconda divisione — solitamente più conservativo, meno gol");
  }
  return parts.join(" | ");
}
