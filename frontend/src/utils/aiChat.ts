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
