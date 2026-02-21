// src/lib/s3.ts — Upload helper using Supabase Storage
// Uses Supabase's built-in Storage instead of AWS S3 for reliability.
import { supabase } from './supabase';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Upload an image to Supabase Storage.
 * Returns the object path and public URL for use in createIftarPost.
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

    // 2. Get current user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        throw new Error('Not authenticated — please log in again.');
    }

    // 3. Generate object key
    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
    const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const objectKey = `${session.user.id}/${purpose}/${fileId}.${ext}`;

    // 4. Fetch file as blob
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();

    // 5. Upload to Supabase Storage
    const { data, error } = await supabase.storage
        .from('uploads')
        .upload(objectKey, blob, {
            contentType,
            upsert: false,
        });

    if (error) {
        console.error('Supabase Storage upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }

    // 6. Get public URL
    const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(data.path);

    return {
        objectKey: data.path,
        publicUrl: urlData.publicUrl,
    };
}
