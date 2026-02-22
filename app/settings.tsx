// app/settings.tsx — User settings screen
import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { COLORS } from '../src/constants';
import type { UserSettings } from '../src/types';

export default function SettingsScreen() {
    const router = useRouter();
    const profile = useAuthStore((s) => s.profile);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Fetch settings
    useEffect(() => {
        if (!profile?.id) return;
        (async () => {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', profile.id)
                .single();

            if (error && error.code === 'PGRST116') {
                // No settings row — use defaults
                setSettings({
                    user_id: profile.id,
                    on_time_window_minutes: 30,
                    quiet_hours_start: null,
                    quiet_hours_end: null,
                    notify_prayer_reminder: true,
                    notify_friend_prayer: true,
                    notify_friend_fasting: true,
                    notify_friend_iftar_post: false,
                    notify_missed_prayer: true,
                    created_at: '',
                    updated_at: '',
                });
            } else if (data) {
                setSettings(data as UserSettings);
            }
            setLoading(false);
        })();
    }, [profile?.id]);

    const toggleSetting = useCallback(async (key: keyof UserSettings, value: boolean) => {
        if (!settings || !profile?.id) return;

        const updated = { ...settings, [key]: value };
        setSettings(updated);

        setSaving(true);
        try {
            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: profile.id,
                    [key]: value,
                }, { onConflict: 'user_id' });

            if (error) throw error;
        } catch (err: any) {
            // Revert
            setSettings(settings);
            Alert.alert('Error', 'Failed to save setting.');
        } finally {
            setSaving(false);
        }
    }, [settings, profile?.id]);

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Notification Settings */}
                <Text style={styles.sectionTitle}>Notifications</Text>
                <View style={styles.card}>
                    <SettingRow
                        label="Prayer Reminders"
                        subtitle="Get notified when it's time to pray"
                        value={settings?.notify_prayer_reminder ?? true}
                        onToggle={(v) => toggleSetting('notify_prayer_reminder', v)}
                    />
                    <SettingRow
                        label="Missed Prayer Alert"
                        subtitle="Get alerted when a prayer window closes"
                        value={settings?.notify_missed_prayer ?? true}
                        onToggle={(v) => toggleSetting('notify_missed_prayer', v)}
                    />
                    <SettingRow
                        label="Friend Iftar Posts"
                        subtitle="When friends share iftar photos"
                        value={settings?.notify_friend_iftar_post ?? true}
                        onToggle={(v) => toggleSetting('notify_friend_iftar_post', v)}
                    />
                    <SettingRow
                        label="Friend Prayer Activity"
                        subtitle="When friends mark prayers"
                        value={settings?.notify_friend_prayer ?? false}
                        onToggle={(v) => toggleSetting('notify_friend_prayer', v)}
                    />
                    <SettingRow
                        label="Friend Fasting"
                        subtitle="When friends start fasting"
                        value={settings?.notify_friend_fasting ?? false}
                        onToggle={(v) => toggleSetting('notify_friend_fasting', v)}
                        isLast
                    />
                </View>

                {/* Prayer Settings */}
                <Text style={styles.sectionTitle}>Prayer</Text>
                <View style={styles.card}>
                    <View style={styles.infoRow}>
                        <View>
                            <Text style={styles.settingLabel}>On-Time Window</Text>
                            <Text style={styles.settingSubtitle}>
                                Minutes after adhan to count as "on time"
                            </Text>
                        </View>
                        <Text style={styles.valueText}>
                            {settings?.on_time_window_minutes ?? 30} min
                        </Text>
                    </View>
                </View>

                {/* Account Info */}
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.card}>
                    <View style={styles.infoRow}>
                        <Text style={styles.settingLabel}>Username</Text>
                        <Text style={styles.valueText}>@{profile?.username}</Text>
                    </View>
                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.settingLabel}>Timezone</Text>
                        <Text style={styles.valueText}>{profile?.timezone || '—'}</Text>
                    </View>
                </View>

                {saving && (
                    <Text style={styles.savingText}>Saving...</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Setting Row Component ─────────────────────────────────────
function SettingRow({
    label, subtitle, value, onToggle, isLast = false,
}: {
    label: string; subtitle: string; value: boolean;
    onToggle: (v: boolean) => void; isLast?: boolean;
}) {
    return (
        <View style={[styles.settingRow, !isLast && styles.settingRowBorder]}>
            <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{label}</Text>
                <Text style={styles.settingSubtitle}>{subtitle}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: COLORS.bgElevated, true: COLORS.accentDark }}
                thumbColor={value ? COLORS.accent : COLORS.textMuted}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12,
    },
    backBtn: { fontFamily: 'Inter_500Medium', fontSize: 16, color: COLORS.accent },
    title: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.textPrimary },

    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

    sectionTitle: {
        fontFamily: 'Inter_600SemiBold', fontSize: 16, color: COLORS.textPrimary,
        marginTop: 24, marginBottom: 10,
    },

    card: {
        backgroundColor: COLORS.bgCard, borderRadius: 16,
        borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    },

    settingRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
    },
    settingRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
    settingInfo: { flex: 1, marginRight: 12 },
    settingLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, color: COLORS.textPrimary },
    settingSubtitle: {
        fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2,
    },

    infoRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    valueText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.accent },

    savingText: {
        fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted,
        textAlign: 'center', marginTop: 12,
    },
});
