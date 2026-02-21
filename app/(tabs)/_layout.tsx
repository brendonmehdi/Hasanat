// app/(tabs)/_layout.tsx — Bottom tab navigator
import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { COLORS } from '../../src/constants';

const TAB_ICON: Record<string, string> = {
    home: '🕌',
    leaderboard: '🏆',
    feed: '🍽️',
    profile: '👤',
};

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarActiveTintColor: COLORS.accent,
                tabBarInactiveTintColor: COLORS.textMuted,
                tabBarLabelStyle: styles.tabLabel,
                tabBarIcon: ({ focused }) => (
                    <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>
                        {TAB_ICON[route.name] || '📄'}
                    </Text>
                ),
            })}
        >
            <Tabs.Screen
                name="home"
                options={{ title: 'Prayers' }}
            />
            <Tabs.Screen
                name="leaderboard"
                options={{ title: 'Leaderboard' }}
            />
            <Tabs.Screen
                name="feed"
                options={{ title: 'Iftar Feed' }}
            />
            <Tabs.Screen
                name="profile"
                options={{ title: 'Profile' }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: COLORS.bgCard,
        borderTopColor: COLORS.border,
        borderTopWidth: 1,
        height: 88,
        paddingBottom: 24,
        paddingTop: 8,
    },
    tabLabel: {
        fontFamily: 'Inter_500Medium',
        fontSize: 11,
    },
    tabIcon: {
        fontSize: 22,
        opacity: 0.5,
    },
    tabIconActive: {
        opacity: 1,
    },
});
