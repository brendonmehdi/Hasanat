// create-iftar-post/index.ts — Create an iftar feed post
// Validates S3 key ownership (must start with users/{callerId}/).
// Only friends can see posts (enforced by RLS).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
    sendPushNotifications,
    buildFriendPushMessages,
    getFriendPushTokens,
} from '../_shared/push.ts';

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

        const allowed = await checkRateLimit(userId, RATE_LIMITS.postCreate);
        if (!allowed) {
            return new Response(JSON.stringify({ error: 'Rate limited. Max 5 posts per hour.' }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = await req.json();
        const { imageKey, imageUrl, caption } = body as {
            imageKey: string;
            imageUrl: string;
            caption?: string;
        };

        // Validate required fields
        if (!imageKey || !imageUrl) {
            return new Response(
                JSON.stringify({ error: 'imageKey and imageUrl are required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate key ownership — must start with {callerId}/
        const expectedPrefix = `${userId}/`;
        if (!imageKey.startsWith(expectedPrefix)) {
            return new Response(
                JSON.stringify({ error: 'Invalid image key. You can only use your own uploaded files.' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate caption length
        if (caption && caption.length > 500) {
            return new Response(
                JSON.stringify({ error: 'Caption must be 500 characters or less.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Insert post
        const { data: post, error: insertError } = await admin
            .from('iftar_posts')
            .insert({
                user_id: userId,
                image_key: imageKey,
                image_url: imageUrl,
                caption: caption || null,
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Audit
        await admin.from('audit_events').insert({
            user_id: userId,
            event_type: 'iftar_post_created',
            payload: { post_id: post.id },
        });

        // Notify friends
        const { data: profile } = await admin
            .from('profiles')
            .select('display_name, username')
            .eq('id', userId)
            .single();

        const displayName = profile?.display_name || profile?.username || 'A friend';
        const tokens = await getFriendPushTokens(userId, 'friend_iftar_post');

        if (tokens.length > 0) {
            const messages = buildFriendPushMessages(
                tokens,
                'Hasanat 🍽️',
                `${displayName} shared an iftar post!`,
                { type: 'iftar_post', postId: post.id }
            );
            sendPushNotifications(messages).catch(console.error);
        }

        return new Response(
            JSON.stringify({ success: true, post }),
            { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err: any) {
        console.error('create-iftar-post error:', err);
        const message = err?.message || err?.details || String(err);
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
