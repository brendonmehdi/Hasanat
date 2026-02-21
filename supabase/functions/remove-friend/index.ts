// remove-friend/index.ts — Remove an existing friendship

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
        const { friendId } = body as { friendId: string };

        if (!friendId) {
            return new Response(
                JSON.stringify({ error: 'friendId is required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // Order IDs to match storage
        const id1 = userId < friendId ? userId : friendId;
        const id2 = userId < friendId ? friendId : userId;

        const { error: deleteError, count } = await admin
            .from('friendships')
            .delete({ count: 'exact' })
            .eq('user_id_1', id1)
            .eq('user_id_2', id2);

        if (deleteError) throw deleteError;

        if (count === 0) {
            return new Response(
                JSON.stringify({ error: 'Friendship not found.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // No push on unfriend (privacy)

        return new Response(
            JSON.stringify({ success: true, message: 'Friend removed.' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('remove-friend error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
