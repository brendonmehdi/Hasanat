// src/hooks/useFasting.ts — React Query hook for fasting status
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { toDateString } from '../lib/aladhan';
import type { FastingLog } from '../types';

/**
 * Fetch today's fasting log for the current user.
 */
export function useFastingStatus(date: Date = new Date()) {
    const profile = useAuthStore((s) => s.profile);
    const dateStr = toDateString(date);

    return useQuery<FastingLog | null>({
        queryKey: ['fastingLog', profile?.id, dateStr],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('fasting_logs')
                .select('*')
                .eq('user_id', profile.id)
                .eq('date', dateStr)
                .single();

            if (error && error.code === 'PGRST116') {
                // No rows — not fasting today
                return null;
            }
            if (error) throw error;
            return data as FastingLog;
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 2,
    });
}

/**
 * Set fasting status for today. Calls the set-fasting-status Edge Function.
 */
export function useSetFasting() {
    const queryClient = useQueryClient();
    const session = useAuthStore((s) => s.session);

    return useMutation({
        mutationFn: async ({ isFasting, date }: { isFasting: boolean; date: string }) => {
            const { data, error } = await supabase.functions.invoke('set-fasting-status', {
                body: { isFasting, date },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['fastingLog', session?.user?.id, variables.date],
            });
            queryClient.invalidateQueries({ queryKey: ['hasanatTotals'] });
        },
    });
}

/**
 * Break fast for today. Calls the break-fast Edge Function.
 */
export function useBreakFast() {
    const queryClient = useQueryClient();
    const session = useAuthStore((s) => s.session);

    return useMutation({
        mutationFn: async ({ date }: { date: string }) => {
            const { data, error } = await supabase.functions.invoke('break-fast', {
                body: { date },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['fastingLog', session?.user?.id, variables.date],
            });
            queryClient.invalidateQueries({ queryKey: ['hasanatTotals'] });
        },
    });
}
