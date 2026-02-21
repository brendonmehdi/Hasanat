// src/lib/s3.ts — S3 presigned upload helper
import { supabase } from './supabase';
import type { PresignResponse } from '../types';

/**
 * Get a presigned S3 URL for uploading, then upload the file.
 * Returns the object key for use in createIftarPost.
 */
export async function uploadToS3(
    fileUri: string,
    contentType: string,
    purpose: 'iftar' | 'profile',
): Promise<{ objectKey: string; publicUrl: string }> {
    // 1. Get presigned URL from Edge Function
    const { data, error } = await supabase.functions.invoke('presign-s3-upload', {
        body: { contentType, purpose },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const presign = data as PresignResponse;

    // 2. Upload file to S3 via presigned PUT URL
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();

    const uploadRes = await fetch(presign.presignedUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': contentType,
        },
        body: blob,
    });

    if (!uploadRes.ok) {
        throw new Error(`S3 upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    return {
        objectKey: presign.objectKey,
        publicUrl: presign.publicUrl,
    };
}
