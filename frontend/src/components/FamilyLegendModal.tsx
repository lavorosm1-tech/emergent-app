import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

const FAMILIES = [
  {
    name: "DOMINANZA",
    pavimento: "qualsiasi",
    tetto: "qualsiasi",
    logic: "Una squadra vince netta (quota 1 o 2 ≤ 1.50). I gol non sono rilevanti.",
    color: "#F59E0B",
  },
  {
    name: "DOMINANZA_CON_TETTO",
    pavimento: "0",
    tetto: "3 (U3.5 basso)",
    logic: "Favorita esiste MA partita 'controllata' → minimo 0 gol, massimo 3 gol.",
    color: "#EAB308",
  },
  {
    name: "DOMINANZA_GOL",
    pavimento: "2 (O1.5 basso)",
    tetto: "aperto",
    logic: "Favorita esistente + gol probabili → minimo 2 gol.",
    color: "#F97316",
  },
  {
    name: "OFFENSIVA",
    pavimento: "2 (O1.5 basso)",
    tetto: "aperto",
    logic: "Apertura, nessuna favorita netta, gol probabili.",
    color: "#FB923C",
  },
  {
    name: "OFFENSIVA_PULITA",
    pavimento: "3 (O2.5 basso)",
    tetto: "aperto",
    logic: "Spettacolo → minimo 3 gol, partita aperta da entrambi i lati.",
    color: "#EF4444",
  },
  {
    name: "RANGE_CONTROLLATO",
    pavimento: "2 (O1.5 ≤ 1.40)",
    tetto: "4 (U3.5 ≤ 1.40)",
    logic: "Range chiuso 2-4 gol. Forte segnale MG 2-4.",
    color: "#3B82F6",
  },
  {
    name: "CHIUSA_PROTETTA",
    pavimento: "0",
    tetto: "2 (U2.5 basso)",
    logic: "Difese solide → massimo 2 gol.",
    color: "#10B981",
  },
  {
    name: "INSTABILE",
    pavimento: "indeterminato",
    tetto: "indeterminato",
    logic: "Quote larghe, nessun segnale chiaro. Da evitare o ridurre stake.",
    color: "#71717A",
  },
];

export function FamilyLegendModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.modalCard} onPress={() => { /* eat */ }}>
          <View style={s.header}>
            <Ionicons name="library" size={20} color={colors.primary} />
            <Text style={s.title}>Famiglie pronostico — guida rapida</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="legend-close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={s.intro}>
            Ogni famiglia descrive la "forma" della partita letta dalle quote come SISTEMA (non singolarmente).
            Pavimento = gol minimo, Tetto = gol massimo.
          </Text>
          <ScrollView style={s.scroll}>
            {FAMILIES.map((f) => (
              <View key={f.name} style={[s.famBlock, { borderLeftColor: f.color }]}>
                <Text style={[s.famName, { color: f.color }]}>{f.name}</Text>
                <View style={s.row}>
                  <Text style={s.label}>Pavimento</Text>
                  <Text style={s.value}>{f.pavimento}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Tetto</Text>
                  <Text style={s.value}>{f.tetto}</Text>
                </View>
                <Text style={s.logic}>{f.logic}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 600, maxHeight: "85%", backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "900" },
  closeBtn: { padding: 4 },
  intro: { color: colors.textMuted, fontSize: 12, padding: 12, lineHeight: 17 },
  scroll: { padding: 12 },
  famBlock: { backgroundColor: colors.surfaceHi, borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 4, gap: 4 },
  famName: { fontSize: 13, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  value: { color: colors.text, fontSize: 12, fontWeight: "800" },
  logic: { color: colors.textDim, fontSize: 11, marginTop: 4, lineHeight: 16 },
});
