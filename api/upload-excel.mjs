/**
 * Involucro Vercel per /api/upload-excel.
 *
 * L'implementazione NON e' qui: vive in netlify/functions/upload-excel.mjs, la stessa
 * che gira su Netlify. Questo file esiste solo perche' le due piattaforme
 * dichiarano le funzioni in modo diverso — Netlify vuole un export default che
 * riceve una Request, Vercel vuole un export per ogni metodo HTTP — mentre il
 * corpo della funzione e' identico, perche' entrambe usano Request e Response
 * standard del web.
 *
 * Tenendo una logica sola e due involucri sottili, durante la migrazione
 * l'app funziona su tutte e due senza che il codice vada mantenuto in doppio.
 */
import handler from "../netlify/functions/upload-excel.mjs";

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
