// comment-on-post/index.ts — Comment on an iftar post
// Must be friends with post owner.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';

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

        const allowed = await checkRateLimit(userId, RATE_LIMITS.commentCreate);
        if (!allowed) {
            return new Response(JSON.stringify({ error: 'Rate limited' }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = await req.json();
        const { postId, content } = body as { postId: string; content: string };

        if (!postId || !content) {
            return new Response(
                JSON.stringify({ error: 'postId and content are required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (content.length < 1 || content.length > 300) {
            return new Response(
                JSON.stringify({ error: 'Comment must be between 1 and 300 characters.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Verify post exists
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
                    JSON.stringify({ error: 'You can only comment on friends\' posts.' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Insert comment
        const { data: comment, error: insertError } = await admin
            .from('post_comments')
            .insert({ post_id: postId, user_id: userId, content })
            .select()
            .single();

        if (insertError) throw insertError;

        return new Response(
            JSON.stringify({ success: true, comment }),
            { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('comment-on-post error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
