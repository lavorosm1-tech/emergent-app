import type { CapacitorConfig } from '@capacitor/cli'

// Guscio Android di PronoBlast, stesso schema di GymBuilder: l'APK non contiene
// l'app, la carica dal sito Vercel. Gli aggiornamenti web arrivano da soli;
// solo le modifiche a questo guscio (android/, questo file) richiedono un APK nuovo.
const config: CapacitorConfig = {
  appId: 'app.pronoblast.mobile',
  appName: 'PronoBlast',
  webDir: 'capacitor-web',
  server: {
    url: 'https://pronoblast.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
