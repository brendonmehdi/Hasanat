// accept-friend-request/index.ts — Accept a pending friend request
// Creates friendship (ordered user_id_1 < user_id_2) and marks request as accepted.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { sendPushNotifications } from '../_shared/push.ts';

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

        const body = await req.json();
        const { requestId } = body as { requestId: string };

        if (!requestId) {
            return new Response(
                JSON.stringify({ error: 'requestId is required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Get the request — must be pending and addressed to current user
        const { data: request, error: fetchError } = await admin
            .from('friend_requests')
            .select('*')
            .eq('id', requestId)
            .eq('to_user_id', userId)
            .eq('status', 'pending')
            .single();

        if (fetchError || !request) {
            return new Response(
                JSON.stringify({ error: 'Friend request not found or already handled.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Mark as accepted
        const { error: updateError } = await admin
            .from('friend_requests')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Create friendship (ordered: user_id_1 < user_id_2)
        const id1 = request.from_user_id < userId ? request.from_user_id : userId;
        const id2 = request.from_user_id < userId ? userId : request.from_user_id;

        const { error: friendError } = await admin
            .from('friendships')
            .insert({ user_id_1: id1, user_id_2: id2 });

        if (friendError && friendError.code !== '23505') {
            throw friendError;
        }

        // Notify the sender
        const { data: acceptorProfile } = await admin
            .from('profiles')
            .select('display_name, username')
            .eq('id', userId)
            .single();

        const name = acceptorProfile?.display_name || acceptorProfile?.username || 'Someone';

        const { data: senderTokens } = await admin
            .from('device_tokens')
            .select('expo_push_token')
            .eq('user_id', request.from_user_id);

        if (senderTokens && senderTokens.length > 0) {
            const messages = senderTokens.map((t: { expo_push_token: string }) => ({
                to: t.expo_push_token,
                title: 'Hasanat 🤝',
                body: `${name} accepted your friend request!`,
                data: { type: 'friend_accepted' },
                sound: 'default' as const,
            }));
            sendPushNotifications(messages).catch(console.error);
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Friend request accepted.' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('accept-friend-request error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
