// decline-friend-request/index.ts — Decline a pending friend request

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
        const { requestId } = body as { requestId: string };

        if (!requestId) {
            return new Response(
                JSON.stringify({ error: 'requestId is required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Must be pending and addressed to current user
        const { data: request, error: fetchError } = await admin
            .from('friend_requests')
            .select('id')
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

        const { error: updateError } = await admin
            .from('friend_requests')
            .update({ status: 'declined', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // No push notification on decline (privacy)

        return new Response(
            JSON.stringify({ success: true, message: 'Friend request declined.' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('decline-friend-request error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
