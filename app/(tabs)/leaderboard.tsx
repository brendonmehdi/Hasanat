// app/(tabs)/leaderboard.tsx — Leaderboard screen (weekly + all-time)
import { useState, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWeeklyLeaderboard, useAllTimeLeaderboard } from '../../src/hooks/useLeaderboard';
import { useAuthStore } from '../../src/stores/authStore';
import { COLORS } from '../../src/constants';
import type { LeaderboardEntry } from '../../src/types';

type Tab = 'weekly' | 'alltime';

const MEDAL = ['🥇', '🥈', '🥉'];
const MEDAL_COLOR = [COLORS.gold, COLORS.silver, COLORS.bronze];

function RankRow({ entry, rank, isCurrentUser }: {
    entry: LeaderboardEntry;
    rank: number;
    isCurrentUser: boolean;
}) {
    const initial = (entry.display_name || entry.username || '?')[0].toUpperCase();
    const points = entry.weekly_points ?? entry.total_points ?? 0;

    return (
        <View style={[styles.rankRow, isCurrentUser && styles.rankRowCurrent]}>
            {/* Rank */}
            <View style={styles.rankBadge}>
                {rank <= 3 ? (
                    <Text style={styles.medal}>{MEDAL[rank - 1]}</Text>
                ) : (
                    <Text style={styles.rankNumber}>{rank}</Text>
                )}
            </View>

            {/* Avatar */}
            <View style={[
                styles.avatar,
                rank <= 3 && { borderColor: MEDAL_COLOR[rank - 1] },
            ]}>
                <Text style={styles.avatarText}>{initial}</Text>
            </View>

            {/* Info */}
            <View style={styles.userInfo}>
                <Text style={[styles.userName, isCurrentUser && styles.userNameCurrent]}>
                    {entry.display_name || entry.username}
                    {isCurrentUser ? ' (You)' : ''}
                </Text>
                <Text style={styles.userHandle}>@{entry.username}</Text>
            </View>

            {/* Points */}
            <View style={styles.pointsBadge}>
                <Text style={[
                    styles.pointsText,
                    rank === 1 && { color: COLORS.gold },
                ]}>
                    {points.toLocaleString()}
                </Text>
                <Text style={styles.pointsUnit}>pts</Text>
            </View>
        </View>
    );
}

export default function LeaderboardScreen() {
    const router = useRouter();
    const profile = useAuthStore((s) => s.profile);
    const [tab, setTab] = useState<Tab>('weekly');

    const { data: weekly, isLoading: weeklyLoading, refetch: refetchWeekly } = useWeeklyLeaderboard();
    const { data: allTime, isLoading: allTimeLoading, refetch: refetchAllTime } = useAllTimeLeaderboard();

    const data = tab === 'weekly' ? weekly : allTime;
    const isLoading = tab === 'weekly' ? weeklyLoading : allTimeLoading;
    const refetch = tab === 'weekly' ? refetchWeekly : refetchAllTime;

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Leaderboard 🏆</Text>

                {/* Friends link */}
                <TouchableOpacity onPress={() => router.push('/friends')}>
                    <Text style={styles.friendsLink}>Friends 👥</Text>
                </TouchableOpacity>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tab, tab === 'weekly' && styles.tabActive]}
                    onPress={() => setTab('weekly')}
                >
                    <Text style={[styles.tabText, tab === 'weekly' && styles.tabTextActive]}>
                        This Week
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, tab === 'alltime' && styles.tabActive]}
                    onPress={() => setTab('alltime')}
                >
                    <Text style={[styles.tabText, tab === 'alltime' && styles.tabTextActive]}>
                        All Time
                    </Text>
                </TouchableOpacity>
            </View>

            {/* List */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={COLORS.accent} size="large" />
                </View>
            ) : data && data.length > 0 ? (
                <FlatList
                    data={data}
                    keyExtractor={(item) => item.user_id}
                    renderItem={({ item, index }) => (
                        <RankRow
                            entry={item}
                            rank={index + 1}
                            isCurrentUser={item.user_id === profile?.id}
                        />
                    )}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.accent}
                        />
                    }
                />
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🏆</Text>
                    <Text style={styles.emptyTitle}>No friends yet</Text>
                    <Text style={styles.emptyText}>
                        Add friends to see the leaderboard.{'\n'}
                        You can add friends by their username.
                    </Text>
                    <TouchableOpacity
                        style={styles.addFriendsBtn}
                        onPress={() => router.push('/friends')}
                    >
                        <Text style={styles.addFriendsBtnText}>Add Friends</Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },

    // Header
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    },
    title: {
        fontFamily: 'Inter_700Bold', fontSize: 24, color: COLORS.textPrimary, letterSpacing: -0.5,
    },
    friendsLink: {
        fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.accent,
    },

    // Tabs
    tabRow: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 16,
        backgroundColor: COLORS.bgCard, borderRadius: 12, padding: 4,
        borderWidth: 1, borderColor: COLORS.border,
    },
    tab: {
        flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10,
    },
    tabActive: {
        backgroundColor: COLORS.accent,
    },
    tabText: {
        fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.textSecondary,
    },
    tabTextActive: {
        color: COLORS.textInverse,
    },

    // List
    listContent: { paddingHorizontal: 20, paddingBottom: 32 },

    // Rank Row
    rankRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: COLORS.bgCard, borderRadius: 14, padding: 14,
        marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
    },
    rankRowCurrent: {
        borderColor: COLORS.accent,
        backgroundColor: COLORS.accentGlow,
    },
    rankBadge: {
        width: 32, alignItems: 'center',
    },
    medal: { fontSize: 22 },
    rankNumber: {
        fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.textMuted,
    },

    avatar: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: COLORS.bgElevated, borderWidth: 1.5, borderColor: COLORS.accent,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.accent },

    userInfo: { flex: 1 },
    userName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
    userNameCurrent: { color: COLORS.accent },
    userHandle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

    pointsBadge: { alignItems: 'flex-end' },
    pointsText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.accent },
    pointsUnit: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },

    // Loading
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Empty
    emptyContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 8 },
    emptyText: {
        fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary,
        textAlign: 'center', lineHeight: 22,
    },
    addFriendsBtn: {
        backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
        marginTop: 20,
    },
    addFriendsBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.textInverse },
});
