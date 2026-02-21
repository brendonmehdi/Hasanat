// app/(tabs)/profile.tsx — Profile screen with stats, friends link, sign out
import { useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Alert,
    ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useHasanatTotals } from '../../src/hooks/useHasanatTotals';
import { useFriendsList, usePendingRequests } from '../../src/hooks/useFriends';
import { COLORS } from '../../src/constants';

export default function ProfileScreen() {
    const router = useRouter();
    const { profile, signOut, session } = useAuth();
    const { data: totals } = useHasanatTotals();
    const { data: friends } = useFriendsList();
    const { data: pending } = usePendingRequests();

    const handleSignOut = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Profile 👤</Text>

                {/* Profile info */}
                <View style={styles.card}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
                        </Text>
                    </View>
                    <View style={styles.info}>
                        <Text style={styles.displayName}>
                            {profile?.display_name || profile?.username || 'Unknown'}
                        </Text>
                        {profile?.username ? (
                            <Text style={styles.username}>@{profile.username}</Text>
                        ) : null}
                        <Text style={styles.email}>{session?.user?.email}</Text>
                    </View>
                </View>

                {/* Stats */}
                <View style={styles.statsCard}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{totals?.all_time_total || 0}</Text>
                        <Text style={styles.statLabel}>Hasanat</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <TouchableOpacity
                        style={styles.statItem}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.statValue}>{friends?.length || 0}</Text>
                        <Text style={styles.statLabel}>Friends</Text>
                    </TouchableOpacity>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                            {profile?.timezone?.split('/').pop()?.replace(/_/g, ' ') || '—'}
                        </Text>
                        <Text style={styles.statLabel}>Location</Text>
                    </View>
                </View>

                {/* Pending requests badge */}
                {pending && pending.length > 0 && (
                    <TouchableOpacity
                        style={styles.pendingBanner}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.pendingText}>
                            📩 {pending.length} pending friend request{pending.length > 1 ? 's' : ''}
                        </Text>
                        <Text style={styles.pendingCta}>View →</Text>
                    </TouchableOpacity>
                )}

                {/* Quick links */}
                <View style={styles.linksCard}>
                    <TouchableOpacity
                        style={styles.linkRow}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.linkEmoji}>👥</Text>
                        <Text style={styles.linkText}>Friends</Text>
                        <Text style={styles.linkArrow}>→</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.linkRow, { borderBottomWidth: 0 }]}
                        onPress={() => router.push('/settings')}
                    >
                        <Text style={styles.linkEmoji}>⚙️</Text>
                        <Text style={styles.linkText}>Settings</Text>
                        <Text style={styles.linkArrow}>→</Text>
                    </TouchableOpacity>
                </View>

                {/* Sign out */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    activeOpacity={0.7}
                >
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 16 },
    title: {
        fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.textPrimary,
        letterSpacing: -0.5, marginBottom: 8,
    },

    // Profile Card
    card: {
        backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 16,
    },
    avatar: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: COLORS.accentGlow, borderWidth: 2, borderColor: COLORS.accent,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontFamily: 'Inter_700Bold', fontSize: 22, color: COLORS.accent },
    info: { flex: 1 },
    displayName: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: COLORS.textPrimary },
    username: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
    email: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

    // Stats
    statsCard: {
        backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: COLORS.border,
        flexDirection: 'row', alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.accent },
    statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
    statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },

    // Pending banner
    pendingBanner: {
        backgroundColor: COLORS.accentGlow, borderRadius: 12, padding: 14,
        borderWidth: 1, borderColor: COLORS.accent,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    pendingText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.accent },
    pendingCta: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.accent },

    // Quick links
    linksCard: {
        backgroundColor: COLORS.bgCard, borderRadius: 16,
        borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    },
    linkRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    linkEmoji: { fontSize: 20 },
    linkText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: COLORS.textPrimary, flex: 1 },
    linkArrow: { fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.textMuted },

    // Sign out
    signOutButton: {
        backgroundColor: COLORS.bgElevated, borderRadius: 12, padding: 16,
        alignItems: 'center', borderWidth: 1, borderColor: COLORS.error, marginTop: 8,
    },
    signOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.error },
});
