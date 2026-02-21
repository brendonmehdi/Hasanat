// src/hooks/useFriends.ts — Friends system hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { Profile, FriendRequest } from '../types';

// ─── Types ─────────────────────────────────────────────────────
interface FriendWithProfile extends Profile {
    friendship_id: string;
}

interface PendingRequest extends FriendRequest {
    from_profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'profile_photo_url'>;
}

// ─── Queries ───────────────────────────────────────────────────

/**
 * Fetch current user's friends list with profiles.
 */
export function useFriendsList() {
    const profile = useAuthStore((s) => s.profile);

    return useQuery<FriendWithProfile[]>({
        queryKey: ['friends', profile?.id],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            // Get friend IDs via the DB function
            const { data: friendIds, error: idsError } = await supabase
                .rpc('fn_get_friend_ids', { target_user_id: profile.id });

            if (idsError) throw idsError;
            if (!friendIds || friendIds.length === 0) return [];

            // Fetch profiles for friends
            const ids = friendIds.map((r: any) => r.fn_get_friend_ids || r);
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('*')
                .in('id', ids);

            if (profilesError) throw profilesError;
            return (profiles || []) as FriendWithProfile[];
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 5,
    });
}

/**
 * Fetch pending friend requests (incoming).
 */
export function usePendingRequests() {
    const profile = useAuthStore((s) => s.profile);

    return useQuery<PendingRequest[]>({
        queryKey: ['pendingRequests', profile?.id],
        queryFn: async () => {
            if (!profile?.id) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('friend_requests')
                .select(`
                    *,
                    from_profile:profiles!friend_requests_from_user_id_fkey(id, username, display_name, profile_photo_url)
                `)
                .eq('to_user_id', profile.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []) as PendingRequest[];
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 2,
    });
}

// ─── Mutations ─────────────────────────────────────────────────

/**
 * Send a friend request by username.
 */
export function useSendFriendRequest() {
    const queryClient = useQueryClient();
    const session = useAuthStore((s) => s.session);

    return useMutation({
        mutationFn: async ({ username }: { username: string }) => {
            const { data, error } = await supabase.functions.invoke('friend-request', {
                body: { username },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friends'] });
            queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
        },
    });
}

/**
 * Accept a friend request.
 */
export function useAcceptFriendRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ requestId }: { requestId: string }) => {
            const { data, error } = await supabase.functions.invoke('accept-friend-request', {
                body: { requestId },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friends'] });
            queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        },
    });
}

/**
 * Decline a friend request.
 */
export function useDeclineFriendRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ requestId }: { requestId: string }) => {
            const { data, error } = await supabase.functions.invoke('decline-friend-request', {
                body: { requestId },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
        },
    });
}

/**
 * Remove a friend.
 */
export function useRemoveFriend() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ friendId }: { friendId: string }) => {
            const { data, error } = await supabase.functions.invoke('remove-friend', {
                body: { friendId },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friends'] });
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        },
    });
}

/**
 * Block a user.
 */
export function useBlockUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId }: { userId: string }) => {
            const { data, error } = await supabase.functions.invoke('block-user', {
                body: { userId },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friends'] });
            queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        },
    });
}
