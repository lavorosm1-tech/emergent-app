# PronoBlast

App di analisi partite e pronostici calcio. Per ogni partita mostra un ranking di
mercati con la probabilità stimata dal motore, la quota reale del bookmaker e un
verdetto finale che nasce dalla fusione di tre voci: motore statistico (Poisson),
IA e pre-pronostico letto dalle quote.

## Prima di toccare qualsiasi cosa

**Leggi [`CHANGELOG.md`](CHANGELOG.md).** Contiene la cronologia delle decisioni,
le regole di selezione del pick e soprattutto le trappole note — a partire dalla
più costosa: `backend/` non esiste più, la logica vera è in `netlify/functions/`.

## Stack

- **Frontend**: Expo Router (React Native Web), esportato come sito statico in `frontend/dist`
- **Server**: funzioni TypeScript in `netlify/functions/`, esposte da `api/[route].ts`
- **Database**: Supabase (PostgREST + funzioni SQL per l'apprendimento per scenario)
- **Hosting**: Vercel (produzione), Netlify in parallelo
- **Android**: guscio Capacitor in `android/` — vedi [`docs/android-apk.md`](docs/android-apk.md)

## Comandi

```bash
cd frontend
npm ci                # installa esattamente le versioni del lockfile
npm run build:web     # export web + iniezione delle meta PWA
npx tsc --noEmit -p . # deve restare a 0 errori
npx eslint .          # deve restare a 0 errori
```

Ogni nuova funzione server va registrata in **tre** posti: `api/[route].ts`,
`vercel.json` (rewrite) e `netlify.toml` (redirect). Saltarne uno la fa finire
sul fallback SPA senza errori visibili.
