// League acronym dictionary
// Parses codes like "ITA1", "AMINAZ", "CPSUDAM", "BRA1RS"

const COUNTRY: Record<string, string> = {
  ITA: "Italia",
  ENG: "Inghilterra",
  ING: "Inghilterra",
  SPA: "Spagna",
  ESP: "Spagna",
  GER: "Germania",
  DEU: "Germania",
  FRA: "Francia",
  BRA: "Brasile",
  ARG: "Argentina",
  NED: "Olanda",
  OLA: "Olanda",
  POR: "Portogallo",
  ISR: "Israele",
  USA: "Stati Uniti",
  MEX: "Messico",
  COL: "Colombia",
  CHL: "Cile",
  URY: "Uruguay",
  PAR: "Paraguay",
  BOL: "Bolivia",
  ECU: "Ecuador",
  TUR: "Turchia",
  GRE: "Grecia",
  BEL: "Belgio",
  SUI: "Svizzera",
  SCO: "Scozia",
  IRL: "Irlanda",
  NOR: "Norvegia",
  SWE: "Svezia",
  DEN: "Danimarca",
  FIN: "Finlandia",
  POL: "Polonia",
  CZE: "Cechia",
  HUN: "Ungheria",
  ROM: "Romania",
  BUL: "Bulgaria",
  SRB: "Serbia",
  CRO: "Croazia",
  AUT: "Austria",
  RUS: "Russia",
  UKR: "Ucraina",
  JPN: "Giappone",
  KOR: "Corea del Sud",
  CHN: "Cina",
  AUS: "Australia",
  EGY: "Egitto",
  MAR: "Marocco",
  TUN: "Tunisia",
  ALG: "Algeria",
  RSA: "Sudafrica",
  NGA: "Nigeria",
  GHA: "Ghana",
  CIV: "Costa d'Avorio",
  IND: "India",
};

const CATEGORY: Record<string, string> = {
  "1": "Massima Serie",
  "2": "Seconda Divisione",
  "3": "Terza Divisione",
  "4": "Quarta Divisione",
  F: "Femminile",
  U19: "Under 19",
  U20: "Under 20",
  U21: "Under 21",
  U17: "Under 17",
  CP: "Coppa Nazionale",
  CUP: "Coppa Nazionale",
  RS: "Riserve",
  CH: "Champions League",
  EU: "Europa League",
  CONF: "Conference League",
};

const MISC: Record<string, string> = {
  AMI: "Amichevole",
  NAZ: "Nazionali",
  MOND: "Mondiali",
  SUD: "Sud",
  AM: "America",
  NORD: "Nord",
  CEN: "Centro",
  EUR: "Europa",
  ASI: "Asia",
  AFR: "Africa",
};

const AREA_BY_COUNTRY: Record<string, string> = {
  Italia: "Europa", Inghilterra: "Europa", Spagna: "Europa", Germania: "Europa",
  Francia: "Europa", Olanda: "Europa", Portogallo: "Europa", Israele: "Europa",
  Turchia: "Europa", Grecia: "Europa", Belgio: "Europa", Svizzera: "Europa",
  Scozia: "Europa", Irlanda: "Europa", Norvegia: "Europa", Svezia: "Europa",
  Danimarca: "Europa", Finlandia: "Europa", Polonia: "Europa", Cechia: "Europa",
  Ungheria: "Europa", Romania: "Europa", Bulgaria: "Europa", Serbia: "Europa",
  Croazia: "Europa", Austria: "Europa", Russia: "Europa", Ucraina: "Europa",
  Brasile: "America", Argentina: "America", "Stati Uniti": "America",
  Messico: "America", Colombia: "America", Cile: "America", Uruguay: "America",
  Paraguay: "America", Bolivia: "America", Ecuador: "America",
  Giappone: "Asia", "Corea del Sud": "Asia", Cina: "Asia", India: "Asia",
  Australia: "Asia",
  Egitto: "Africa", Marocco: "Africa", Tunisia: "Africa", Algeria: "Africa",
  Sudafrica: "Africa", Nigeria: "Africa", Ghana: "Africa", "Costa d'Avorio": "Africa",
};

export function parseLeagueCode(code: string): {
  country?: string;
  category?: string;
  area: string;
  label: string;
  isTop: boolean;
} {
  if (!code) return { area: "Mondo", label: "—", isTop: false };
  const c = code.trim().toUpperCase();

  // Try misc/special at start
  let country: string | undefined;
  let category: string | undefined;
  let area = "Mondo";
  const parts: string[] = [];

  // Detect amichevole / coppa / mondiale prefixes
  if (c.startsWith("AMI")) { parts.push("Amichevole"); }
  if (c.startsWith("CP") || c.startsWith("CUP")) { parts.push("Coppa"); }
  if (c.includes("MOND")) { parts.push("Mondiale"); area = "Mondo"; }
  if (c.includes("SUDAM")) { parts.push("Sudamerica"); area = "America"; }
  if (c.includes("NORDAM")) { parts.push("Nordamerica"); area = "America"; }

  // Try 3-letter country prefix
  for (const [prefix, name] of Object.entries(COUNTRY)) {
    if (c.startsWith(prefix)) {
      country = name;
      parts.push(name);
      area = AREA_BY_COUNTRY[name] || "Mondo";
      const rest = c.slice(prefix.length);
      // Try to detect category suffix
      const catMatch = rest.match(/^(U\d{2}|F|CP|CUP|RS|CH|EU|CONF)$/);
      if (catMatch) {
        category = CATEGORY[catMatch[1]] || catMatch[1];
        parts.push(category);
      } else {
        const numMatch = rest.match(/^(\d+)/);
        if (numMatch) {
          category = CATEGORY[numMatch[1]] || `Serie ${numMatch[1]}`;
          parts.push(category);
          // Check suffix after number
          const tail = rest.slice(numMatch[1].length);
          if (tail) {
            const tailLabel = CATEGORY[tail] || "";
            if (tailLabel) parts.push(tailLabel);
          }
        }
      }
      break;
    }
  }

  // Detect NAZ in code for nazionali
  if (c.includes("NAZ") && !parts.includes("Nazionali")) parts.push("Nazionali");

  const isTop = /1(?!\d)/.test(c) && !!country && (c.match(/^[A-Z]+1/) !== null);
  return {
    country,
    category,
    area,
    label: parts.join(" · ") || c,
    isTop,
  };
}
