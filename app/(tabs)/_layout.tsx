import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import React from 'react'
import { StyleSheet, View } from 'react-native'

type IconName = keyof typeof Ionicons.glyphMap

function TabIcon({ name, color }: { name: IconName; color: string }) {
    return <Ionicons name={name} size={22} color={color} />
}

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarActiveTintColor: '#800000',
                tabBarInactiveTintColor: '#444',
                tabBarLabelStyle: styles.tabLabel,
                tabBarItemStyle: styles.tabItem,
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
                }}
            />
            <Tabs.Screen
                name="programs"
                options={{
                    title: 'Programs',
                    tabBarIcon: ({ color }) => <TabIcon name="list-outline" color={color} />,
                }}
            />
            <Tabs.Screen
                name="log"
                options={{
                    title: 'Log',
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
                    title: 'Progress',
                    tabBarIcon: ({ color }) => <TabIcon name="trending-up-outline" color={color} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarIcon: ({ color }) => <TabIcon name="person-outline" color={color} />,
                }}
            />
        </Tabs>
    )
}

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: '#0d0d0d',
        borderTopColor: '#1a1a1a',
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
        backgroundColor: '#800000',
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
})