// friend-request/index.ts — Send a friend request
// Validates: not self, not already friends, not blocked, not already pending.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
    sendPushNotifications,
    buildFriendPushMessages,
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

        const allowed = await checkRateLimit(userId, RATE_LIMITS.friendRequest);
        if (!allowed) {
            return new Response(JSON.stringify({ error: 'Rate limited' }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = await req.json();
        const { toUsername } = body as { toUsername: string };

        if (!toUsername) {
            return new Response(
                JSON.stringify({ error: 'toUsername is required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Lookup target user by username_canonical
        const { data: targetUser, error: lookupError } = await admin
            .from('profiles')
            .select('id, username, display_name')
            .eq('username_canonical', toUsername.toLowerCase())
            .single();

        if (lookupError || !targetUser) {
            return new Response(
                JSON.stringify({ error: 'User not found.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const toUserId = targetUser.id;

        // Can't friend yourself
        if (userId === toUserId) {
            return new Response(
                JSON.stringify({ error: 'Cannot send a friend request to yourself.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if blocked in either direction
        const { data: blocked } = await admin.rpc('fn_is_blocked', {
            user_a: userId, user_b: toUserId,
        });
        if (blocked) {
            return new Response(
                JSON.stringify({ error: 'Cannot send friend request to this user.' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if already friends
        const { data: areFriends } = await admin.rpc('fn_are_friends', {
            user_a: userId, user_b: toUserId,
        });
        if (areFriends) {
            return new Response(
                JSON.stringify({ error: 'Already friends with this user.' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if pending request already exists (in either direction)
        const { data: existingRequest } = await admin
            .from('friend_requests')
            .select('id, from_user_id, status')
            .or(`and(from_user_id.eq.${userId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${userId})`)
            .eq('status', 'pending')
            .limit(1);

        if (existingRequest && existingRequest.length > 0) {
            return new Response(
                JSON.stringify({ error: 'A pending friend request already exists between you and this user.' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Insert friend request
        const { data: request, error: insertError } = await admin
            .from('friend_requests')
            .insert({
                from_user_id: userId,
                to_user_id: toUserId,
                status: 'pending',
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505') {
                return new Response(
                    JSON.stringify({ error: 'Friend request already sent.' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            throw insertError;
        }

        // Get sender profile for notification
        const { data: senderProfile } = await admin
            .from('profiles')
            .select('display_name, username')
            .eq('id', userId)
            .single();

        const senderName = senderProfile?.display_name || senderProfile?.username || 'Someone';

        // Send push to target user (privacy-safe: only name, no sensitive data)
        const { data: targetTokens } = await admin
            .from('device_tokens')
            .select('expo_push_token')
            .eq('user_id', toUserId);

        if (targetTokens && targetTokens.length > 0) {
            const messages = targetTokens.map((t: { expo_push_token: string }) => ({
                to: t.expo_push_token,
                title: 'Hasanat 🤝',
                body: `${senderName} sent you a friend request!`,
                data: { type: 'friend_request', requestId: request.id },
                sound: 'default' as const,
            }));
            sendPushNotifications(messages).catch(console.error);
        }

        return new Response(
            JSON.stringify({ success: true, requestId: request.id }),
            { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('friend-request error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
