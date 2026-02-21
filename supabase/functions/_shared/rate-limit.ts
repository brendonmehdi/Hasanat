// _shared/rate-limit.ts — Rate limiting helper using DB function
import { createAdminClient } from './auth.ts';

interface RateLimitConfig {
    action: string;
    maxRequests?: number;   // default: 10
    windowSeconds?: number; // default: 60
}

/**
 * Check rate limit for a user+action combo.
 * Returns true if allowed, false if rate limited.
 * Uses the fn_check_rate_limit DB function for atomicity.
 */
export async function checkRateLimit(
    userId: string,
    config: RateLimitConfig
): Promise<boolean> {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('fn_check_rate_limit', {
        p_user_id: userId,
        p_action: config.action,
        p_max_requests: config.maxRequests ?? 10,
        p_window_seconds: config.windowSeconds ?? 60,
    });

    if (error) {
        console.error('Rate limit check error:', error);
        // Fail open on DB errors (don't block users due to infra issues)
        return true;
    }

    return data === true;
}

/**
 * Predefined rate limit configs for common actions
 */
export const RATE_LIMITS = {
    friendRequest: { action: 'friend_request', maxRequests: 10, windowSeconds: 3600 },
    postCreate: { action: 'post_create', maxRequests: 5, windowSeconds: 3600 },
    commentCreate: { action: 'comment_create', maxRequests: 30, windowSeconds: 3600 },
    reactionCreate: { action: 'reaction_create', maxRequests: 60, windowSeconds: 3600 },
    prayerMark: { action: 'prayer_mark', maxRequests: 20, windowSeconds: 3600 },
    fastingSet: { action: 'fasting_set', maxRequests: 10, windowSeconds: 3600 },
} as const;
