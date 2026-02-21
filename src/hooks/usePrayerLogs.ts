// src/hooks/usePrayerLogs.ts — React Query hook for today's prayer logs
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { toDateString } from '../lib/aladhan';
import { invokeEdgeFunction } from '../lib/edgeFn';
import type { PrayerLog, PrayerName, AwardPrayerResponse } from '../types';

/**
 * Fetch today's prayer logs for the current user.
 */
export function usePrayerLogs(date: Date = new Date()) {
    const profile = useAuthStore((s) => s.profile);
    const dateStr = toDateString(date);

    return useQuery<PrayerLog[]>({
        queryKey: ['prayerLogs', profile?.id, dateStr],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('prayer_logs')
                .select('*')
                .eq('user_id', profile.id)
                .eq('date', dateStr)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return (data || []) as PrayerLog[];
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });
}

/**
 * Mark a prayer as completed. Calls the award-prayer-hasanat Edge Function.
 */
export function useMarkPrayer() {
    const queryClient = useQueryClient();
    const session = useAuthStore((s) => s.session);

    return useMutation<AwardPrayerResponse, Error, { prayer: PrayerName; date: string }>({
        mutationFn: async ({ prayer, date }) => {
            return invokeEdgeFunction<AwardPrayerResponse>('award-prayer-hasanat', { prayer, date });
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['prayerLogs', session?.user?.id, variables.date],
            });
            queryClient.invalidateQueries({ queryKey: ['hasanatTotals'] });
        },
    });
}
