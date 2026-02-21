// _shared/push.ts — Expo Push Notification helper
// Sends push notifications server-side via Expo's push service.
// Handles token invalidation (DeviceNotRegistered → delete from DB).

import { createAdminClient } from './auth.ts';

interface PushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: string;
    badge?: number;
    channelId?: string;
}

interface PushTicket {
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send push notifications to multiple Expo push tokens.
 * Privacy-safe: only sends to accepted friends' tokens.
 * Automatically cleans up invalid tokens (DeviceNotRegistered).
 */
export async function sendPushNotifications(
    messages: PushMessage[]
): Promise<void> {
    if (messages.length === 0) return;

    // Expo accepts batches of up to 100
    const chunks = chunkArray(messages, 100);

    for (const chunk of chunks) {
        try {
            const response = await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(chunk),
            });

            if (!response.ok) {
                console.error('Expo push failed:', response.status, await response.text());
                continue;
            }

            const result = await response.json();
            const tickets: PushTicket[] = result.data || [];

            // Clean up invalid tokens
            await cleanupInvalidTokens(chunk, tickets);
        } catch (err) {
            console.error('Expo push error:', err);
        }
    }
}

/**
 * Build privacy-safe push messages for friend notifications.
 * Does NOT include sensitive personal data in the payload.
 */
export function buildFriendPushMessages(
    tokens: Array<{ token: string; friend_id: string }>,
    title: string,
    body: string,
    data?: Record<string, unknown>
): PushMessage[] {
    return tokens.map(({ token }) => ({
        to: token,
        title,
        body,
        data: data || {},
        sound: 'default',
    }));
}

/**
 * Fetch friend push tokens from DB using the helper function.
 */
export async function getFriendPushTokens(
    userId: string,
    notificationType: string
): Promise<Array<{ token: string; friend_id: string }>> {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('fn_get_friend_push_tokens', {
        target_user_id: userId,
        notification_type: notificationType,
    });

    if (error) {
        console.error('Error fetching friend push tokens:', error);
        return [];
    }

    return (data || []).map((row: { token: string; friend_id: string }) => ({
        token: row.token,
        friend_id: row.friend_id,
    }));
}

/**
 * Remove tokens that got DeviceNotRegistered errors from the database.
 */
async function cleanupInvalidTokens(
    messages: PushMessage[],
    tickets: PushTicket[]
): Promise<void> {
    const admin = createAdminClient();
    const tokensToRemove: string[] = [];

    for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (
            ticket.status === 'error' &&
            ticket.details?.error &&
            ['DeviceNotRegistered', 'InvalidCredentials'].includes(ticket.details.error)
        ) {
            tokensToRemove.push(messages[i].to);
        }
    }

    if (tokensToRemove.length > 0) {
        console.log(`Cleaning up ${tokensToRemove.length} invalid push tokens`);
        const { error } = await admin
            .from('device_tokens')
            .delete()
            .in('expo_push_token', tokensToRemove);

        if (error) {
            console.error('Error cleaning up tokens:', error);
        }
    }
}

function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
