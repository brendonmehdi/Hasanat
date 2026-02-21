// react-to-post/index.ts — React to an iftar post
// One reaction per user per post (UNIQUE constraint).
// Must be friends with post owner.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';

const VALID_REACTIONS = ['like', 'heart', 'mashallah', 'fire'];

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { userId, error: authError } = await verifyAuth(req);
        if (authError) {
            return new Response(JSON.stringify({ error: authError }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const allowed = await checkRateLimit(userId, RATE_LIMITS.reactionCreate);
        if (!allowed) {
            return new Response(JSON.stringify({ error: 'Rate limited' }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = await req.json();
        const { postId, reaction } = body as { postId: string; reaction: string };

        if (!postId) {
            return new Response(
                JSON.stringify({ error: 'postId is required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!reaction || !VALID_REACTIONS.includes(reaction)) {
            return new Response(
                JSON.stringify({ error: `Invalid reaction. Must be one of: ${VALID_REACTIONS.join(', ')}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Verify post exists and user is friends with owner (or is owner)
        const { data: post, error: postError } = await admin
            .from('iftar_posts')
            .select('id, user_id')
            .eq('id', postId)
            .single();

        if (postError || !post) {
            return new Response(
                JSON.stringify({ error: 'Post not found.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Must be friends with post owner (or own post)
        if (post.user_id !== userId) {
            const { data: areFriends } = await admin.rpc('fn_are_friends', {
                user_a: userId, user_b: post.user_id,
            });
            if (!areFriends) {
                return new Response(
                    JSON.stringify({ error: 'You can only react to friends\' posts.' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Upsert reaction (update if exists, insert if not)
        const { error: reactError } = await admin
            .from('post_reactions')
            .upsert(
                { post_id: postId, user_id: userId, reaction },
                { onConflict: 'post_id,user_id' }
            );

        if (reactError) throw reactError;

        return new Response(
            JSON.stringify({ success: true, reaction }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('react-to-post error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
