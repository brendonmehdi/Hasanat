// app/(tabs)/home.tsx — Prayer times home screen with checklist + fasting
import { useState, useCallback, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { usePrayerTimes } from '../../src/hooks/usePrayerTimes';
import { usePrayerLogs, useMarkPrayer } from '../../src/hooks/usePrayerLogs';
import { useFastingStatus, useSetFasting, useBreakFast } from '../../src/hooks/useFasting';
import { useHasanatTotals } from '../../src/hooks/useHasanatTotals';
import { toDateString, getPrayerWindowStatus } from '../../src/lib/aladhan';
import { COLORS, PRAYER_NAMES, PRAYER_LABELS, PRAYER_EMOJI, POINTS } from '../../src/constants';
import type { PrayerName, PrayerStatus, PrayerDayTimings, PrayerLog } from '../../src/types';

// ─── Helper: format time ───────────────────────────────────────
function formatTime(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Helper: status badge ──────────────────────────────────────
function getStatusInfo(status: PrayerStatus) {
    switch (status) {
        case 'on_time': return { label: 'On Time', color: COLORS.green, emoji: '✅', points: `+${POINTS.PRAYER_ON_TIME}` };
        case 'late': return { label: 'Late', color: COLORS.warning, emoji: '⏰', points: `+${POINTS.PRAYER_LATE}` };
        case 'missed': return { label: 'Missed', color: COLORS.error, emoji: '❌', points: '0' };
    }
}

// ─── Helper: window status → display ───────────────────────────
function getWindowInfo(windowStatus: string) {
    switch (windowStatus) {
        case 'upcoming': return { label: 'Upcoming', color: COLORS.textMuted, canMark: false };
        case 'active': return { label: 'Active', color: COLORS.green, canMark: true };
        case 'late': return { label: 'Late', color: COLORS.warning, canMark: true };
        case 'ended': return { label: 'Ended', color: COLORS.error, canMark: true }; // Can still mark as late
        default: return { label: '', color: COLORS.textMuted, canMark: false };
    }
}

// ─── Prayer Row Component ──────────────────────────────────────
function PrayerRow({
    prayer,
    timings,
    log,
    onMark,
    isMarking,
}: {
    prayer: PrayerName;
    timings: PrayerDayTimings;
    log: PrayerLog | undefined;
    onMark: (prayer: PrayerName) => void;
    isMarking: boolean;
}) {
    const windowStatus = getPrayerWindowStatus(timings, prayer);
    const windowInfo = getWindowInfo(windowStatus);
    const isCompleted = !!log;
    const statusInfo = isCompleted ? getStatusInfo(log.status) : null;

    return (
        <View style={[styles.prayerRow, isCompleted && styles.prayerRowCompleted]}>
            {/* Left: Emoji + Name + Time */}
            <View style={styles.prayerInfo}>
                <Text style={styles.prayerEmoji}>{PRAYER_EMOJI[prayer]}</Text>
                <View>
                    <Text style={[styles.prayerName, isCompleted && styles.prayerNameCompleted]}>
                        {PRAYER_LABELS[prayer]}
                    </Text>
                    <Text style={styles.prayerTime}>
                        {formatTime(timings[prayer])}
                    </Text>
                </View>
            </View>

            {/* Right: Status badge or Mark button */}
            {isCompleted ? (
                <View style={[styles.statusBadge, { backgroundColor: statusInfo!.color + '20' }]}>
                    <Text style={styles.statusEmoji}>{statusInfo!.emoji}</Text>
                    <Text style={[styles.statusText, { color: statusInfo!.color }]}>
                        {statusInfo!.label}
                    </Text>
                    <Text style={[styles.statusPoints, { color: statusInfo!.color }]}>
                        {statusInfo!.points}
                    </Text>
                </View>
            ) : windowInfo.canMark ? (
                <TouchableOpacity
                    style={styles.markButton}
                    onPress={() => onMark(prayer)}
                    disabled={isMarking}
                    activeOpacity={0.7}
                >
                    {isMarking ? (
                        <ActivityIndicator color={COLORS.textInverse} size="small" />
                    ) : (
                        <Text style={styles.markButtonText}>Mark ✓</Text>
                    )}
                </TouchableOpacity>
            ) : (
                <View style={styles.upcomingBadge}>
                    <Text style={styles.upcomingText}>{windowInfo.label}</Text>
                </View>
            )}
        </View>
    );
}

// ─── Main Home Screen ──────────────────────────────────────────
export default function HomeScreen() {
    const { profile } = useAuth();
    const today = useMemo(() => new Date(), []);
    const dateStr = toDateString(today);

    // Data hooks
    const { data: timings, isLoading: timingsLoading, refetch: refetchTimings } = usePrayerTimes(today);
    const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = usePrayerLogs(today);
    const { data: fastingLog, refetch: refetchFasting } = useFastingStatus(today);
    const { data: totals } = useHasanatTotals();

    // Mutations
    const markPrayer = useMarkPrayer();
    const setFasting = useSetFasting();
    const breakFast = useBreakFast();

    const [markingPrayer, setMarkingPrayer] = useState<PrayerName | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Create a log lookup map: prayer → log
    const logMap = useMemo(() => {
        const map: Partial<Record<PrayerName, PrayerLog>> = {};
        logs?.forEach((l) => { map[l.prayer] = l; });
        return map;
    }, [logs]);

    // Count completed prayers
    const completedCount = logs?.length || 0;

    // Today's points
    const todayPoints = logs?.reduce((sum, l) => sum + l.points_awarded, 0) || 0;

    // Handle mark prayer
    const handleMarkPrayer = useCallback(async (prayer: PrayerName) => {
        setMarkingPrayer(prayer);
        try {
            const result = await markPrayer.mutateAsync({ prayer, date: dateStr });
            const statusInfo = getStatusInfo(result.status);
            Alert.alert(
                `${PRAYER_LABELS[prayer]} Marked ${statusInfo.emoji}`,
                `${statusInfo.label} — ${statusInfo.points} points!`,
            );
        } catch (error: any) {
            const msg = error.message || 'Failed to mark prayer.';
            if (msg.includes('already')) {
                Alert.alert('Already Marked', `${PRAYER_LABELS[prayer]} has already been marked for today.`);
            } else {
                Alert.alert('Error', msg);
            }
        } finally {
            setMarkingPrayer(null);
        }
    }, [markPrayer, dateStr]);

    // Handle fasting toggle
    const handleFastingToggle = useCallback(async () => {
        if (fastingLog && fastingLog.is_fasting && !fastingLog.broken) {
            // Currently fasting → break fast
            Alert.alert(
                'Break Fast?',
                `This will revoke your ${POINTS.FASTING_BONUS} fasting bonus points for today.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Break Fast',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await breakFast.mutateAsync({ date: dateStr });
                            } catch (error: any) {
                                Alert.alert('Error', error.message || 'Failed to break fast.');
                            }
                        },
                    },
                ],
            );
        } else if (!fastingLog) {
            // Not fasting → set fasting
            try {
                await setFasting.mutateAsync({ isFasting: true, date: dateStr });
                Alert.alert('Fasting Today! 🌙', `+${POINTS.FASTING_BONUS} bonus points earned.`);
            } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to set fasting status.');
            }
        }
    }, [fastingLog, dateStr, breakFast, setFasting]);

    // Pull-to-refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refetchTimings(), refetchLogs(), refetchFasting()]);
        setRefreshing(false);
    }, [refetchTimings, refetchLogs, refetchFasting]);

    const isLoading = timingsLoading || logsLoading;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.accent}
                    />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>
                            Assalamu Alaikum{profile?.display_name ? `, ${profile.display_name}` : ''} 🕌
                        </Text>
                        <Text style={styles.dateText}>
                            {today.toLocaleDateString(undefined, {
                                weekday: 'long', month: 'long', day: 'numeric',
                            })}
                        </Text>
                    </View>
                </View>

                {/* Points Summary Card */}
                <View style={styles.pointsCard}>
                    <View style={styles.pointsRow}>
                        <View style={styles.pointsItem}>
                            <Text style={styles.pointsValue}>{todayPoints}</Text>
                            <Text style={styles.pointsLabel}>Today</Text>
                        </View>
                        <View style={styles.pointsDivider} />
                        <View style={styles.pointsItem}>
                            <Text style={styles.pointsValue}>{completedCount}/5</Text>
                            <Text style={styles.pointsLabel}>Prayers</Text>
                        </View>
                        <View style={styles.pointsDivider} />
                        <View style={styles.pointsItem}>
                            <Text style={styles.pointsValue}>{totals?.all_time_total || 0}</Text>
                            <Text style={styles.pointsLabel}>All Time</Text>
                        </View>
                    </View>
                </View>

                {/* Prayer Checklist */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Today's Prayers</Text>

                    {isLoading ? (
                        <View style={styles.loadingCard}>
                            <ActivityIndicator color={COLORS.accent} size="large" />
                            <Text style={styles.loadingText}>Loading prayer times...</Text>
                        </View>
                    ) : timings ? (
                        <View style={styles.prayerList}>
                            {PRAYER_NAMES.map((prayer) => (
                                <PrayerRow
                                    key={prayer}
                                    prayer={prayer}
                                    timings={timings}
                                    log={logMap[prayer]}
                                    onMark={handleMarkPrayer}
                                    isMarking={markingPrayer === prayer}
                                />
                            ))}
                        </View>
                    ) : (
                        <View style={styles.errorCard}>
                            <Text style={styles.errorText}>
                                Could not load prayer times. Please check your location settings.
                            </Text>
                            <TouchableOpacity style={styles.retryButton} onPress={() => refetchTimings()}>
                                <Text style={styles.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Fasting Card */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Fasting</Text>
                    <TouchableOpacity
                        style={[
                            styles.fastingCard,
                            fastingLog?.is_fasting && !fastingLog.broken && styles.fastingCardActive,
                        ]}
                        onPress={handleFastingToggle}
                        disabled={fastingLog?.broken || setFasting.isPending || breakFast.isPending}
                        activeOpacity={0.7}
                    >
                        <View style={styles.fastingContent}>
                            <Text style={styles.fastingEmoji}>
                                {fastingLog?.broken ? '🍽️' : fastingLog?.is_fasting ? '🌙' : '☀️'}
                            </Text>
                            <View style={styles.fastingInfo}>
                                <Text style={styles.fastingTitle}>
                                    {fastingLog?.broken
                                        ? 'Fast Broken'
                                        : fastingLog?.is_fasting
                                            ? 'Fasting Today'
                                            : 'Not Fasting'}
                                </Text>
                                <Text style={styles.fastingSubtitle}>
                                    {fastingLog?.broken
                                        ? 'Fasting bonus revoked for today'
                                        : fastingLog?.is_fasting
                                            ? `+${POINTS.FASTING_BONUS} bonus points earned`
                                            : 'Tap to declare fasting for today'}
                                </Text>
                            </View>
                        </View>

                        {!fastingLog?.broken && (
                            <View style={[
                                styles.fastingToggle,
                                fastingLog?.is_fasting && styles.fastingToggleActive,
                            ]}>
                                <Text style={styles.fastingToggleText}>
                                    {fastingLog?.is_fasting ? 'Break' : 'Fast'}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 32,
    },
    header: {
        paddingTop: 12,
        paddingBottom: 20,
    },
    greeting: {
        fontFamily: 'Inter_700Bold',
        fontSize: 22,
        color: COLORS.textPrimary,
        letterSpacing: -0.5,
    },
    dateText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 4,
    },

    // Points Summary
    pointsCard: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 24,
    },
    pointsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pointsItem: {
        flex: 1,
        alignItems: 'center',
    },
    pointsValue: {
        fontFamily: 'Inter_700Bold',
        fontSize: 24,
        color: COLORS.accent,
    },
    pointsLabel: {
        fontFamily: 'Inter_400Regular',
        fontSize: 12,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
    pointsDivider: {
        width: 1,
        height: 32,
        backgroundColor: COLORS.border,
    },

    // Sections
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 18,
        color: COLORS.textPrimary,
        marginBottom: 12,
    },

    // Prayer List
    prayerList: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
    },
    prayerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    prayerRowCompleted: {
        backgroundColor: COLORS.greenGlow,
    },
    prayerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    prayerEmoji: {
        fontSize: 24,
    },
    prayerName: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    prayerNameCompleted: {
        color: COLORS.green,
    },
    prayerTime: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 1,
    },

    // Status Badge
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    statusEmoji: {
        fontSize: 12,
    },
    statusText: {
        fontFamily: 'Inter_500Medium',
        fontSize: 12,
    },
    statusPoints: {
        fontFamily: 'Inter_700Bold',
        fontSize: 12,
    },

    // Mark Button
    markButton: {
        backgroundColor: COLORS.accent,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 8,
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    markButtonText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
        color: COLORS.textInverse,
    },

    // Upcoming Badge
    upcomingBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: COLORS.bgElevated,
    },
    upcomingText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 12,
        color: COLORS.textMuted,
    },

    // Fasting Card
    fastingCard: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    fastingCardActive: {
        borderColor: COLORS.accent,
        backgroundColor: COLORS.accentGlow,
    },
    fastingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    fastingEmoji: {
        fontSize: 28,
    },
    fastingInfo: {
        flex: 1,
    },
    fastingTitle: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    fastingSubtitle: {
        fontFamily: 'Inter_400Regular',
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    fastingToggle: {
        backgroundColor: COLORS.bgElevated,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    fastingToggleActive: {
        backgroundColor: COLORS.accentDark,
        borderColor: COLORS.accent,
    },
    fastingToggleText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 13,
        color: COLORS.textPrimary,
    },

    // Loading & Error
    loadingCard: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 40,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    errorCard: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: COLORS.error,
        alignItems: 'center',
        gap: 12,
    },
    errorText: {
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
    },
    retryButton: {
        backgroundColor: COLORS.accent,
        borderRadius: 8,
        paddingHorizontal: 20,
        paddingVertical: 8,
    },
    retryText: {
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
        color: COLORS.textInverse,
    },
});
