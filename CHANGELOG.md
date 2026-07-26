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

## Log (più recente in cima)

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
