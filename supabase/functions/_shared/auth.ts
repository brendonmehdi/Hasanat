// _shared/auth.ts — Auth verification helper for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
    userId: string;
    error?: string;
}

/**
 * Verifies the JWT from the Authorization header and returns the user ID.
 * Returns an error string if authentication fails.
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return { userId: '', error: 'Missing Authorization header' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return { userId: '', error: 'Missing bearer token' };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { userId: '', error: error?.message || 'Invalid token' };
    }

    return { userId: user.id };
}

/**
 * Creates a Supabase admin client (service role) for server-side operations.
 * This bypasses RLS — use with care.
 */
export function createAdminClient() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
