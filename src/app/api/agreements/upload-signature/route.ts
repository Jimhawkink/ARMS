// ARMS — Admin Signature Upload API
// POST /api/agreements/upload-signature
// Accepts base64 image or multipart form data, stores in Supabase Storage
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get('content-type') || '';
        let imageBuffer: Buffer;
        let fileName = `admin_sig_${Date.now()}.png`;

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('file') as File;
            if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
            const arrayBuffer = await file.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            fileName = `admin_sig_${Date.now()}_${file.name}`;
        } else {
            // Expect JSON with base64
            const { base64, filename } = await req.json();
            if (!base64) return NextResponse.json({ error: 'No base64 data' }, { status: 400 });
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            if (filename) fileName = filename;
        }

        // Upload to Supabase Storage bucket 'arms-signatures'
        const { data, error } = await supabase.storage
            .from('arms-signatures')
            .upload(fileName, imageBuffer, {
                contentType: 'image/png',
                upsert: true,
            });

        if (error) {
            // Bucket may not exist — return a fallback message
            console.error('Storage upload error:', error.message);
            return NextResponse.json({
                error: `Upload failed: ${error.message}. Please create bucket 'arms-signatures' in Supabase Storage.`
            }, { status: 500 });
        }

        const { data: urlData } = supabase.storage.from('arms-signatures').getPublicUrl(fileName);
        return NextResponse.json({ url: urlData.publicUrl, path: data.path });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
