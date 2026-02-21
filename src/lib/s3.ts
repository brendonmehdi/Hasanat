// src/lib/s3.ts — Upload helper using Supabase Storage
// Uses React Native's native FormData for reliable file uploads.
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Upload an image to Supabase Storage.
 * Uses React Native FormData which natively handles local file:// URIs.
 * Returns the object path and public URL.
 */
export async function uploadToS3(
    fileUri: string,
    contentType: string,
    purpose: 'iftar' | 'profile',
): Promise<{ objectKey: string; publicUrl: string }> {
    // 1. Validate content type
    if (!ALLOWED_TYPES.includes(contentType)) {
        throw new Error(`Invalid content type. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }

    // 2. Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        throw new Error('Not authenticated — please log in again.');
    }

    // 3. Generate object key
    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
    const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const objectKey = `${session.user.id}/${purpose}/${fileId}.${ext}`;

    // 4. Build FormData with the file (React Native handles file:// URIs natively)
    const formData = new FormData();
    formData.append('', {
        uri: fileUri,
        name: `${fileId}.${ext}`,
        type: contentType,
    } as any);

    // 5. Upload via Supabase Storage REST API
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/uploads/${objectKey}`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: formData,
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error('Storage upload failed:', response.status, errBody);
        throw new Error(`Upload failed (${response.status}): ${errBody}`);
    }

    // 6. Get public URL
    const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(objectKey);

    return {
        objectKey,
        publicUrl: urlData.publicUrl,
    };
}
