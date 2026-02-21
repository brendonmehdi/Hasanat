// award-prayer-hasanat/index.ts — Mark a prayer as prayed + award points
// Points logic:
//   +10: Prayed within on-time window (default 30 min after adhan)
//   +5:  Prayed after on-time window but before prayer end time
//   0:   Missed (handled by missed-prayer-job cron, not this function)
// Idempotency enforced at DB level via UNIQUE(user_id, date, prayer) on prayer_logs
// and UNIQUE(idempotency_key) on hasanat_ledger.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
    sendPushNotifications,
    buildFriendPushMessages,
    getFriendPushTokens,
} from '../_shared/push.ts';

const POINTS_ON_TIME = 10;
const POINTS_LATE = 5;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. Auth check
        const { userId, error: authError } = await verifyAuth(req);
        if (authError) {
            return new Response(JSON.stringify({ error: authError }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 2. Rate limit
        const allowed = await checkRateLimit(userId, RATE_LIMITS.prayerMark);
        if (!allowed) {
            return new Response(JSON.stringify({ error: 'Rate limited' }), {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 3. Parse request
        const body = await req.json();
        const { prayer, date } = body as { prayer: string; date: string };

        // Validate prayer name
        const validPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        if (!prayer || !validPrayers.includes(prayer)) {
            return new Response(
                JSON.stringify({ error: `Invalid prayer. Must be one of: ${validPrayers.join(', ')}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate date format
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return new Response(
                JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const admin = createAdminClient();
        const now = new Date();

        // 4. Get prayer day timings for this user+date
        const { data: timings, error: timingsError } = await admin
            .from('prayer_day_timings')
            .select('*')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        if (timingsError || !timings) {
            return new Response(
                JSON.stringify({ error: 'Prayer timings not found for this date. Please fetch timings first.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Get prayer time and end time
        const prayerTime = new Date(timings[prayer]);
        const endTimeMap: Record<string, string> = {
            fajr: 'sunrise',
            dhuhr: 'asr',
            asr: 'maghrib',
            maghrib: 'isha',
            isha: 'midnight',
        };
        const prayerEndTime = new Date(timings[endTimeMap[prayer]]);

        // 6. Check if prayer window has passed (can't mark after end time)
        if (now > prayerEndTime) {
            return new Response(
                JSON.stringify({ error: 'Prayer window has ended. This prayer is now missed.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 7. Can't mark before adhan
        if (now < prayerTime) {
            return new Response(
                JSON.stringify({ error: 'Prayer time has not started yet.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 8. Get user settings for on-time window
        const { data: settings } = await admin
            .from('user_settings')
            .select('on_time_window_minutes')
            .eq('user_id', userId)
            .single();

        const onTimeWindow = settings?.on_time_window_minutes ?? 30;

        // 9. Determine on-time vs late
        const onTimeDeadline = new Date(prayerTime.getTime() + onTimeWindow * 60 * 1000);
        const isOnTime = now <= onTimeDeadline;
        const points = isOnTime ? POINTS_ON_TIME : POINTS_LATE;
        const status = isOnTime ? 'on_time' : 'late';
        const action = isOnTime ? 'prayer_on_time' : 'prayer_late';

        // 10. Build idempotency key
        const idempotencyKey = `${userId}:${date}:${prayer}:${action}`;

        // 11. Insert prayer log (DB enforces UNIQUE(user_id, date, prayer))
        const { error: logError } = await admin
            .from('prayer_logs')
            .insert({
                user_id: userId,
                date,
                prayer,
                status,
                marked_at: now.toISOString(),
                prayer_time: prayerTime.toISOString(),
                prayer_end_time: prayerEndTime.toISOString(),
                points_awarded: points,
            });

        if (logError) {
            // Check if it's a unique violation (already logged)
            if (logError.code === '23505') {
                return new Response(
                    JSON.stringify({ error: 'Prayer already logged for this date.', code: 'ALREADY_LOGGED' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            throw logError;
        }

        // 12. Insert ledger transaction (DB enforces UNIQUE(idempotency_key))
        const { error: ledgerError } = await admin
            .from('hasanat_ledger')
            .insert({
                user_id: userId,
                action,
                points,
                date,
                prayer,
                idempotency_key: idempotencyKey,
                metadata: { marked_at: now.toISOString(), on_time_window: onTimeWindow },
            });

        if (ledgerError && ledgerError.code !== '23505') {
            throw ledgerError;
        }

        // 13. Audit event
        await admin.from('audit_events').insert({
            user_id: userId,
            event_type: 'prayer_marked',
            payload: { prayer, date, status, points },
        });

        // 14. Get user profile for friend notification
        const { data: profile } = await admin
            .from('profiles')
            .select('display_name, username')
            .eq('id', userId)
            .single();

        const displayName = profile?.display_name || profile?.username || 'A friend';

        // 15. Send privacy-safe friend notifications
        const tokens = await getFriendPushTokens(userId, 'friend_prayer');
        if (tokens.length > 0) {
            const messages = buildFriendPushMessages(
                tokens,
                'Hasanat 🕌',
                `${displayName} just prayed ${prayer.charAt(0).toUpperCase() + prayer.slice(1)}!`,
                { type: 'friend_prayer', prayer, date }
            );
            // Fire and forget — don't block response on push delivery
            sendPushNotifications(messages).catch(console.error);
        }

        return new Response(
            JSON.stringify({
                success: true,
                prayer,
                date,
                status,
                points,
                message: `${prayer} marked as ${status}. +${points} hasanat!`,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('award-prayer-hasanat error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
