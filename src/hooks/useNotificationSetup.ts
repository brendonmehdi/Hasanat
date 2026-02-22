// src/hooks/useNotificationSetup.ts — Lifecycle-aware push + prayer reminder setup
// Responsibilities:
//   1. Register Expo push token with Supabase when user is authenticated
//   2. Schedule local prayer reminders for today's prayer times
//   3. Re-register token & reschedule on app foreground
//   4. Reschedule when prayer times change (daily)

import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
    registerForPushNotifications,
    schedulePrayerReminder,
} from '../lib/notifications';
import type { PrayerDayTimings, PrayerName } from '../types';

const PRAYER_NAMES: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_LABELS: Record<PrayerName, string> = {
    fajr: 'Fajr',
    dhuhr: 'Dhuhr',
    asr: 'Asr',
    maghrib: 'Maghrib',
    isha: 'Isha',
};

// Stable prefix for prayer reminder identifiers
const PRAYER_REMINDER_PREFIX = 'prayer-reminder-';

/**
 * Cancel only prayer reminder notifications (targeted, not cancelAll).
 * Uses the identifier prefix to find and cancel them.
 */
async function cancelPrayerReminders(): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
        if (notif.identifier.startsWith(PRAYER_REMINDER_PREFIX)) {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
    }
}

/**
 * Schedule prayer reminders for today, replacing any existing ones.
 * Uses stable identifiers so duplicates are impossible.
 */
async function scheduleDailyPrayerReminders(
    timings: PrayerDayTimings,
    minutesBefore: number = 5,
): Promise<void> {
    // First cancel existing prayer reminders (targeted)
    await cancelPrayerReminders();

    const now = new Date();

    for (const prayer of PRAYER_NAMES) {
        const prayerTimeStr = timings[prayer];
        if (!prayerTimeStr) continue;

        const prayerTime = new Date(prayerTimeStr);
        const triggerDate = new Date(prayerTime.getTime() - minutesBefore * 60 * 1000);

        // Skip if already past
        if (triggerDate <= now) continue;

        // Use stable identifier: prefix + prayer name + date
        const dateStr = prayerTime.toISOString().split('T')[0];
        const identifier = `${PRAYER_REMINDER_PREFIX}${prayer}-${dateStr}`;

        try {
            await Notifications.scheduleNotificationAsync({
                identifier,
                content: {
                    title: `${PRAYER_LABELS[prayer]} is approaching 🕌`,
                    body: `${PRAYER_LABELS[prayer]} in ${minutesBefore} minutes. Get ready to pray!`,
                    sound: 'default',
                    data: { type: 'prayer_reminder', prayer },
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: triggerDate,
                },
            });
        } catch (err) {
            console.warn(`Failed to schedule ${prayer} reminder:`, err);
        }
    }
}

/**
 * Hook that handles all notification setup:
 * - Push token registration (remote notifications)
 * - Prayer reminder scheduling (local notifications)
 * - Lifecycle-aware: re-runs on app foreground
 *
 * @param userId — authenticated user's ID, or undefined if not authenticated
 * @param prayerTimings — today's prayer timings, or undefined if not loaded yet
 */
export function useNotificationSetup(
    userId: string | undefined,
    prayerTimings: PrayerDayTimings | undefined,
) {
    const lastRegisteredToken = useRef<string | null>(null);
    const lastPrayerDate = useRef<string | null>(null);

    // ─── 1. Push token registration ─────────────────────────────
    useEffect(() => {
        if (!userId) return;

        const register = async () => {
            const token = await registerForPushNotifications(userId);
            if (token) {
                lastRegisteredToken.current = token;
            }
        };

        register();

        // Re-register when app comes to foreground (token can rotate, permissions can change)
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                register();
            }
        });

        return () => subscription.remove();
    }, [userId]);

    // ─── 2. Prayer reminder scheduling ──────────────────────────
    useEffect(() => {
        if (!prayerTimings) return;

        // Use the fajr date as a stable key to detect day changes
        const prayerDate = prayerTimings.fajr
            ? new Date(prayerTimings.fajr).toISOString().split('T')[0]
            : null;

        // Only reschedule if date actually changed or first time
        if (prayerDate && prayerDate !== lastPrayerDate.current) {
            lastPrayerDate.current = prayerDate;
            scheduleDailyPrayerReminders(prayerTimings);
        }
    }, [prayerTimings]);
}
