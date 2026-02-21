// set-fasting-status/index.ts — Set daily fasting status (yes/no)
// Idempotent per user+date. Awards +20 if fasting=true.
// Runs daily regardless (not coupled to Ramadan).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
    sendPushNotifications,
    buildFriendPushMessages,
    getFriendPushTokens,
} from '../_shared/push.ts';

const FASTING_BONUS_POINTS = 20;

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

        // 2. Rate limit
        const allowed = await checkRateLimit(userId, RATE_LIMITS.fastingSet);
        if (!allowed) {
            return new Response(JSON.stringify({ error: 'Rate limited' }), {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 3. Parse request
        const body = await req.json();
        const { isFasting, date } = body as { isFasting: boolean; date: string };

        if (typeof isFasting !== 'boolean') {
            return new Response(
                JSON.stringify({ error: 'isFasting must be a boolean' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return new Response(
                JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();

        // 4. Check if already set for today (UNIQUE(user_id, date) enforced)
        const { data: existing } = await admin
            .from('fasting_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        if (existing) {
            return new Response(
                JSON.stringify({
                    error: 'Fasting status already set for today.',
                    code: 'ALREADY_SET',
                    currentStatus: existing,
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Insert fasting log
        const points = isFasting ? FASTING_BONUS_POINTS : 0;

        const { error: insertError } = await admin
            .from('fasting_logs')
            .insert({
                user_id: userId,
                date,
                is_fasting: isFasting,
                points_awarded: points,
            });

        if (insertError) {
            if (insertError.code === '23505') {
                return new Response(
                    JSON.stringify({ error: 'Fasting status already set.', code: 'ALREADY_SET' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            throw insertError;
        }

        // 6. Insert ledger transaction if fasting
        if (isFasting) {
            const idempotencyKey = `${userId}:${date}:fasting_bonus`;
            const { error: ledgerError } = await admin
                .from('hasanat_ledger')
                .insert({
                    user_id: userId,
                    action: 'fasting_bonus',
                    points: FASTING_BONUS_POINTS,
                    date,
                    idempotency_key: idempotencyKey,
                });

            if (ledgerError && ledgerError.code !== '23505') {
                throw ledgerError;
            }
        }

        // 7. Audit
        await admin.from('audit_events').insert({
            user_id: userId,
            event_type: 'fasting_status_set',
            payload: { date, is_fasting: isFasting, points },
        });

        // 8. Friend notifications (privacy-safe)
        const { data: profile } = await admin
            .from('profiles')
            .select('display_name, username')
            .eq('id', userId)
            .single();

        const displayName = profile?.display_name || profile?.username || 'A friend';
        const tokens = await getFriendPushTokens(userId, 'friend_fasting');

        if (tokens.length > 0) {
            const message = isFasting
                ? `${displayName} is fasting today! 🌙`
                : `${displayName} is not fasting today.`;

            const messages = buildFriendPushMessages(
                tokens,
                'Hasanat 🌙',
                message,
                { type: 'friend_fasting', date, is_fasting: isFasting }
            );
            sendPushNotifications(messages).catch(console.error);
        }

        return new Response(
            JSON.stringify({
                success: true,
                isFasting,
                date,
                points,
                message: isFasting ? `Fasting today! +${points} hasanat.` : 'Not fasting today.',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('set-fasting-status error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
