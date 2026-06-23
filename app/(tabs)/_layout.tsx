import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} size={22} color={color} />;
}

export default function TabLayout() {
  const [fabOpen, setFabOpen] = useState(false);
  const [generateEnabled, setGenerateEnabled] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  function toggleFab() {
    setGenerateEnabled(true);
    const toValue = fabOpen ? 0 : 1;
    Animated.spring(animation, {
      toValue,
      useNativeDriver: true,
      friction: 6,
    }).start();
    setFabOpen(!fabOpen);
  }

  function closeFab() {
    Animated.spring(animation, {
      toValue: 0,
      useNativeDriver: true,
      friction: 6,
    }).start();
    setFabOpen(false);
    setGenerateEnabled(false);
  }

  const rotation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  const option1Style = {
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  };
  const option2Style = {
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [40, 0],
        }),
      },
    ],
  };
  const option3Style = {
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [60, 0],
        }),
      },
    ],
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: "#800000",
          tabBarInactiveTintColor: "#444",
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <TabIcon name="home-outline" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="programs"
          options={{
            title: "Programs",
            tabBarIcon: ({ color }) => (
              <TabIcon name="list-outline" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="log"
          options={{
            title: "Log",
            tabBarIcon: ({ color }) => (
              <View style={styles.logButton}>
                <Ionicons name="add" size={28} color="#fff" />
              </View>
            ),
            tabBarLabel: () => null,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: "Progress",
            tabBarIcon: ({ color }) => (
              <TabIcon name="barbell-outline" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => (
              <TabIcon name="person-outline" color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Backdrop */}
      {fabOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeFab}
        />
      )}

      {/* FAB options */}
      <View style={styles.fabContainer} pointerEvents="box-none">
        {/* Progress Insights — coming soon */}
        <Animated.View style={[styles.fabOptionRow, option3Style]}>
          <View style={styles.fabLabelDisabled}>
            <Text style={styles.fabLabelTextDisabled}>Progress Insights</Text>
            <Text style={styles.comingSoon}>soon</Text>
          </View>
          <View style={[styles.fabOptionBtn, styles.fabOptionBtnDisabled]}>
            <Ionicons name="analytics-outline" size={18} color="#444" />
          </View>
        </Animated.View>

        {/* AI Coach — coming soon */}
        <Animated.View style={[styles.fabOptionRow, option2Style]}>
          <View style={styles.fabLabelDisabled}>
            <Text style={styles.fabLabelTextDisabled}>AI Coach</Text>
            <Text style={styles.comingSoon}>soon</Text>
          </View>
          <View style={[styles.fabOptionBtn, styles.fabOptionBtnDisabled]}>
            <Ionicons name="chatbubble-outline" size={18} color="#444" />
          </View>
        </Animated.View>

        {/* Generate Program — active */}
        <Animated.View style={[styles.fabOptionRow, option1Style]}>
          <TouchableOpacity
            style={generateEnabled ? styles.fabLabel : styles.fabLabelDisabled}
            onPress={generateEnabled ? () => { closeFab(); router.push("/ai/generate-program"); } : undefined}
            activeOpacity={0.8}
          >
            <Text style={generateEnabled ? styles.fabLabelText : styles.fabLabelTextDisabled}>Generate Program</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fabOptionBtn}
            onPress={() => {
              }}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* Main FAB */}
        <TouchableOpacity
          style={styles.fab}
          onPress={toggleFab}
          activeOpacity={0.85}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="sparkles" size={22} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#0d0d0d",
    borderTopColor: "#1a1a1a",
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabItem: {
    borderRadius: 12,
  },
  logButton: {
    width: 48,
    height: 48,
    backgroundColor: "#800000",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 99,
  },
  fabContainer: {
    position: "absolute",
    bottom: 80,
    right: 16,
    alignItems: "flex-end",
    gap: 10,
    zIndex: 100,
  },
  fab: {
    width: 52,
    height: 52,
    backgroundColor: "#800000",
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  fabOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fabOptionBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#800000",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  fabOptionBtnDisabled: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  fabLabel: {
    backgroundColor: "#800000",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  fabLabelText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  fabLabelDisabled: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  fabLabelTextDisabled: {
    color: "#444",
    fontSize: 13,
  },
  comingSoon: {
    color: "#333",
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
