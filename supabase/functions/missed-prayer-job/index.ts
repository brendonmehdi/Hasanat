// missed-prayer-job/index.ts — CRON-AUTHORITATIVE missed prayer detection
// Runs every 15 min via Supabase scheduled Edge Function.
// This is the SOURCE OF TRUTH for missed prayer detection (not the client).
//
// Logic:
// For each user with prayer_day_timings for today:
//   For each prayer (fajr, dhuhr, asr, maghrib, isha):
//     If NOW > prayer_end_time AND no prayer_log exists for (user, date, prayer):
//       → Create prayer_log with status='missed', points_awarded=0
//       → Create hasanat_ledger entry with action='missed_prayer', points=0
//       → Send privacy-safe push notification to accepted friends
//
// Prayer End Windows:
//   Fajr    → Sunrise
//   Dhuhr   → Asr start
//   Asr     → Maghrib start
//   Maghrib → Isha start
//   Isha    → Islamic Midnight (midpoint Sunset↔Fajr, stored from AlAdhan)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/auth.ts';
import {
    sendPushNotifications,
    buildFriendPushMessages,
    getFriendPushTokens,
} from '../_shared/push.ts';

const PRAYER_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

// Maps each prayer to the column that contains its end time
const PRAYER_END_MAP: Record<string, string> = {
    fajr: 'sunrise',
    dhuhr: 'asr',
    asr: 'maghrib',
    maghrib: 'isha',
    isha: 'midnight',
};

serve(async (req: Request) => {
    // Accept both OPTIONS (CORS) and POST (cron trigger)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Verify this is being called by the scheduler (Authorization header with service role)
    // The scheduler uses the service role key automatically.
    // For extra safety, we could check a custom header too, but service_role auth is sufficient.

    const admin = createAdminClient();
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[missed-prayer-job] Running at ${now.toISOString()} for date ${todayDate}`);

    try {
        // 1. Get ALL prayer_day_timings for today
        const { data: allTimings, error: timingsError } = await admin
            .from('prayer_day_timings')
            .select('*')
            .eq('date', todayDate);

        if (timingsError) {
            console.error('Error fetching timings:', timingsError);
            return new Response(JSON.stringify({ error: 'Failed to fetch timings' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!allTimings || allTimings.length === 0) {
            console.log('[missed-prayer-job] No timings found for today. Nothing to process.');
            return new Response(JSON.stringify({ processed: 0 }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let totalMissed = 0;
        let totalProcessed = 0;

        // 2. For each user's timings, check each prayer
        for (const timings of allTimings) {
            const userId = timings.user_id;

            for (const prayer of PRAYER_NAMES) {
                const endTimeCol = PRAYER_END_MAP[prayer];
                const prayerEndTime = new Date(timings[endTimeCol]);

                // Only process if the end window has passed
                if (now <= prayerEndTime) continue;

                // Check if prayer_log already exists for this user+date+prayer
                const { data: existingLog } = await admin
                    .from('prayer_logs')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('date', todayDate)
                    .eq('prayer', prayer)
                    .limit(1);

                // If log exists (prayed or already marked missed), skip
                if (existingLog && existingLog.length > 0) continue;

                // 3. No log exists and window has passed → MISSED
                totalProcessed++;

                const prayerTime = new Date(timings[prayer]);

                // Insert prayer_log as missed (DB unique constraint prevents duplicates)
                const { error: logError } = await admin
                    .from('prayer_logs')
                    .insert({
                        user_id: userId,
                        date: todayDate,
                        prayer,
                        status: 'missed',
                        marked_at: null, // not prayed
                        prayer_time: prayerTime.toISOString(),
                        prayer_end_time: prayerEndTime.toISOString(),
                        points_awarded: 0,
                    });

                if (logError) {
                    if (logError.code === '23505') {
                        // Race condition: already inserted between check and insert — safe to skip
                        continue;
                    }
                    console.error(`Error inserting missed prayer log for ${userId}/${prayer}:`, logError);
                    continue;
                }

                // Insert ledger entry (0 points, for audit)
                const idempotencyKey = `${userId}:${todayDate}:${prayer}:missed_prayer`;
                const { error: ledgerError } = await admin
                    .from('hasanat_ledger')
                    .insert({
                        user_id: userId,
                        action: 'missed_prayer',
                        points: 0,
                        date: todayDate,
                        prayer,
                        idempotency_key: idempotencyKey,
                        metadata: {
                            detected_at: now.toISOString(),
                            prayer_end_time: prayerEndTime.toISOString(),
                        },
                    });

                if (ledgerError && ledgerError.code !== '23505') {
                    console.error(`Error inserting missed ledger for ${userId}/${prayer}:`, ledgerError);
                }

                // Audit event
                await admin.from('audit_events').insert({
                    user_id: userId,
                    event_type: 'prayer_missed_detected',
                    payload: {
                        prayer,
                        date: todayDate,
                        prayer_end_time: prayerEndTime.toISOString(),
                        detected_at: now.toISOString(),
                    },
                });

                totalMissed++;

                // 4. Send privacy-safe push to accepted friends
                // Only sends to friends who have notify_missed_prayer enabled
                const { data: profile } = await admin
                    .from('profiles')
                    .select('display_name, username')
                    .eq('id', userId)
                    .single();

                const displayName = profile?.display_name || profile?.username || 'A friend';
                const prayerLabel = prayer.charAt(0).toUpperCase() + prayer.slice(1);

                const tokens = await getFriendPushTokens(userId, 'missed_prayer');
                if (tokens.length > 0) {
                    // Privacy-safe: only says "missed [prayer]", no location/details
                    const messages = buildFriendPushMessages(
                        tokens,
                        'Hasanat 🕌',
                        `${displayName} missed ${prayerLabel}. Send them encouragement!`,
                        { type: 'friend_missed_prayer', prayer, date: todayDate }
                    );
                    sendPushNotifications(messages).catch(console.error);
                }
            }
        }

        console.log(
            `[missed-prayer-job] Complete. Processed ${totalProcessed} checks, ${totalMissed} new missed prayers.`
        );

        return new Response(
            JSON.stringify({
                success: true,
                processed: totalProcessed,
                missed: totalMissed,
                timestamp: now.toISOString(),
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('[missed-prayer-job] Fatal error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
