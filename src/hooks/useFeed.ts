// src/hooks/useFeed.ts — Iftar feed hooks
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { invokeEdgeFunction } from '../lib/edgeFn';
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
        staleTime: 0,
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
            return invokeEdgeFunction('react-to-post', { postId, reaction });
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
            return invokeEdgeFunction('comment-on-post', { postId, content });
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
        mutationFn: async ({ imageKey, imageUrl, caption }: { imageKey: string; imageUrl: string; caption?: string }) => {
            return invokeEdgeFunction('create-iftar-post', { imageKey, imageUrl, caption });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
        },
    });
}

/**
 * Delete an iftar post (own posts only).
 */
export function useDeletePost() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ postId, imageKey }: { postId: string; imageKey?: string }) => {
            // Delete image from Storage if we have the key
            if (imageKey) {
                await supabase.storage.from('uploads').remove([imageKey]);
            }

            // Delete the post from DB
            const { error } = await supabase
                .from('iftar_posts')
                .delete()
                .eq('id', postId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
        },
    });
}
