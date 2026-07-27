# Changelog e mappa del progetto

> **Leggimi per primo.** Questo file esiste per chiunque riprenda in mano
> questo progetto — persona o assistente AI (Claude o altro) — così da capire
> rapidamente cosa è stato fatto, perché, e dove sono le trappole note, senza
> dover rileggere tutta la cronologia chat o riscoprire gli stessi errori.
>
> **Regola per chi lo aggiorna**: ogni volta che si fa una modifica non
> banale al progetto, aggiungere una voce in cima alla sezione "Log" (più
> recente in cima), con data, cosa è cambiato, perché, e il commit
> corrispondente. Non riscrivere la cronologia passata — solo aggiungere.

---

## ⚠️ Trappole note — leggere prima di correggere qualsiasi bug

Questo progetto è stato creato con emergent.sh (backend Python + MongoDB) e
poi migrato quasi interamente a Netlify Functions + Supabase. **I vecchi
file Python sono ancora nel repo come codice morto** — editarli non ha
alcun effetto sull'app reale. Due volte in una singola sessione (25 luglio
2026) un bug è stato corretto per errore nel file legacy prima di essere
trovato e corretto in quello vero:

| Componente | File VERO (usalo) | File LEGACY (morto, non toccarlo) |
|---|---|---|
| Motore Poisson/strutturale | `netlify/functions/lib/clusterEngine.ts` (chiamato da `predict.ts`) | `backend/cluster_engine.py` |
| Chiamate LLM/AI | `netlify/functions/lib/llmProviders.ts` (chiamato da `ai-predict.ts`) | `backend/server.py` |
| Tutto il resto dell'API | `netlify/functions/*.ts` | `backend/server.py` |

**Metodo generale per non ricadere nella trappola**: prima di editare un
bug "lato backend", aprire `netlify.toml` e controllare se l'endpoint
coinvolto ha un redirect verso `/.netlify/functions/*`. Se sì, il file
giusto è dentro `netlify/functions/`, non `backend/`.

Altre cose da sapere subito:
- Il **deploy è automatico**: push su `main` → GitHub Action → build hook
  Netlify → live in 1-2 minuti. Nessuna azione manuale necessaria.
- Il vecchio backend Emergent (`match-quota-analyzer.emergent.host`) non è
  più chiamato da nessuna parte dell'app (sganciamento completato il
  24/07/2026).
- Repo GitHub reale collegato a Netlify: `lavorosm1-tech/emergent-app`.

---

## Architettura in breve

- **Frontend**: Expo / React Native — `frontend/`
- **Backend**: Netlify Functions (TypeScript) — `netlify/functions/*.ts`
- **Database**: Supabase, progetto "emergent-app-db" (id `zjucgmngettxfwgxazxl`)
- **Motore pronostici**, 3 sistemi indipendenti fusi in
  `frontend/src/api.ts` → `buildFinalVerdict()`:
  - **STRUTT** — Poisson puro, `netlify/functions/lib/clusterEngine.ts`
  - **AI** — LLM esterno (DeepSeek/Groq), `netlify/functions/ai-predict.ts`
    + `lib/llmProviders.ts`
  - **PRE** — euristica sulle quote, `frontend/src/api.ts`
    (`quickPredictionFamily` / `rankPicks`)
- **Storico/apprendimento**: tabelle Supabase `market_scores` +
  `family_counters` (per famiglia+mercato+campionato), alimentate sia dai
  risultati inseriti in-app sia dal backfill storico (vedi log 25/07).
  Tabella separata `match_results_training` con le partite storiche grezze
  importate da ScoreBlast (non usata direttamente dal motore, solo come
  fonte per il backfill).

---

## Regole per chi lavora su questo repo

**Risparmio crediti di build.** Ogni deploy di produzione costa ~15 crediti e il
piano ne da' 1.000 al mese: circa 66 build. Sul vecchio account 73 deploy hanno
esaurito il ciclo. Quindi:

1. **`[skip ci]` in fondo al messaggio di commit** per tutto cio' che non deve
   andare online subito: correzioni minori, refactoring parziali, testi,
   commenti, aggiornamenti di questo CHANGELOG. Il deploy vero si fa quando una
   funzionalita' e' completa — accorpando piu' commit in una sola pubblicazione.
2. **Ignore command in `netlify.toml`**: se un commit tocca solo file `.md`,
   `docs/`, `.gitignore` o `LICENSE`, la build viene annullata da sola. E' una
   rete di sicurezza per quando ci si dimentica del punto 1, non un sostituto.

Logica dell'ignore: e' un comando di shell, **exit 0 = build annullata**,
**exit 1 = build eseguita**. `git diff --quiet` esce 0 quando non trova
differenze, quindi confrontando i due commit ed escludendo la documentazione,
"nessuna differenza vera" significa "non serve costruire". Se
`CACHED_COMMIT_REF` e' vuoto (prima build, o cache svuotata) si costruisce
sempre, per non rischiare di saltare un deploy necessario.
Verificato su un repo di prova: solo `.md` -> annulla; codice -> costruisce;
codice + `.md` insieme -> costruisce.

## Log (più recente in cima)

### 2026-07-27 — Regola di selezione semplificata: si scorre il ranking

Rossi l'ha formulata cosi', ed e' piu' semplice di quella che avevo scritto:
**si scorre il ranking strutturale dall'alto e si prende il primo dei 18
mercati ammessi che paga almeno la soglia scelta**, saltando quelli che
raccontano la partita al contrario.

Via la preferenza esplicita per le combo: se un mercato sta piu' in alto, ha
coverage migliore e quota sufficiente, e' lui — combo o no. Le combo vengono
scelte quando se lo meritano per posizione, non per una regola apposta.

Verificato eseguendo la fusione su New York RB - Crown Legacy (finita 0-3):

| Soglia | Pick | Esito |
|---|---|---|
| 1,40 | `MG 3-6 totali` @1,49 (61%) | vinto |
| 1,50 | `MG 2-4 totali` @1,55 (60%) | vinto |
| 1,60 | `GG + O2.5` @1,73 (55%) | perso |
| 1,75 | `1` @1,75 (55%) | perso |

Muovendo il selettore il pick ora cambia davvero, scendendo lungo il ranking.
`O2.5` (66%) e `GG` (64%) restano in cima ma pagano 1,30 e 1,33: sotto ogni
soglia, quindi saltati. `NG` resta escluso perche' contraddice la direzione.

**Annotato per il futuro** (osservazione di Rossi, non ancora implementata):
`MG 3-6 totali` sul book ufficiale paga tipicamente **dal 3% all'8% in piu'** di
`O2.5`. La nostra stima si puo' tarare su quel rapporto invece di partire solo
da Poisson.


### 2026-07-27 — La fusione vedeva meno mercati del motore

Segnalato da Rossi su Colo Colo - Deportes Limache (finita 3-1): a soglia 1,60
il verdetto era `NG` @2,20 al 48%, mentre nel ranking c'era gia'
`DC 1X + O2.5` @1,66 al 54% — piu' probabile, sopra soglia e coerente con la
lettura della partita (casa nettissima, λ 2,23 contro 0,89).

**Causa.** I candidati della fusione erano solo i primi N di ciascuno dei tre
sistemi. `DC 1X + O2.5` stava dodicesimo nel ranking strutturale e non entrava
mai fra i candidati: la regola "rafforza la direzione con una combo coerente"
non poteva applicarla perche' quella combo non le arrivava. Il motore la
sceglieva correttamente, la fusione no — due risposte diverse sulla stessa
partita.

**Correzione.** Tutti i 18 mercati ammessi entrano fra i candidati della
fusione, anche quelli che nessun sistema ha nominato nei suoi primi posti.

**Seconda segnalazione, stessa radice**: `DC 1X + GG` non compariva nel ranking.
Non era un errore di calcolo (45%, quota 2,09) ma il taglio ai primi 20: stava
ventunesimo. Ora il ranking mostra i primi 20 **piu'** tutti i mercati ammessi
al verdetto, ovunque si trovino.

**Verificato eseguendo davvero la fusione** su quelle quote:

| Soglia | Prima | Dopo |
|---|---|---|
| 1,40 / 1,50 | `1` @1,50 | `DC 1X + O2.5` @1,66 |
| 1,60 | `NG` @2,20 | `DC 1X + O2.5` @1,66 |
| 1,75 | — | `DC 1X + GG` @2,09 |

Sul 3-1 entrambe le combo vincono; `NG` avrebbe perso.


### 2026-07-27 — HOTFIX: schermata bianca aprendo una partita

`Uncaught ReferenceError: out is not defined` in `buildFinalVerdict`. Nel commit
precedente avevo rinominato `const out` in `const tutti` senza aggiornare le
dieci righe successive che ancora usavano `out`. La schermata di dettaglio
crashava e restava bianca.

**Perche' non l'ho intercettato**: `esbuild` compila senza lamentarsi, perche'
una variabile non definita e' JavaScript sintatticamente valido — esplode solo
a runtime. Il controllo che facevo (compila / non compila) non poteva vederlo.

**Da fare d'ora in poi su ogni modifica a `buildFinalVerdict`**: impacchettare
`api.ts` con esbuild ed ESEGUIRE davvero la funzione con dati finti a tutte e
quattro le soglie, non limitarsi a compilare. Comando che ho usato:

    npx esbuild frontend/src/api.ts --bundle --format=esm --platform=neutral \
      --outfile=/tmp/api.mjs --external:react --external:react-native \
      --external:expo* --external:@*
    node /tmp/smoke.mjs   # chiama buildFinalVerdict a 1.40 / 1.50 / 1.60 / 1.75


### 2026-07-27 — La soglia filtra la scelta, non l'analisi

Sei punti chiariti da Rossi, tutti implementati.

**1. Il ranking non cambia piu' con la soglia.** Prima i mercati sotto la quota
minima venivano scartati nella costruzione della classifica, quindi spostando
il selettore cambiavano posizioni, bonus e pick. Ma la lettura della partita non
cambia perche' l'utente vuole una quota piu' alta. Ora il ranking e' sempre lo
stesso; la soglia entra solo nella selezione finale.

**2. I mercati opposti non si sostituiscono mai.** Coppie riconosciute:
`1`↔`2`, `1`↔`X2`, `2`↔`1X`, `1X`↔`X2`, `GG`↔`NG`, `O2.5`↔`U2.5`,
`O1.5`↔`U1.5`, `O2.5`↔`NG`. Il confronto vale anche dentro le combo: con
direzione `1X`, `DC X2 + GG` e' escluso. Alzare la soglia non puo' piu'
ribaltare la lettura della partita.

**3. Un pick sotto soglia si recupera RAFFORZANDOLO, non capovolgendolo.**
Se `1X` e' il piu' probabile ma paga 1,35, si cercano `DC 1X + O1.5`,
`DC 1X + O2.5`, `DC 1X + GG`, `DC 1X + U3.5`: aggiungere una condizione alza la
quota senza cambiare direzione. Solo se nessuna combo basta si scende nel
ranking, sempre saltando cio' che contraddice la direzione.

**4. Astensione.** Se non resta nulla di coerente sopra soglia, valore nullo e
nessuna giocata. Meglio non proporre niente che proporre contro la propria
analisi.

**5.** I 18 mercati restano gli unici candidati al verdetto. Gli altri si
vedono nel ranking con COV, FRAG e punteggio, ma non entrano mai nella scelta.

**6. Card e dettaglio allineati.** La card nell'elenco partite ricalcolava un
pick per conto suo con una logica diversa da `buildFinalVerdict`: su
Sandnes - Kongsvinger diceva `DC X2 + O1.5` mentre il dettaglio diceva
`GG + O2.5`. Ora legge `pick_finale`, il verdetto salvato — stessa partita,
stesso pronostico ovunque, Schedina compresa.

Verificato su Sandnes - Kongsvinger: ranking identico a 1,40 e a 1,75, e il
pick passa da `GG + O2.5` @1,59 a `DC X2 + GG` @1,85 alzando la soglia — due
mercati coerenti fra loro, nessun ribaltamento.


### 2026-07-27 — Whitelist definitiva (18 mercati) e spareggio affidato al book

**Lista finale del verdetto**, decisa da Rossi:
`1`, `2`, `1X`, `X2`, `GG`, `NG`, `O2.5`, `MG 2-4 totali`, `MG 3-6 totali`,
`GG + O2.5`, e le combo `DC 1X/X2` con `O1.5`, `O2.5`, `U3.5`, `GG`.

Rispetto alla versione precedente rientrano `1`, `2`, `O2.5` (che erano fuori
pur essendo sempre piu' probabili delle combo `1 + O2.5` / `2 + O2.5`, ora
uscite) e i due multigol totali che il book prezza in fascia giocabile
(`2-4` intorno a 1,48-1,55 e `3-6` intorno a 1,50-1,78). Escono `O1.5` e `U3.5`
secchi. Tutti gli altri multigol — casa, ospite, combo di multigol — restano
**visibili nel ranking strutturale** ma non possono diventare la giocata.

**Spareggio: a parita' di probabilita' decide il bookmaker, non il nostro
punteggio.** Il caso che lo ha reso necessario: il modello dava `GG` e `NG`
entrambi al 50%, ma il book li prezzava 1,57 e 2,20. Con due nostre stime
uguali, la quota piu' bassa e' l'evento che il mercato ritiene piu' probabile —
e il mercato ha informazioni che noi non abbiamo (formazioni, infortuni,
notizie dell'ultima ora). Proporre il piu' caro dei due equivarrebbe a
dichiarare una value bet, che non e' quello che l'app sta facendo.

Ordine finale: **probabilita'** se il divario supera 5 punti → **quota del
book** se sono vicini → punteggio della fusione solo se anche le quote sono
pari.


### 2026-07-27 — `MG 3-6 totali` al posto di `O3.5`

Chiesto da Rossi. Stesso territorio — partita da molti gol — ma con un tetto
sopra: `O3.5` si perde solo se la partita finisce sotto i 4 gol, `MG 3-6` copre
il tratto centrale senza dipendere dalle goleade estreme.

Catalogo sempre a 54 mercati. `O3.5` esce, `MG 3-6 totali` entra. Allineati
anche l'elenco dentro `apply_scenario_result` e lo storico per scenario, che e'
stato ribackfillato per il mercato nuovo sulle 5.160 partite.

Nessun effetto sul verdetto finale: ne' `O3.5` ne' i multigol sono nella
whitelist. Cambia solo cosa vede il ranking strutturale — che e' esattamente
quello che Rossi ha chiesto ("nel ranking possono rimanere tutti, nel verdetto
non devono comparire").


### 2026-07-27 — Il verdetto finale esce solo dai mercati che Rossi gioca

Lista decisa da lui, 17 mercati:
`1X`, `X2`, `GG`, `NG`, `O1.5`, `U3.5`, `1 + O2.5`, `2 + O2.5`, `GG + O2.5`,
e le combo `DC 1X/X2` con `O1.5`, `O2.5`, `U3.5`, `GG`.

**Fuori**: tutte le combo con **DC 12** (copre due esiti su tre), i multigol
semplici e le combo di multigol, il segno secco, `U1.5` / `U2.5` / `O3.5`.
Il ranking strutturale continua a mostrarli tutti — serve a capire cosa pensa
il motore — ma la giocata consigliata esce solo dalla lista.

Rivista di conseguenza l'esclusione decisa ieri (punto A): non piu' tutte le
combo "miste", ma solo quelle costruite sul `DC 12`. Le combo con `1X` / `X2`
rientrano, perche' Rossi le gioca.

**Costo misurato** (583 partite, pick = mercato piu' probabile fra quelli
ammessi):

| Soglia | Tutto il catalogo | Solo la lista | Quota media |
|---|---|---|---|
| 1,40 | 56,6% | 54,0% | 1,45 → 1,56 |
| 1,50 | 63,0% | **55,2%** | 1,54 → 1,68 |
| 1,60 | 55,9% | 51,5% | 1,64 → 1,79 |
| 1,75 | 55,4% | 47,9% | 1,81 → 1,94 |

La precisione **scende** — a 1,50 di quasi 8 punti — e la quota media sale.
Erano i multigol a reggere la precisione: gia' misurato il 26/07, toglierli
costa circa 8 punti. Il confronto pero' e' teorico: un pick che l'utente non
giocherebbe vale zero, non il 63%.

**Da valutare**: `O2.5` secco e il segno secco `1` / `2` sono fuori dalla lista
ma hanno probabilita' sempre **maggiore** delle rispettive combo `1 + O2.5` /
`2 + O2.5`, che invece sono dentro. Su Hjk - Tps il pick vincente era proprio
`1` al 69%. Riammetterli costerebbe nulla e alzerebbe la precisione.


### 2026-07-27 — Il verdetto oscillava al variare della soglia

Segnalato da Rossi su Nacional Potosi - Real Tomayapo (finita 4-1): a soglia
1,40 il pick era `NG`, a 1,50 diventava `GG`, a 1,60 tornava `NG`. Non ha senso:
alzando la soglia si tolgono mercati, non se ne aggiungono, quindi il pick non
dovrebbe andare avanti e indietro.

**Causa.** Il punteggio della fusione assegna bonus in base alla POSIZIONE che
un mercato occupa nelle tre classifiche. Alzando la soglia si rimuovono i
mercati piu' economici e tutti gli altri **salgono di posizione**: il punteggio
cambia anche se la loro probabilita' e' rimasta identica. `NG` passava da
STRUTT #6 a STRUTT #3 senza che nulla fosse cambiato in quella partita.

**Il problema piu' grave sotto.** A soglia 1,40 la fusione sceglieva `NG` al
**50%** scavalcando `MG 1-3 casa + MG 0-2 ospite` al **64%**, solo perche' NG
aveva due sistemi concordi. E' il contrario dell'obiettivo dichiarato
("massima probabilita' sopra la soglia"), ed e' la stessa incoerenza gia'
corretta nel motore con il punto C: era rimasta nella fusione.

**Correzione.** Il verdetto si ordina ora per probabilita' vera. Il punteggio
della fusione — bonus di concordanza compreso — decide solo fra mercati entro
**5 punti** di probabilita': li' e' un vero spareggio, non un ribaltamento.

Su quella partita: a 1,50 il pick era `GG`, che ha **vinto** sul 4-1; a 1,40 e
1,60 era `NG`, che ha perso. L'avviso della soglia consigliata diceva "non
conviene superare 1,50", e aveva ragione.

**Da verificare sul campo**: la fusione vive nel frontend e non e' rigiocabile
sulle 583 partite di test come il motore.


### 2026-07-26 — Avviso sulla soglia massima consigliata, partita per partita

Chiesto da Rossi. Il "muro" oltre il quale alzare la soglia compra solo rischio
**non e' uguale per tutte le partite**: dove c'e' una favorita netta si trovano
mercati al 65% anche a 1,60, in una equilibrata gia' a 1,50 il meglio
disponibile scende sotto la monetina.

`predict.ts` calcola ora il pick a tutte e quattro le soglie e restituisce
`soglia_consigliata` + `soglie_dettaglio`. Il frontend mostra un avviso giallo
quando la soglia scelta la supera, dicendo cosa uscirebbe e con che
probabilita', e marca con ⚠ le soglie oltre il consiglio. **Non blocca niente**:
la scelta resta dell'utente.

**Regola**: la soglia piu' alta a cui il pick ha ancora probabilita' >= 58%.
Il 58% e' misurato, non scelto a occhio — su 583 partite di test:

| Soglia della regola | Dentro il consiglio | Oltre il consiglio |
|---|---|---|
| 55% | 59,1% | 54,6% |
| **58%** | **59,7%** | **55,7%** |
| 60% | 58,8% | 57,2% |

Il 58% da' la separazione migliore con una distribuzione sensata dei consigli
(1,50 nella maggior parte dei casi, 1,60 dove la partita lo permette).

**Nota che merita attenzione**: nella stessa analisi i pick con probabilita'
dichiarata **>= 65% riescono solo il 54,4% delle volte**, peggio della fascia
60-65% (60,1%) e 55-60% (59,4%). C'e' overconfidence in cima alla scala, su 217
casi. Vale la pena capire da dove viene — sospetto i multigol con range molto
larghi, dove l'indipendenza fra gol casa e gol ospite assunta da Poisson regge
meno.


### 2026-07-26 — A+C: via le combo miste, ranking ordinato per probabilita'

Decise da Rossi dopo aver visto i numeri.

**A — Combo "miste" escluse.** Sono quelle che uniscono un segno / doppia
chance / GG a un Over-Under (`DC 12 + O2.5`, `1 + O2.5`, `GG + O2.5`...). Non
hanno un prezzo nel file Sisal e Rossi non le gioca. Le combo di soli multigol
restano: quelle le aveva chieste lui.
Costo misurato: **zero**. A nessuna soglia la precisione cambia di un decimo,
perche' non vincevano quasi mai il primo posto.

**C — Il ranking non e' piu' ordinato per punteggio ma per probabilita' vera.**
Il punteggio mescolava coverage, fragilita', bonus strutturali e correttivo
storico, e finiva per mettere primo un mercato meno probabile di quello sotto.
Su Hjk - Tps era primo `MG 2-4 casa` al 59% con quota stimata, mentre `1` stava
secondo al **69% con quota reale 1,48** — ed e' finita 1-0.
Il punteggio resta calcolato e resta nel campo `score`: cambia solo il criterio
di ordinamento, quindi tornare indietro e' una riga.

**Effetto misurato** (583 partite di test):

| Soglia | Prima | Dopo |
|---|---|---|
| 1,40 | 62,3% | **57,3%** |
| 1,50 | 61,6% | **63,3%** |
| 1,60 | 54,0% | **55,9%** |
| 1,75 | 49,7% | **55,1%** |

Migliora dove Rossi gioca davvero e peggiora di 5 punti a 1,40. Il nuovo punto
migliore della curva e' **1,50 → 63,3% a quota media 1,54**: la soglia 1,40 e'
ora da evitare.

### 2026-07-26 — Le quote delle combo erano il PRODOTTO delle due quote

Seconda parte dello stesso problema di stamattina, in un punto diverso del
codice. `comboOdd()` per i mercati con `+` moltiplicava le due quote reali:
`DC 12 + O2.5` diventava 1,18 x 1,48 = **1,746**, e veniva mostrato con la `@`
come se fosse un prezzo letto dal file Sisal — dove quella combo non esiste.

Moltiplicare vale solo per eventi **indipendenti**. "Non finisce in pareggio" e
"almeno 3 gol" non lo sono: crescono insieme. Il prodotto sovrastima la quota.
La stima di Poisson tiene conto della correlazione perche' conta i risultati
esatti in cui entrambi gli eventi si verificano: sulla stessa partita da
**1,66** invece di 1,746.

Corretto anche il flag: `odd_estimated` era true solo quando `comboOdd`
restituiva null, quindi le combo passavano per prezzi reali. Ora una quota e'
marcata reale **solo** se il bookmaker la fornisce per quel mercato esatto —
14 mercati su 54.

**Misurato prima di decidere** (583 partite di test, tre cataloghi a confronto):

| Soglia | Tutti i 54 | Senza le combo `+` | Solo quote reali (14) |
|---|---|---|---|
| 1,40 | 62,3% | **62,1%** | 53,9% |
| 1,50 | 61,6% | **61,4%** | 54,0% |
| 1,60 | 54,4% | **53,5%** | 49,1% |

Togliere le combo costa **quasi nulla**. Togliere anche i multigol costa
**8 punti**: sono loro a reggere la precisione, non le combo.

### 2026-07-26 — Correggere un risultato non avvelena piu' lo storico

Emerso da Rossi: su Mariehamn - Ac Oulu aveva salvato `1-0`, ma la partita era
finita `1-1`.

**Il problema.** `applyMatchResult` non aveva nessun controllo su un risultato
gia' presente. Conseguenze:
- **risalvare la stessa partita** contava tutto una seconda volta;
- **correggere** un risultato sbagliato lasciava i conteggi vecchi al loro
  posto e ci sommava sopra quelli nuovi.

Con l'apprendimento per scenario attivo (Fase 3) non e' un dettaglio: quei
numeri finiscono nei pronostici di tutte le partite con quote simili. Nel caso
concreto la differenza e' grossa — il pick era `MG 2-4 totali`, che su un 1-0
risulta PERSO e su un 1-1 risulta VINTO.

**Correzione.**
- Stesso risultato risalvato -> non si conta niente (idempotente).
- Risultato diverso -> si **annullano** prima i conteggi del vecchio, poi si
  applicano quelli del nuovo.
- `apply_scenario_result` e `increment_system_score` hanno ora un parametro di
  segno (`p_sign`: +1 applica, -1 annulla), con `greatest(0, ...)` per non
  andare mai sotto zero.

**Resta scoperto**: `market_scores` e `family_counters` (il ramo che si
aggiorna solo quando esiste un pronostico AI) non hanno ancora l'annullamento.
Alimentano il prompt dell'IA, non il motore, quindi l'impatto e' minore — ma va
fatto.

### 2026-07-26 — La lista del pre-pronostico non mostra piu' i mercati dell'IA

La didascalia diceva "questa lista NON tiene conto del pronostico AI", ma in
cima compariva ancora `MG 1-4 totali` marcato `AI_ONLY`: `rankPicks` unisce i
mercati dell'IA alla lista. Dal voto erano gia' stati esclusi; ora spariscono
anche dalla vista, cosi' la sezione mostra il parere del pre-pronostico e
basta. I mercati dell'IA hanno gia' la loro sezione piu' sotto.

### 2026-07-26 — Pick senza quota e falsa concordanza: tre buchi chiusi

Segnalato da Rossi: su Vasco Da Gama - Mirassol la giocata consigliata era
diventata `MG 1-4 totali`, **senza nessuna quota accanto**, con "CONCORDANZA
FORTE 2/3 — AI #1, PRE #1". Tre difetti distinti, tutti veri.

**1. Un mercato proposto solo dall'IA veniva contato anche come voto del
pre-pronostico.** `rankPicks` unisce i mercati dell'IA alla lista PRE
(`source: "ai"`), e la fusione contava tutta la lista come voto "pre". Cosi'
`MG 1-4 totali`, proposto da UN sistema solo, risultava "2 su 3". E' lo stesso
doppio conteggio corretto poco prima con il bonus `pre+ai`: era rimasta l'altra
meta'. Ora gli elementi `source === "ai"` non danno il voto "pre".

**2. Un pick senza prezzo passava il filtro.** Il controllo era
`if (b.odd === undefined || b.odd === null) return true` — lasciava passare
proprio i mercati di cui non si conosceva la quota. `MG 1-4 totali` ha quota
stimata **1,17**, sotto qualsiasi soglia: sarebbe dovuto sparire, invece e'
arrivato in cima proprio perche' non aveva prezzo. Ora un pick senza quota
determinabile viene scartato: se non si sa quanto paga, non e' giocabile.

**3. La quota di riserva si cercava solo nel top 20.** I mercati che il motore
scarta restavano senza prezzo. `predict.ts` ora restituisce `market_odds` con
la quota di **tutti** i 54 mercati, reale o stimata.

**In piu'**: nella tabella mandata all'IA i mercati sotto la soglia dell'utente
ora vengono **tolti**, non marcati. Marcarli non era bastato — l'IA ha scelto
`MG 1-4 totali` ignorando l'avviso `⛔ SOTTO LA SOGLIA`. Se un mercato non e'
selezionabile, il modo sicuro per non farlo scegliere e' non mostrarglielo.

*Lezione*: le istruzioni al modello sono un suggerimento, non una garanzia.
Quando un vincolo deve valere sempre, va imposto dal codice.

### 2026-07-26 — Il pre-pronostico smette di fare eco all'IA

Trovato rispondendo a una domanda di Rossi: perche' su Vasco Da Gama - Mirassol
il pick del pre-pronostico era `X2` prima di premere "Pronostico AI" e
diventava `GG` dopo, senza che fosse cambiata nessuna quota?

**Causa.** In `rankPicks` c'era `if (p.source === "pre+ai") score += 0.30`: i
mercati nominati dall'IA salivano nella classifica del pre-pronostico. Quindi
il pre-pronostico veniva **riordinato dall'IA**, e la fusione lo contava
comunque come TERZO parere indipendente. Una "CONCORDANZA 2/3 = AI + PRE" era
spesso lo stesso parere contato due volte.

E' lo stesso errore evitato in mattinata sui multigol: due sistemi che si
copiano non sono due conferme.

**Correzione.** Tolto il bonus. L'etichetta `pre+ai` resta come informazione a
schermo, ma non influenza piu' l'ordinamento: il pre-pronostico si regge ora
solo sulle quote reali del bookmaker e sul win-rate storico — l'unica cosa che
sa davvero, e l'unica che il motore Poisson non guarda.

**Cosa aspettarsi**: la lista del pre-pronostico non cambia piu' dopo il click
sul Pronostico AI, e alcune concordanze scenderanno da "2 su 3" a "1 su 3".
E' corretto: erano gonfiate.

**Non misurabile offline**: la fusione vive nel frontend e non e' rigiocabile
sulle partite storiche come il motore. Va verificata sul campo.

**Nota sull'X2 di quella partita**: non era favorito. Con lambda 1,56 / 1,01 la
probabilita' vera di X2 e' 49,9% (vittoria casa 50,1%), quindi la quota equa
sarebbe 2,00 mentre il book dava 1,67. Il motore lo teneva fuori dai primi
venti a ragione: sopra c'era una dozzina di multigol fra il 55% e il 67%.

### 2026-07-26 — Tabella per l'IA: ordinata per probabilita' e con la soglia segnalata

Due rifiniture emerse dalla prima prova sul campo (Vasco Da Gama - Mirassol).

**1. La lista era in ordine di catalogo**, quindi i multigol finivano sepolti a
meta' elenco e l'IA continuava a proporre i soliti Over/GG anche quando avevano
numeri peggiori. Su quella partita `MG 1-3 totali` aveva la probabilita' piu'
alta fra i mercati selezionabili (67%) e l'IA non l'ha nemmeno nominato. Ora la
tabella e' ordinata per probabilita' decrescente.

**2. L'IA sprecava la prima scelta su mercati non selezionabili.** Il suo
pronostico principale era `O1.5`, che a quota 1,33 sta sotto la soglia minima
dell'utente e viene scartato a valle: infatti sullo schermo e' arrivato GG, non
O1.5. Ora ogni voce sotto soglia e' marcata `⛔ SOTTO LA SOGLIA, NON
SELEZIONABILE` e la regola glielo vieta esplicitamente.

**Conferma che il lavoro precedente funziona**: nelle sue motivazioni l'IA ha
citato "Probabilita' 73%" per O1.5 e "50%" per GG — che sono esattamente i
valori calcolati dal motore e passati nella tabella, non stime sue. Prima li
inventava.

### 2026-07-26 — BUG GRAVE: le quote delle combo erano sbagliate

Segnalato da Rossi guardando New York RB - Charlotte. Nella lista del
pre-pronostico comparivano `GG + O2.5 @ 1.40`, `DC 1X + O2.5 @ 1.40`,
`1 + O2.5 @ 2.20` — e la stessa quota sbagliata finiva sulla GIOCATA
CONSIGLIATA.

**Causa.** `realOddFor()` ricavava la quota di una combo prendendo il
**massimo fra i componenti**. E' sbagliato di netto: il massimo fra due quote
e' la quota dell'evento piu' probabile dei due, mentre una combo richiede che
si verifichino ENTRAMBI — la sua quota e' sempre piu' alta di tutti i
componenti, mai uguale al maggiore. Valori reali su quella partita:

| Mercato | Mostrato | Corretto |
|---|---|---|
| GG + O2.5 | 1,40 | **1,90** |
| DC 1X + O2.5 | 1,40 | **1,96** |
| DC 12 + O2.5 | 1,40 | **1,82** |
| 1 + O2.5 | 2,20 | **3,08** |
| DC 1X + GG | 1,40 | **1,90** |

**Da dove veniva.** Dall'euristica originale nel frontend
(`quickPredictionFamily`), dove `Math.max(o1X, oO15)` serviva solo a ordinare
una lista e nessuno guardava il numero. Portandola lato server e collegandola
alla fusione, quel numero ha iniziato a fare tre cose per cui non era adatto:
comparire come quota della giocata consigliata, passare il filtro di quota
minima, e ordinare i voti del pre-pronostico. Un errore innocuo e' diventato
dannoso cambiando contesto.

**Correzione.** `realOddFor()` ora restituisce solo la quota LETTA dal file
del bookmaker, per i singoli. Sulle combo l'euristica si astiene — che e'
anche cio' che le lascia la sua indipendenza dal motore. Per le combo la quota
corretta la calcola gia' `estimateMarketOdd` sulla distribuzione di Poisson,
che tiene conto della correlazione fra i due eventi.

L'euristica passa da ~26 mercati valutati a **14** (i soli con prezzo vero),
di cui ne promuove una decina. Meno mercati, ma nessun numero inventato.

**Nota su cosa NON era rotto**: le quote stimate dei multigol sono corrette e
verificate sulle 5.160 partite storiche entro 1-2 punti (MG 2-4 totali 60,8%
stimato contro 59,9% reale). Le due cose viaggiavano su strade diverse: la
stima del motore era giusta, il massimo-fra-componenti del pre-pronostico no.

### 2026-07-26 — L'IA vede tutti i 54 mercati con i numeri gia' calcolati

Ultimo pezzo del lavoro sulla fusione. Prima l'IA proponeva 3-5 mercati
scegliendoli a memoria, quindi i multigol non li nominava quasi mai: nella
fusione risultavano "poco condivisi" non perche' fossero deboli, ma perche'
nessuno li aveva mai messi sul tavolo.

Ora nel prompt entra il **catalogo completo**: tutti e 54 i mercati con
probabilita' calcolata dal motore sulla distribuzione completa, quota (reale, o
stimata e marcata con `~`) e percentuale storica dello scenario. Circa 500
token in piu' per chiamata, trascurabili.

Il compito dell'IA cambia di natura: non stima piu' probabilita' — cosa che un
modello linguistico non sa fare in modo affidabile — ma **giudica** numeri gia'
calcolati, che e' esattamente cio' in cui e' bravo. E deve scegliere copiando i
nomi dalla lista, quindi non puo' piu' inventare mercati fuori catalogo.

Modificata anche la regola 4 del PIN strutturale: prima diceva di proporre solo
mercati coerenti col PIN, il che avrebbe escluso a priori meta' del catalogo
appena aggiunto. Ora il PIN serve a giudicare la coerenza, mentre l'elenco di
cosa e' proponibile e' il catalogo.

**Da verificare sul campo**: come risponde il modello a una lista di 54 voci non
e' verificabile offline. Il parsing della risposta resta invariato
(`playable_markets` + `main_prediction`), quindi se il modello ignorasse le
nuove istruzioni il comportamento tornerebbe semplicemente quello di prima,
senza rotture.

### 2026-07-26 — Concordanza consapevole delle astensioni; euristica PRE lato server

**Il problema.** Il bonus di concordanza contava quanti sistemi avevano scelto
un mercato, senza chiedersi se gli altri POTESSERO sceglierlo. L'euristica PRE
ragiona sulle quote reali del bookmaker, e per i **16 multigol semplici** un
prezzo non esiste nel file Sisal: quei mercati risultavano "poco condivisi" non
perché l'euristica li bocciasse, ma perché non aveva modo di esprimersi.
Penalità sistematica contro i multigol — ed è il motivo per cui in
Atletico Pr–Internacional il verdetto ha scelto NG (coverage 53%) invece di
MG 1-2 casa, che nel ranking strutturale era primo con 59%.

**Cosa è cambiato**
- `preHeuristicRanking()` valuta l'intero catalogo invece di una lista fissa di
  ~18 candidati: ogni mercato, combo comprese, per cui **tutti** i componenti
  hanno una quota vera. In pratica da ~18 a ~26 mercati.
- `preEligibleMarkets()` distingue "l'euristica lo boccia" da "l'euristica non
  può dire niente".
- `predict.ts` restituisce `pre_ranking` e `pre_eligible`. Il frontend usa
  quelli invece di ricalcolare l'euristica nel browser: **una sola
  implementazione** al posto di due copie da tenere allineate a mano (il rischio
  segnalato in Fase 0 sparisce).
- La concordanza si misura solo fra i sistemi che potevano votare. Unanimità
  fra tre vale +8, unanimità fra due (perché il terzo si è astenuto) vale +4,
  due su tre resta +2,5.

**Perché l'euristica NON è stata estesa anche ai multigol.** Sarebbe stato
facile: basta usare la quota che stimiamo noi. Ma quella stima deriva dalla
distribuzione di Poisson, cioè dalla stessa probabilità con cui ragiona il
motore strutturale: ordinare i multigol con quella significa fabbricare un
secondo voto identico al primo. La concordanza "2 su 3" diventerebbe automatica
e priva di significato — e visto che è il bonus di concordanza a decidere il
pick, avremmo peggiorato la fusione credendo di renderla più equa.
L'indipendenza dell'euristica PRE viene esattamente dal fatto che guarda solo
prezzi veri. Su quello che non ha prezzo, si astiene.

**Non ancora fatto**: mandare all'IA tutti i 54 mercati con la probabilità già
calcolata, chiedendole *approvo / neutro / respingo* su ciascuno invece di farle
proporre 3-5 mercati liberamente. Va provato con una chiamata vera al modello,
quindi aspetta lo sblocco dei deploy.

### 2026-07-26 — Calendario ancora bloccato: seconda causa

La correzione precedente (funzione SQL `matches_distinct_days`) era giusta ma
non bastava: **PostgREST tiene una cache dello schema**, e finché non la
ricarica una funzione appena creata con una migration risponde 404. Le RPC
nuove (`matches_distinct_days`, `increment_system_score`,
`apply_scenario_result`) erano quindi invisibili al codice.

Prova del fatto: `system_scorecard` era rimasta **vuota** anche dopo che erano
stati salvati dei risultati su partite che avevano i tre pick registrati — le
chiamate RPC fallivano e venivano assorbite dai `try/catch` best-effort, in
silenzio. Stessa sorte per l'aggiornamento incrementale dello storico.

Fatto: `notify pgrst, 'reload schema'`.

E soprattutto: `matches-days` non dipende più da una strada sola. Se la RPC non
risponde, ricade su due letture con `limit` ESPLICITO (una dal giorno più
vecchio, una dal più recente) e le unisce, così i giorni in coda — le partite
future, quelle che servono — arrivano comunque.

*Lezione da ricordare*: dopo una migration che crea funzioni, va ricaricata la
cache di PostgREST, altrimenti le RPC nuove falliscono in silenzio. E un
`try/catch` best-effort nasconde proprio questo tipo di guasto: se una scrittura
è "opzionale", il suo mancato funzionamento non si vede finché non si va a
controllare la tabella.

### 2026-07-25 (notte) — Calendario bloccato, bug combo, combo multigol simmetriche

**1. BUG GRAVE: il calendario si fermava al 25 luglio.** Caricando un Excel
nuovo le partite entravano nel database ma i giorni successivi non comparivano
fra quelli selezionabili.

Causa: `matches-days` scaricava TUTTE le righe di `matches` (`select=day`) per
poi ricavarne i giorni distinti in JavaScript. **PostgREST tronca la risposta a
1000 righe.** Con 1.739 partite ordinate per giorno crescente, la millesima
cadeva esattamente sul 2026-07-25 — quindi i 29 giorni successivi non
arrivavano mai al frontend. Nessun messaggio di errore: la lista arrivava,
semplicemente incompleta.

Correzione: nuova funzione SQL `matches_distinct_days()`, il calcolo lo fa il
database e tornano 61 righe invece di 1.739. Il tetto non è più raggiungibile
nemmeno con anni di partite.

*Classe di bug da ricordare*: qualsiasi `pgGet` senza `limit` esplicito su una
tabella che può superare le 1000 righe è a rischio, e fallisce **in silenzio**.
L'unico altro punto simile (`results-fetch`) filtra per lista di id, quindi è
al sicuro.

**2. BUG: le combo con multigol venivano valutate male.**
`evaluateMarketStrict` controllava i multigol PRIMA di spezzare le combo sul
`+`. Risultato: `MG 1-2 casa + MG 0-2 ospite` su un **2-4** rispondeva
"vinto" — prendeva il primo range (1-2), vedeva la parola CASA e ignorava
tutto quello che seguiva il `+`. Lo split sul `+` è stato spostato in cima,
prima di ogni altro controllo. `marketEval.ts` era invece già corretto.

Corretto PRIMA di aggiungere le combo nuove: lasciandolo, lo storico per
scenario avrebbe imparato risultati falsi su tutta la famiglia — cioè avrebbe
disfatto la Fase 3 invece di sfruttarla.

**3. Catalogo da 49 a 54 mercati: le combo multigol casa + ospite.**
Aggiunte **simmetriche**, come richiesto: per ogni combinazione esiste il suo
specchio, così una partita dominata dall'ospite è coperta come una dominata
dalla casa.

| Combo | Vince | Quota stimata |
|---|---|---|
| MG 1-3 casa + MG 0-2 ospite | 59,9% | 1,53 |
| MG 1-2 casa + MG 0-3 ospite | 55,2% | 1,66 |
| MG 0-2 casa + MG 1-3 ospite | 53,9% | 1,70 |
| MG 0-3 casa + MG 1-2 ospite | 53,0% | 1,73 |
| MG 1-2 casa + MG 0-2 ospite | 50,0% | 1,83 |

Scartate le altre 7 combinazioni proposte: `0-3 + 0-3` vale 1,03 e `0-3 + 0-2`
vale 1,14 (non superano mai nessuna soglia, sarebbero peso morto), mentre
`1-3+1-2`, `2-4+0-3`, `2-4+0-2`, `1-2+1-2`, `2-4+1-2` stanno tutte sotto il 40%
di riuscita.

`scenario_market_scores` ribackfillata per i 5 mercati nuovi (864 righe, 54
mercati) e `apply_scenario_result` aggiornata perché l'apprendimento
incrementale li includa.

**Effetto sul test set** (583 partite): 1,60 da 54,0% a 54,4% senza storico e
da 57,1% a 57,5% con storico; 1,75 da 49,7% a 50,1%. Miglioramenti piccoli,
dovuti quasi tutti alla correzione del bug 2.

### 2026-07-25 (sera) — FASE 3: lo storico entra davvero nel motore

**Il problema.** Il "ML boost" esistente spostava lo score di ±10% solo per i
mercati con win-rate storico ≥70% o ≤30%, su base FAMIGLIA. Misurato: il 71%
delle righe storiche stava nel mezzo e non produceva alcun effetto, e ±10% non
poteva comunque nulla contro euristiche che moltiplicano per 1,35 o 0,45. In
pratica 5.160 partite non avevano voce in capitolo.

**Cosa c'è ora.**
- Nuova tabella `scenario_market_scores` (scenario × mercato), popolata dalle
  5.160 partite storiche: 784 righe, 252.840 osservazioni. Lo scenario è
  forza della favorita × gol attesi (16 combinazioni), non più le 8 famiglie,
  che mescolavano partite troppo diverse.
- Nuova funzione SQL `eval_market_sql` (riproduce `evaluateMarketStrict`) usata
  per il backfill, e `apply_scenario_result` che aggiorna tutti i 49 mercati in
  **un solo round-trip** — con 49 chiamate separate il salvataggio multiplo
  dalla Schedina avrebbe fatto scadere la function.
- `predict.ts` passa al motore lo storico dello scenario invece di quello della
  famiglia; `applyResult.ts` aggiorna la tabella a ogni risultato inserito, per
  **tutti** i mercati e non solo per quelli proposti dall'IA (che darebbe una
  statistica distorta dalle scelte del sistema).
- Il correttivo nel motore non è più una soglia secca ma una media pesata:
  `k = n/(n+80)`, `mista = coverage×(1−k) + storico×k`, `score ×= mista/coverage`.
  Con poche partite conta il modello, con centinaia conta lo storico. Nessun
  mercato resta scoperto.

**Verifica su test set vero.** Le statistiche storiche sono state ricalcolate
**escludendo** le 583 partite di prova (4.602 partite di training), altrimenti
il correttivo si sarebbe misurato su sé stesso. Trascrizione verificata con
checksum esatto contro il database.

| Soglia | Senza storico | Con storico | Quota media |
|---|---|---|---|
| 1,40 | 62,3% | **63,6%** | 1,56 → 1,58 |
| 1,50 | 61,6% | **65,0%** | 1,62 → 1,64 |
| 1,60 | 54,0% | **57,1%** | 1,86 → 1,90 |
| 1,75 | 49,7% | 49,7% | 2,08 → **2,25** |

Migliora a tre soglie su quattro, e alla quarta lascia la precisione invariata
alzando la quota. Il risultato **non dipende dalla taratura**: con la costante
di shrink a 30, 80 o 200 il miglioramento resta, quindi non è un artefatto.

Provata e **scartata** una variante additiva (bonus proporzionale a
`storico − modello`): crolla a 46-52%, perché premia i mercati su cui storico e
modello sono in disaccordo, che sono soprattutto quelli a bassa probabilità.

**Non fatto in questa fase**: i pesi della fusione fra i tre sistemi
(10 / 5 / 8 + concordanza) restano quelli scritti a mano. `system_scorecard` è
stata creata in Fase 0 ma è ancora vuota: si riempie con le partite vere da qui
in avanti, e solo allora quei pesi potranno essere misurati invece che scelti.

### 2026-07-25 (sera) — FASE 2: soglia di quota scelta dall'utente

**Cosa cambia.** La quota minima non è più il `1.4` fisso passato a
`structuralAnalysis`. Nuovo endpoint `odd-settings` (GET/POST, chiave
`min_odd` nella tabella `settings` già esistente), `predict.ts` la legge (o
accetta `?minOdd=` in query per confronti rapidi) e la restituisce nella
risposta; il frontend la passa anche a `buildFinalVerdict` e mostra un
selettore 1,40 / 1,50 / 1,60 / 1,75 sopra la giocata consigliata.

Curva misurata sul motore vero, 583 partite storiche:
| Soglia | Precisione | Quota media |
|---|---|---|
| 1,40 | 62,3% | 1,56 |
| 1,50 | 61,6% | 1,62 |
| 1,60 | 54,0% | 1,86 |
| 1,75 | 49,7% | 2,08 |

Il gradino vero è fra 1,50 e 1,60: −7,6 punti di precisione per +24 centesimi
di quota. Nessuna partita resta senza pick a nessuna soglia.

**Cosa NON è stato cambiato, e perché.** La scaletta prevedeva anche di
sostituire il criterio di scelta con "massima probabilità sopra la soglia".
Provato e misurato prima di scriverlo:

| Soglia | Punteggio attuale | Massima probabilità pura |
|---|---|---|
| 1,40 | **62,3%** | 57,1% |
| 1,50 | **61,6%** | 60,5% |
| 1,60 | 54,0% | **55,2%** (quota media 1,67 contro 1,86) |
| 1,75 | 49,7% | **53,2%** (quota media 1,84 contro 2,08) |

Non c'è un vincitore: alle soglie basse perde nettamente, a quelle alte vince
di poco (1-3 punti, dentro il rumore su 583 partite) ma **abbassando la quota
media** — cioè dando all'utente meno di quello che ha chiesto alzando la
soglia. Criterio lasciato invariato. Da riesaminare in Fase 3 con i pesi
misurati invece che scelti a mano.

Nota metodologica emersa dal test: ordinare per `coverage` o per
`coverage − 0.5×fragility` dà **risultati identici**, perché per i mercati
sempre decidibili `fragility = 1 − coverage`, quindi il secondo criterio è
monotono nel primo. Non è un vero tie-break: non serve reintrodurlo.

### 2026-07-25 (sera) — Stima della quota per i mercati senza prezzo (multigol)

**Il problema.** Il file Sisal non contiene i multigol, quindi `comboOdd()`
restituiva `null` per tutti. Il filtro "quota minima" nel motore era scritto
come `if (co !== null && co < minOdd) continue`, quindi **un mercato senza
prezzo non veniva mai scartato**: i multigol restavano in gara per forfait ed
erano il 70% dei pick prima della Fase 1, il 90% dopo.

**La soluzione.** L'estimatore esisteva già (`estimateComboOddFromCluster`) ma
era raggiungibile solo per i mercati con un `+` nel nome. Rinominato in
`estimateMarketOdd` e reso raggiungibile per qualsiasi mercato senza prezzo.
Usa la probabilità di Poisson e applica il margine reale **di quella partita**
(somma delle implicite di 1/X/2, tipicamente 1,09 — misurato sulle 5.160
storiche: 8,8% su U/O 2.5, 8,9% su GG/NG, 9,5% su 1X2).

**Trappola evitata, da non reintrodurre**: la quota stimata NON entra nel
calcolo dell'Expected Value. Sarebbe circolare — la quota deriva dalla stessa
probabilità con cui si calcolerebbe l'EV, quindi ogni mercato stimato avrebbe
EV costante pari a circa −9%, facendo scattare su tutti il malus
`ev <= -0.05 → score *= 0.65`. L'EV resta calcolato solo su quote reali.

**Effetto misurato** (583 partite, soglia di default 1.40):
| | Precisione | Quota media | Pick con un prezzo |
|---|---|---|---|
| Solo Fase 1 | 68,8% | — | 10% |
| Con stima quota | **62,3%** | 1,56 | **100%** |

La precisione **scende**, ed è corretto così: il 68,8% veniva da mercati come
`MG 1-4 totali` (85% di riuscita ma quota reale intorno a 1,25), che ora il
filtro scarta. Per confronto, la stessa simulazione fatta con i soli 10
mercati base dava 58,4% a soglia 1,40 — quindi i multigol prezzati
correttamente aggiungono davvero valore.

Curva soglia → precisione, misurata sul motore vero:
| Soglia | Precisione | Quota media |
|---|---|---|
| 1,40 | 62,3% | 1,56 |
| 1,50 | 61,6% | 1,62 |
| 1,60 | 54,0% | 1,86 |
| 1,75 | 49,7% | 2,08 |

Nessuna partita resta senza pick a nessuna soglia. Questa curva è la base della
Fase 2 (soglia scelta dall'utente).

**Lato interfaccia**: le quote stimate sono marcate `odd_estimated` e mostrate
con `≈` e la dicitura "(stimata)", per non farle confondere con un prezzo
reale del bookmaker.

### 2026-07-25 (sera) — FASE 1: probabilità vere al posto del cluster tagliato

**Cosa cambia.** `coverage` e `fragility` non si calcolano più sugli 8
risultati del cluster centrale ma sulla distribuzione completa
(`fullDistribution`, 49 celle). Il cluster centrale resta esattamente com'era
per la parte mostrata a schermo, comprese le liste "coperto da" / "rotto da"
(sulla distribuzione completa sarebbero elenchi di 40+ punteggi, illeggibili).

**Perché.** Gli 8 risultati coprivano in media il 60-75% della probabilità
totale, e il pezzo tagliato non era neutro: i risultati con uno zero sono
pochi e concentrati e finivano quasi tutti dentro il taglio, quelli da GG/Over
sono tanti e piccoli e restavano fuori. Misurato sulle 5.160 partite storiche:
NG dato al 55,6% contro un 46,2% reale, O2.5 dato al 34,8% contro un 51,2%
reale. Sulla distribuzione completa lo stesso modello dà 49,5% e 51,0%.

**Effetto misurato** (rigioco su 583 partite reali, campione stratificato):
| | Precisione del pick #1 | 
|---|---|
| Prima | 63,5% (370/583) |
| Dopo | **68,8% (401/583)** |

Il pick cambia sul **72%** delle partite. Mix dei mercati scelti:
`Under 17% → 0%`, `NG 4% → 2%`, `Over 0% → 8%`, `MG 70% → 90%`.

**Da tenere d'occhio (due effetti collaterali noti, non risolti qui)**
1. `MG 70% → 90%`: senza quota nota i multigol non sono filtrabili e vincono
   per forfait. È il motivo per cui la stima teorica della quota MG è il
   prossimo passo, prima della Fase 2.
2. In `buildFinalVerdict` la soglia `robust` (`coverage >= 0.60 &&
   fragility <= 0.35`) prima scattava nell'**87%** delle partite — cioè era di
   fatto sempre vera e non distingueva niente. Con i numeri onesti scatta nel
   **51%**. Le soglie sono state lasciate come sono perché ora dicono la
   verità; la ricalibratura dei pesi della fusione è materia della Fase 3, dove
   verranno misurati invece che scelti a mano. Stesso discorso per
   `COVERAGE_WEIGHT = 30`: il contributo medio passa da 7,80 a 4,95.

### 2026-07-25 (sera) — FASE 0: pagella dei tre sistemi (solo misurazione)

Primo passo di una roadmap in 5 fasi decisa con Rossi dopo un audit completo
del motore. **Questa fase non cambia nessun pronostico**: aggiunge solo la
misurazione che serve a decidere le fasi successive con i numeri invece che a
occhio.

**Perché.** L'app fonde tre sistemi (motore Poisson, euristica PRE, IA) con
pesi scritti a mano (10 / 5 / 8 + bonus concordanza 8) che nessuno ha mai
verificato. Il motivo per cui non erano verificabili: l'unico pick salvato su
Supabase era `main_prediction`, che è il pick **dell'IA**. Il pick del motore
e quello dell'euristica giravano e sparivano; il verdetto finale della fusione
non veniva salvato affatto.

**Cosa è stato aggiunto**
- Migration `fase0_pagella_tre_sistemi`: colonne `pick_strutturale`,
  `pick_pre`, `pick_finale`, `pick_finale_prob`, `scenario` su `matches`;
  nuova tabella `system_scorecard` + RPC `increment_system_score`.
  Tutto additivo: nessuna colonna o tabella esistente è stata modificata.
- `lib/scenario.ts`: classifica la partita per forza della favorita ×
  gol attesi (12 scenari). Le soglie sono quelle usate nell'analisi storica —
  cambiarle rende i conteggi vecchi e nuovi non confrontabili.
- `lib/preHeuristic.ts`: porto lato server di `quickPredictionFamily`, che
  vive solo nel frontend. **Va tenuto allineato a mano** con
  `frontend/src/api.ts`, altrimenti la pagella misura un sistema diverso da
  quello che vota.
- `predict.ts`: registra pick strutturale + pick PRE + scenario sulla riga
  della partita (best effort, mai bloccante, mai su partite già concluse).
- `save-verdict.ts` (nuovo endpoint) + `useEffect` in `app/match/[id].tsx`:
  salvano il verdetto finale della fusione. Risolve anche la perdita del pick
  alla riapertura della partita.
- `lib/applyResult.ts`: aggiorna `system_scorecard` per i tre sistemi
  **prima** dell'uscita anticipata `if (!preds.length) return`. Oggi, senza
  un "Pronostico AI", la partita non insegnava niente a nessuno.

**Misurazione già fatta sullo storico** (rigioco del motore vero su 583
partite reali, campione stratificato verificato con checksum):
| Sistema | Precisione |
|---|---|
| Strutturale attuale | 63,5% |
| Strutturale con distribuzione completa (Fase 1) | **68,8%** |
| Euristica PRE | 57,2% |

**Trappola trovata, da risolvere prima della Fase 2**: il 70% dei pick
attuali — e il 90% di quelli del motore corretto — sono mercati multigol
**senza quota nota**, quindi non filtrabili dalla soglia di quota minima e non
valutabili come puntata. La stima teorica della quota MG (Poisson, validata
sullo storico entro 1-2 punti) va quindi anticipata subito dopo la Fase 1.

### 2026-07-25 (continua) — Roadmap punti 1, 2, 3 completati
- **Punto 1**: attivato `ml_adjustment` nel motore (era scritto ma mai
  alimentato). `predict.ts` ora recupera `market_scores` per la famiglia
  della partita (globale + per-campionato sopra soglia 30) e lo passa a
  `structuralAnalysis()`. Commit `975236c`.
- **Punto 2**: storico esteso da 21 a 49 mercati/combo (`STANDARD_MARKETS`
  ora importa `CANDIDATE_MARKETS` da `clusterEngine.ts`, unica fonte di
  verità; `evaluateMarket` generalizzato per qualsiasi range MG X-Y).
  Backfill esteso alle 5.160 partite storiche per i 28 mercati nuovi
  (senza ricontare i 21 originali). `market_scores` passato da 17.013 a
  38.962 righe. Commit `975236c`.
- **Punto 3**: Distribution Engine leggero, deliberatamente solo
  informativo per ora — verificato che solo 922/3392 squadre hanno 5+
  partite (74 con 8+), troppo poco per un correttivo automatico
  affidabile. Nuova funzione SQL `team_goal_stats()` su Supabase (media
  gol fatti/subiti per squadra, casa/trasferta separate, unendo
  `match_results_training` + `matches` così cresce nel tempo).
  `match-history.ts` la espone (soglia minima 5 partite), mostrata in
  `match/[id].tsx` come card informativa esplicitamente etichettata "non
  influenza il pick". Commit `7c9fde3`.

### 2026-07-25 (continua) — Profilo non istantaneo, scroll Schedina
- **Profilo non aggiornava i numeri subito dopo un salvataggio risultato**:
  `marketStatsCache`/`mlStatsCache` non avevano un metodo `invalidate()`
  (TTL 5 minuti stale-while-revalidate). Aggiunto e collegato in tutti i
  punti che salvano un risultato (Schedina: salva tutti / fetch
  automatico / applica revisione; dettaglio partita: salva singolo).
- **Scroll che tornava sempre in cima rientrando dalla Schedina**: l'effetto
  di reset scroll ai cambi filtro girava anche al primo render dopo un
  rimontaggio (comportamento normale di React), annullando il ripristino
  di `savedScrollY`. Aggiunta una guardia "salta il primo run". Commit
  `bf3a62a`.

### 2026-07-25 — Correttivi motore + scoperta file-sbagliato + storico
- **Scoperto e corretto**: i fix "ranking trasparente" del mattino erano
  finiti nel file legacy (`backend/cluster_engine.py`) invece che in quello
  vero (`netlify/functions/lib/clusterEngine.ts`). Riapplicati sul file
  giusto: rimosso il taglio secco coverage<30%, non si nascondono più i
  mercati incoerenti col pick (es. GG quando NG è il pick), ranking alzato
  da 10 a 20 mercati. Commit `e5f738d`.
- Scoperto (non ancora attivato): `clusterEngine.ts` ha già un meccanismo
  Expected Value (`ev = coverage×quota-1`, boost/malus sullo score) e un
  meccanismo `ml_adjustment` che leggerebbe win-rate storico per mercato —
  ma `predict.ts` non gli passa mai i dati storici (`mlScores`), quindi è
  presente nel codice ma dormiente. Da valutare insieme al correttivo
  storico lato frontend per non sovrapporli.
- **Correttivo storico reale** in `buildFinalVerdict`: penalizza il
  divario tra coverage dichiarata (motore Poisson) e win-rate vero della
  famiglia (da `market_scores`), solo oltre una tolleranza di 15 punti.
  Nuova chiamata `api.matchHistory(id)` in `match/[id].tsx`. Soglia minima
  30 partite per usare il dato per-campionato (sotto soglia, troppo
  rumoroso — 639/801 combinazioni famiglia+campionato ne hanno meno di 10),
  altrimenti fallback sullo storico globale per famiglia. Commit `354c978`.
- **Migrazione storico ScoreBlast**: importate 5.160 partite reali (con
  risultato) dall'altro progetto Supabase di Rossi (ScoreBlast) nella
  nuova tabella `match_results_training`, poi classificate per famiglia e
  usate per arricchire `market_scores`/`family_counters` (17.013 righe,
  5.428 partite totali nel sistema di apprendimento).
- **Correttivo coverage reale** in `buildFinalVerdict`: la coverage/
  fragility del motore Poisson ora pesa per qualunque mercato nel ranking
  (non solo la sua top-6), bonus/penalità proporzionale alla distanza dal
  50%. Commit `68965af`.
- **3 bug post-migrazione risolti**: Pronostico AI restituiva testo di
  reasoning troncato invece del JSON (DeepSeek V4 attiva il "thinking
  mode" di default, ora disabilitato per l'opzione Lite) — bug vero
  trovato prima nel file legacy `llmProviders`... vedi sopra; ricerca
  partite riportata a restare sul giorno selezionato; salvataggio
  risultati in Schedina ora invalida le cache e ricarica, aggiunta
  colorazione verde/rosso agli esiti. Commit `12ab321`.
- **Sganciamento definitivo da Emergent completato**: ultimi 11 endpoint
  portati da `backend/server.py` a Netlify Functions + Supabase
  (export/import/delete DB, candidates, history, results apply/bulk,
  stats, aistudio-prompt, fetch automatico risultati via Fotmob). 25
  Netlify Functions attive, 0 dipendenze residue da Emergent. Commit
  `dab57d8`.
- **Fix motore fusione**: rimossa la "primazia strutturale" (il pick del
  motore Poisson vinceva sempre per garanzia); i 3 sistemi ora competono
  ad armi pari con bonus di concordanza. Gestione mercati opposti
  ravvicinati (es. NG vs GG) e penalità combo ridondanti. Caso reale che
  ha innescato il fix: amichevole Napoli-Arezzo, pick NG scelto per
  "primazia strutturale" nonostante fragilità, partita persa 1-3. Commit
  `6720457` (poi corretto il 25/07 perché finito nel file legacy, vedi sopra).

### 2026-07-24 — Pronostico AI, Profilo, Schedina, UX
- Pronostico AI migrato a Netlify Functions (DeepSeek + Groq gratuito,
  GPT-OSS 120B/20B). Chiavi API come env var Netlify (non "secret", bug
  della piattaforma le rendeva illeggibili).
- Profilo/statistiche ML migrato (`ml-stats`, legge da `market_scores`).
- Schedina completata (selezione multipla, lista, svuota).
- Bug UX corretti: bottone Pronostico AI invisibile (stile mancante);
  persistenza scroll/filtri quando si torna da una partita; toast
  "undefined vs undefined" nella selezione partita.

### 2026-07-XX — Migrazione iniziale
- Deploy automatico GitHub→Netlify impostato (GitHub Action + build hook).
- Frontend ricollegato a Supabase via Netlify Functions per matches/days/
  match/setResult/matchStructural/upload Excel.
- 3 bug di import Excel corretti (xlsx non installato su Netlify; quote
  non annidate in "odds"; timeout su file grandi risolto con RPC bulk).
- Storico iniziale importato: 179 partite concluse + 161 pronostici.

---

## Roadmap / prossimi passi noti (non ancora fatti)

- Valutare se e come collegare il meccanismo `ml_adjustment` dormiente in
  `clusterEngine.ts` (lato server) senza sovrapporlo al correttivo storico
  già attivo lato frontend in `buildFinalVerdict`.
- Estendere lo storico di `market_scores` oltre i 21 mercati standard
  attuali, per coprire più combo (oggi solo "DC 1X/X2 + O1.5/U3.5").
- Distribution Engine / Decision Engine veri e propri (distribuzione gol
  reale per singola squadra): rimandato finché i dati per-squadra non
  saranno più numerosi (oggi ~3 partite/squadra in media, insufficiente).
- Trasferire Netlify e Supabase dall'account `lavoro.sm1@gmail.com`
  (attuale, verrà chiuso) a `nuovorossi1@gmail.com` (definitivo).
