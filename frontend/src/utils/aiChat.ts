/**
 * Destinazione esterna per l'analisi del prompt delle partite selezionate.
 *
 * 14/09/2026 — Era Google AI Studio, scritto a mano in TRE file diversi
 * (book.tsx, selected.tsx, strumenti.tsx). Rossi usa TypingMind, quindi
 * l'indirizzo e' cambiato: tenerlo in un posto solo evita che la prossima
 * volta se ne aggiorni due su tre.
 *
 * Il prompt non viaggia nell'indirizzo: TypingMind tiene le conversazioni nel
 * browser e non ha un parametro documentato per precompilare il testo. Il
 * meccanismo resta quello che gia' funzionava — testo negli appunti, scheda
 * aperta, incolla — che ha il vantaggio di non dipendere da come quel sito
 * decide di leggere gli indirizzi.
 */
export const AI_CHAT_URL = "https://www.typingmind.com/";
export const AI_CHAT_NAME = "TypingMind";

/**
 * Prompt del tasto "Genera Multipla tramite AI" (17/09/2026).
 *
 * A differenza del tasto "Framework TypingMind", questo NON parte dalle partite
 * in Schedina: e' il modello a cercare da solo le partite del giorno sul web e
 * a proporre la multipla. Rossi poi seleziona a mano nell'app quelle che gli
 * interessano.
 *
 * Testo scritto da Rossi e usato COSI' COM'E': niente segnaposto da riempire,
 * niente aggiunte. La data non viene passata di proposito — il prompt chiede al
 * modello di usare "la data odierna reale", che e' piu' affidabile che infilarci
 * una data calcolata dal telefono con il rischio di fusi orari sbagliati.
 */
export const AI_MULTIPLA_PROMPT = `Cerca sul web le principali partite di calcio in programma oggi, usando la data odierna reale.
Segui questa priorità per i campionati:
1ª divisione → 2ª divisione → 3ª divisione, senza scendere oltre la 3ª divisione.
Dai priorità a:
Serie A, Premier League, Liga, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, Champions League, Europa League, Conference League e principali coppe nazionali.
Se un campionato di 1ª divisione non ha partite oggi, passa alla relativa 2ª divisione; se non ci sono nemmeno partite di 2ª divisione, passa alla 3ª divisione.
Esempio: Serie A → Serie B → Serie C.
Non inserire campionati inferiori alla 3ª divisione.
Tra le partite disponibili seleziona 5-8 partite e analizzale per costruire UNA multipla con quota totale minima 13.
Per ogni partita scelta indica:
Partita | Pronostico | Quota + bookmaker | Motivazione breve
Scrivi anche:
"Tra le principali partite di oggi ho scelto queste perché..."
Infine crea UNA sola multipla, con un solo pronostico per partita, fermandoti appena la quota totale supera 13.
Usa informazioni, statistiche e quote aggiornate prima della selezione.`;
