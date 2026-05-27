import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { colors } from "@/src/theme";
import { api } from "@/src/api";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { route: string; label: string; icon: IconName; testID: string }[] = [
  { route: "/profilo", label: "Profilo", icon: "person-circle-outline", testID: "tab-profile" },
  { route: "/strumenti", label: "Strumenti", icon: "construct-outline", testID: "tab-tools" },
  { route: "/", label: "Partite", icon: "trophy-outline", testID: "tab-home" },
  { route: "/selected", label: "Schedina", icon: "ticket-outline", testID: "tab-schedina" },
  { route: "/book", label: "Book", icon: "book-outline", testID: "tab-book" },
];

export default function BottomNav() {
  const router = useRouter();
  const path = usePathname();
  const [selCount, setSelCount] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      try {
        const list = await api.selectedList();
        if (active) setSelCount(list.length);
      } catch {}
    };
    fetchCount();
    const t = setInterval(fetchCount, 4000);
    return () => { active = false; clearInterval(t); };
  }, [path]);

  return (
    <View style={styles.wrap}>
      {TABS.map((t) => {
        const active = (t.route === "/" && path === "/") || (t.route !== "/" && path?.startsWith(t.route));
        const isSchedina = t.route === "/selected";
        return (
          <TouchableOpacity
            key={t.route}
            testID={t.testID}
            onPress={() => router.replace(t.route as any)}
            style={styles.tab}
            activeOpacity={0.7}
          >
            <View>
              <Ionicons name={t.icon} size={22} color={active ? colors.primary : colors.textMuted} />
              {isSchedina && selCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{selCount > 99 ? "99+" : selCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: active ? colors.primary : colors.textMuted }]}>
              {t.label}{isSchedina && selCount > 0 ? ` (${selCount})` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "rgba(10,10,10,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 22,
    paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  badge: {
    position: "absolute", top: -4, right: -8,
    minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.bg,
  },
  badgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "900" },
});
