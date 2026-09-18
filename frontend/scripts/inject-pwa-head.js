#!/usr/bin/env node
/**
 * Con `web.output: "single"` (SPA) Expo NON usa `app/+html.tsx`: genera
 * `dist/index.html` da un suo template minimo. Le meta della PWA (manifest,
 * theme-color, icona iOS, lang) vanno quindi iniettate dopo l'export.
 * Lanciato da `yarn build:web`, quindi vale sia in locale sia su Vercel/Netlify.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "dist", "index.html");
if (!fs.existsSync(file)) {
  console.error("inject-pwa-head: dist/index.html non trovato — export fallito?");
  process.exit(1);
}

let html = fs.readFileSync(file, "utf8");
html = html.replace(/<html lang="[^"]*"/, '<html lang="it"');

const tags = [
  '<meta name="description" content="Analisi partite e pronostici: motore statistico, IA e quote del bookmaker" />',
  '<meta name="theme-color" content="#0A0A0A" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="PronoBlast" />',
  '<link rel="apple-touch-icon" href="/pronoblast-192.png" />',
  '<link rel="manifest" href="/manifest.webmanifest" />',
];

const mancanti = tags.filter((t) => !html.includes(t));
if (mancanti.length) {
  html = html.replace("</head>", "  " + mancanti.join("\n  ") + "\n</head>");
}

// viewport-fit=cover: serve per le tacche degli iPhone
html = html.replace(
  /(<meta name="viewport" content="[^"]*?)(" \/>)/,
  (m, a, b) => (a.includes("viewport-fit") ? m : a + ", viewport-fit=cover" + b)
);

fs.writeFileSync(file, html);
console.log(`inject-pwa-head: ok (${mancanti.length} tag aggiunti)`);
