// src/hooks/useFeed.ts — Iftar feed hooks
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { IftarPost, PostReaction, PostComment, ReactionType } from '../types';

// ─── Types ─────────────────────────────────────────────────────
interface FeedPost extends IftarPost {
    profile: { username: string; display_name: string | null; profile_photo_url: string | null };
    reactions: PostReaction[];
    comment_count: number;
}

// ─── Feed Query ────────────────────────────────────────────────

/**
 * Fetch friends' iftar posts with pagination.
 */
export function useFeed() {
    const profile = useAuthStore((s) => s.profile);
    const PAGE_SIZE = 20;

    return useInfiniteQuery<FeedPost[]>({
        queryKey: ['feed', profile?.id],
        queryFn: async ({ pageParam = 0 }) => {
            if (!profile?.id) throw new Error('Not authenticated');

            // Get friend IDs
            const { data: friendIds } = await supabase
                .rpc('fn_get_friend_ids', { target_user_id: profile.id });

            const ids = friendIds?.map((r: any) => r.fn_get_friend_ids || r) || [];
            // Include self in feed
            ids.push(profile.id);

            if (ids.length === 0) return [];

            const { data, error } = await supabase
                .from('iftar_posts')
                .select(`
                    *,
                    profile:profiles!iftar_posts_user_id_fkey(username, display_name, profile_photo_url),
                    reactions:post_reactions(*),
                    comments:post_comments(count)
                `)
                .in('user_id', ids)
                .order('created_at', { ascending: false })
                .range(pageParam as number, (pageParam as number) + PAGE_SIZE - 1);

            if (error) throw error;

            return (data || []).map((post: any) => ({
                ...post,
                comment_count: post.comments?.[0]?.count || 0,
            })) as FeedPost[];
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            if (lastPage.length < PAGE_SIZE) return undefined;
            return allPages.flat().length;
        },
        enabled: !!profile?.id,
        staleTime: 1000 * 60 * 2,
    });
}

// ─── Post Comments ─────────────────────────────────────────────

/**
 * Fetch comments for a specific post.
 */
export function usePostComments(postId: string) {
    return useQuery<(PostComment & { profile: { username: string; display_name: string | null } })[]>({
        queryKey: ['postComments', postId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('post_comments')
                .select(`
                    *,
                    profile:profiles!post_comments_user_id_fkey(username, display_name)
                `)
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as any;
        },
        enabled: !!postId,
        staleTime: 1000 * 60,
    });
}

// ─── Mutations ─────────────────────────────────────────────────

/**
 * React to a post.
 */
export function useReactToPost() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ postId, reaction }: { postId: string; reaction: ReactionType }) => {
            const { data, error } = await supabase.functions.invoke('react-to-post', {
                body: { postId, reaction },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
        },
    });
}

/**
 * Comment on a post.
 */
export function useCommentOnPost() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
            const { data, error } = await supabase.functions.invoke('comment-on-post', {
                body: { postId, content },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.invalidateQueries({ queryKey: ['postComments', variables.postId] });
        },
    });
}

/**
 * Create an iftar post.
 */
export function useCreatePost() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ imageKey, caption }: { imageKey: string; caption?: string }) => {
            const { data, error } = await supabase.functions.invoke('create-iftar-post', {
                body: { imageKey, caption },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
        },
    });
}
