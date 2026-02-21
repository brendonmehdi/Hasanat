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
 * Uses direct fetch to get proper error messages from the function.
 */
export function useMarkPrayer() {
    const queryClient = useQueryClient();
    const session = useAuthStore((s) => s.session);

    return useMutation<AwardPrayerResponse, Error, { prayer: PrayerName; date: string }>({
        mutationFn: async ({ prayer, date }) => {
            // Force refresh session if token is expiring soon
            let accessToken: string | undefined;
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession?.access_token) {
                const expiresAt = currentSession.expires_at ?? 0;
                const isExpiring = expiresAt * 1000 - Date.now() < 60_000;
                if (isExpiring) {
                    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
                    accessToken = refreshed?.access_token;
                } else {
                    accessToken = currentSession.access_token;
                }
            }
            if (!accessToken) {
                throw new Error('Not authenticated — please log in again.');
            }

            const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
            const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

            const response = await fetch(
                `${supabaseUrl}/functions/v1/award-prayer-hasanat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': anonKey,
                    },
                    body: JSON.stringify({ prayer, date }),
                }
            );

            const body = await response.json();

            if (!response.ok) {
                const errorMsg = body?.error || body?.message || JSON.stringify(body);
                console.error(`Mark prayer failed (${response.status}):`, errorMsg);
                throw new Error(errorMsg);
            }

            if (body?.error) throw new Error(body.error);
            return body as AwardPrayerResponse;
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
