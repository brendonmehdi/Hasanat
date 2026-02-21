// src/hooks/useLeaderboard.ts — Leaderboard hooks
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { LeaderboardEntry } from '../types';

/**
 * Fetch the weekly leaderboard (friends only).
 */
export function useWeeklyLeaderboard() {
    const profile = useAuthStore((s) => s.profile);

    return useQuery<LeaderboardEntry[]>({
        queryKey: ['leaderboard', 'weekly', profile?.id],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .rpc('fn_get_weekly_leaderboard', { target_user_id: profile.id });

            if (error) throw error;
            return (data || []) as LeaderboardEntry[];
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 5, // 5 min
    });
}

/**
 * Fetch the all-time leaderboard (friends only).
 */
export function useAllTimeLeaderboard() {
    const profile = useAuthStore((s) => s.profile);

    return useQuery<LeaderboardEntry[]>({
        queryKey: ['leaderboard', 'alltime', profile?.id],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .rpc('fn_get_alltime_leaderboard', { target_user_id: profile.id });

            if (error) throw error;
            return (data || []) as LeaderboardEntry[];
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 5,
    });
}
