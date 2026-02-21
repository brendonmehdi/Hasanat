// block-user/index.ts — Block a user (also removes friendship if exists)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';

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
        const { blockedUserId } = body as { blockedUserId: string };

        if (!blockedUserId) {
            return new Response(
                JSON.stringify({ error: 'blockedUserId is required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (userId === blockedUserId) {
            return new Response(
                JSON.stringify({ error: 'Cannot block yourself.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Insert block
        const { error: blockError } = await admin
            .from('blocks')
            .insert({ blocker_id: userId, blocked_id: blockedUserId });

        if (blockError) {
            if (blockError.code === '23505') {
                return new Response(
                    JSON.stringify({ error: 'User already blocked.' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            throw blockError;
        }

        // Remove any existing friendship
        const id1 = userId < blockedUserId ? userId : blockedUserId;
        const id2 = userId < blockedUserId ? blockedUserId : userId;

        await admin
            .from('friendships')
            .delete()
            .eq('user_id_1', id1)
            .eq('user_id_2', id2);

        // Remove any pending friend requests in either direction
        await admin
            .from('friend_requests')
            .delete()
            .or(`and(from_user_id.eq.${userId},to_user_id.eq.${blockedUserId}),and(from_user_id.eq.${blockedUserId},to_user_id.eq.${userId})`)
            .eq('status', 'pending');

        return new Response(
            JSON.stringify({ success: true, message: 'User blocked.' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('block-user error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
