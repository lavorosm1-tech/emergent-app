import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "@/src/theme";
import { checkForAndroidUpdate, installAndroidUpdate, type RemoteRelease } from "@/src/utils/androidApp";

/**
 * Avviso di aggiornamento dell'APK Android. Vive in _layout.tsx sopra tutto.
 * Nel browser non fa niente (checkForAndroidUpdate risponde null subito).
 * Dentro l'APK, all'avvio confronta la versione installata con l'ultima
 * GitHub Release e, se e' piu' nuova, mostra questo riquadro.
 */
type State = "ready" | "downloading" | "permission" | "error";

export default function NativeUpdater() {
  const [release, setRelease] = useState<RemoteRelease | null>(null);
  const [state, setState] = useState<State>("ready");

  useEffect(() => {
    let active = true;
    checkForAndroidUpdate().then((r) => { if (active && r) setRelease(r.release); });
    return () => { active = false; };
  }, []);

  if (!release) return null;

  const install = async () => {
    setState("downloading");
    try {
      const out = await installAndroidUpdate(release);
      setState(out === "permission" ? "permission" : "downloading");
    } catch {
      setState("error");
    }
  };

  const label =
    state === "downloading" ? "Download in corso…" :
    state === "permission" ? "Ho autorizzato, riprova" :
    "Aggiorna app";

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>AGGIORNAMENTO ANDROID</Text>
        <Text style={styles.title}>PronoBlast {release.version}</Text>
        <Text style={styles.body}>
          {release.notes || "È disponibile una nuova versione dell'app."}
        </Text>
        {state === "permission" && (
          <Text style={[styles.note, styles.noteWarn]}>
            Autorizza PronoBlast a installare app nella schermata appena aperta, poi torna qui e premi di nuovo.
          </Text>
        )}
        {state === "error" && (
          <Text style={[styles.note, styles.noteErr]}>
            Download non riuscito. Controlla la connessione e riprova.
          </Text>
        )}
        <TouchableOpacity style={[styles.btn, state === "downloading" && { opacity: 0.6 }]} disabled={state === "downloading"} onPress={install} activeOpacity={0.85}>
          <Text style={styles.btnTxt}>{label}</Text>
        </TouchableOpacity>
        {state !== "downloading" && (
          <TouchableOpacity style={styles.later} onPress={() => setRelease(null)}>
            <Text style={styles.laterTxt}>Più tardi</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end", padding: 16, zIndex: 1000,
  },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: 20, gap: 8,
  },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  noteWarn: { color: "#FCD34D", borderColor: "rgba(245,158,11,0.4)", backgroundColor: "rgba(245,158,11,0.1)" },
  noteErr: { color: "#FCA5A5", borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.1)" },
  btn: { marginTop: 10, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnTxt: { color: "#0A0A0A", fontWeight: "900", fontSize: 14 },
  later: { paddingVertical: 10, alignItems: "center" },
  laterTxt: { color: colors.textMuted, fontSize: 13 },
});
