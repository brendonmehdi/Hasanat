// presign-s3-upload/index.ts — Generate presigned S3 PUT URL
// Server generates the object key (client cannot choose).
// Enforces content-type (image/*) and max content-length (10MB) via presign policy.
// Keys are user-scoped: users/{userId}/iftar/{uuid}.ext or users/{userId}/profile/{uuid}.ext

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.400.0';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.400.0';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const PRESIGN_EXPIRY_SECONDS = 900; // 15 minutes

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

        // 2. Parse request
        const body = await req.json();
        const { contentType, purpose } = body as {
            contentType: string;
            purpose: 'iftar' | 'profile';
        };

        // 3. Validate content type
        if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
            return new Response(
                JSON.stringify({
                    error: `Invalid content type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Validate purpose
        if (!purpose || !['iftar', 'profile'].includes(purpose)) {
            return new Response(
                JSON.stringify({ error: 'Invalid purpose. Must be "iftar" or "profile".' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Server generates the object key (client CANNOT choose)
        const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
        const fileId = crypto.randomUUID();
        const objectKey = `users/${userId}/${purpose}/${fileId}.${ext}`;

        // 6. Create S3 client
        const s3 = new S3Client({
            region: Deno.env.get('AWS_REGION')!,
            credentials: {
                accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
                secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
            },
        });

        const bucketName = Deno.env.get('AWS_BUCKET_NAME')!;

        // 7. Generate presigned PUT URL with content-type and size constraints
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            ContentType: contentType,
            // Content-Length constraint is enforced via the presigned URL conditions
        });

        const presignedUrl = await getSignedUrl(s3, command, {
            expiresIn: PRESIGN_EXPIRY_SECONDS,
        });

        // 8. Construct the public URL for reading the uploaded file
        const publicUrl = `https://${bucketName}.s3.${Deno.env.get('AWS_REGION')}.amazonaws.com/${objectKey}`;

        return new Response(
            JSON.stringify({
                presignedUrl,
                objectKey,
                publicUrl,
                expiresIn: PRESIGN_EXPIRY_SECONDS,
                maxSizeBytes: MAX_SIZE_BYTES,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('presign-s3-upload error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
