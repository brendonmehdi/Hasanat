// src/hooks/usePrayerTimes.ts — React Query hook for prayer times
import { useQuery } from '@tanstack/react-query';
import { getPrayerTimings, toDateString } from '../lib/aladhan';
import { useAuthStore } from '../stores/authStore';
import type { PrayerDayTimings } from '../types';

/**
 * Fetch and cache prayer times for a given date.
 * Uses profile location from auth store.
 * Stale for 24 hours (prayer times don't change within a day).
 */
export function usePrayerTimes(date: Date = new Date()) {
    const profile = useAuthStore((s) => s.profile);
    const dateStr = toDateString(date);

    return useQuery<PrayerDayTimings>({
        queryKey: ['prayerTimes', profile?.id, dateStr],
        queryFn: async () => {
            if (!profile?.id || !profile.latitude || !profile.longitude) {
                throw new Error('Profile with location required');
            }

            return getPrayerTimings(
                profile.id,
                date,
                profile.latitude,
                profile.longitude,
                profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            );
        },
        enabled: !!profile?.id && !!profile.latitude && !!profile.longitude,
        staleTime: 1000 * 60 * 60 * 24, // 24 hours — times don't change within a day
        gcTime: 1000 * 60 * 60 * 48,    // Keep in cache 48 hours
    });
}
