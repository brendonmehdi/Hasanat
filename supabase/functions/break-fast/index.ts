// break-fast/index.ts — Revoke fasting bonus (-20 points)
// Idempotent: can only break fast once per day.
// Requires existing fasting_log with is_fasting=true and broken=false.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import {
    sendPushNotifications,
    buildFriendPushMessages,
    getFriendPushTokens,
} from '../_shared/push.ts';

const FASTING_REVOKE_POINTS = -20;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Auth
        const { userId, error: authError } = await verifyAuth(req);
        if (authError) {
            return new Response(JSON.stringify({ error: authError }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 2. Parse request
        const body = await req.json();
        const { date } = body as { date: string };

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return new Response(
                JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // 3. Check fasting log exists and is not already broken
        const { data: fastingLog, error: fetchError } = await admin
            .from('fasting_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        if (fetchError || !fastingLog) {
            return new Response(
                JSON.stringify({ error: 'No fasting log found for today. Set fasting status first.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!fastingLog.is_fasting) {
            return new Response(
                JSON.stringify({ error: 'You are not fasting today, so there is nothing to break.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (fastingLog.broken) {
            return new Response(
                JSON.stringify({ error: 'Fast already broken today.', code: 'ALREADY_BROKEN' }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const now = new Date();

        // 4. Mark as broken
        const { error: updateError } = await admin
            .from('fasting_logs')
            .update({
                broken: true,
                broken_at: now.toISOString(),
                points_awarded: 0, // net zero after revoke
                updated_at: now.toISOString(),
            })
            .eq('id', fastingLog.id);

        if (updateError) throw updateError;

        // 5. Insert revoke ledger entry
        const idempotencyKey = `${userId}:${date}:fasting_revoke`;
        const { error: ledgerError } = await admin
            .from('hasanat_ledger')
            .insert({
                user_id: userId,
                action: 'fasting_revoke',
                points: FASTING_REVOKE_POINTS,
                date,
                idempotency_key: idempotencyKey,
                metadata: { broken_at: now.toISOString() },
            });

        if (ledgerError && ledgerError.code !== '23505') {
            throw ledgerError;
        }

        // 6. Audit
        await admin.from('audit_events').insert({
            user_id: userId,
            event_type: 'fast_broken',
            payload: { date, broken_at: now.toISOString() },
        });

        // 7. Friend notifications
        const { data: profile } = await admin
            .from('profiles')
            .select('display_name, username')
            .eq('id', userId)
            .single();

        const displayName = profile?.display_name || profile?.username || 'A friend';
        const tokens = await getFriendPushTokens(userId, 'friend_fasting');

        if (tokens.length > 0) {
            const messages = buildFriendPushMessages(
                tokens,
                'Hasanat 🌙',
                `${displayName} broke their fast.`,
                { type: 'friend_break_fast', date }
            );
            sendPushNotifications(messages).catch(console.error);
        }

        return new Response(
            JSON.stringify({
                success: true,
                date,
                points: FASTING_REVOKE_POINTS,
                message: `Fast broken. ${FASTING_REVOKE_POINTS} hasanat.`,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('break-fast error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
