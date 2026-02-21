// src/hooks/usePrayerLogs.ts — React Query hook for today's prayer logs
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { toDateString } from '../lib/aladhan';
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
            const { data, error } = await supabase.functions.invoke('award-prayer-hasanat', {
                body: { prayer, date },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            return data as AwardPrayerResponse;
        },
        onSuccess: (_data, variables) => {
            // Invalidate prayer logs to refetch after marking
            queryClient.invalidateQueries({
                queryKey: ['prayerLogs', session?.user?.id, variables.date],
            });
            // Also invalidate totals
            queryClient.invalidateQueries({ queryKey: ['hasanatTotals'] });
        },
    });
}
