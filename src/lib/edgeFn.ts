// src/lib/edgeFn.ts — Direct fetch wrapper for Supabase Edge Functions
// Bypasses supabase.functions.invoke to get proper error messages from responses.
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Call a Supabase Edge Function via direct fetch.
 * Unlike supabase.functions.invoke, this extracts the actual error message
 * from the response body instead of returning a generic "non-2xx" error.
 * Also handles session refresh for expiring JWTs.
 */
export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body: object,
): Promise<T> {
    // Get a fresh access token
    let accessToken: string | undefined;

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        const expiresAt = session.expires_at ?? 0;
        const isExpiring = expiresAt * 1000 - Date.now() < 60_000;

        if (isExpiring) {
            const { data: { session: refreshed } } = await supabase.auth.refreshSession();
            accessToken = refreshed?.access_token;
        } else {
            accessToken = session.access_token;
        }
    }

    if (!accessToken) {
        throw new Error('Not authenticated — please log in again.');
    }

    const response = await fetch(
        `${SUPABASE_URL}/functions/v1/${functionName}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify(body),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        const errorMsg = data?.error || data?.message || JSON.stringify(data);
        console.error(`Edge Function ${functionName} failed (${response.status}):`, errorMsg);
        throw new Error(errorMsg);
    }

    if (data?.error) throw new Error(data.error);
    return data as T;
}
