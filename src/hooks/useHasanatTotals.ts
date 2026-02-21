// src/hooks/useHasanatTotals.ts — React Query hook for user points totals
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { HasanatTotals } from '../types';

/**
 * Fetch the current user's all-time Hasanat total.
 */
export function useHasanatTotals() {
    const profile = useAuthStore((s) => s.profile);

    return useQuery<HasanatTotals | null>({
        queryKey: ['hasanatTotals', profile?.id],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('hasanat_totals')
                .select('*')
                .eq('user_id', profile.id)
                .single();

            if (error && error.code === 'PGRST116') return null; // No row yet
            if (error) throw error;
            return data as HasanatTotals;
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 1, // 1 minute — changes on prayer mark
    });
}
