import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import BottomNav from "@/src/components/BottomNav";
import { colors } from "@/src/theme";

export default function Profilo() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profilo</Text>
      </View>
      <View style={styles.empty}>
        <Ionicons name="person-circle-outline" size={96} color={colors.textDim} />
        <Text style={styles.emptyTitle}>Profilo in arrivo</Text>
        <Text style={styles.emptyDesc}>Qui troverai impostazioni account, preferenze, statistiche personali e cronologia.</Text>
      </View>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  emptyDesc: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 },
});
