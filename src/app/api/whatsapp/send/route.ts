import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// WhatsApp Business API — Send Message
// Uses Meta's Cloud API (graph.facebook.com)
// Supports: text messages, template messages
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const {
            to,
            message,
            phoneNumberId,
            accessToken,
            messageType = 'text', // 'text' | 'template'
            templateName,
            templateParams,
        } = await req.json();

        if (!to || !message || !phoneNumberId || !accessToken) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: to, message, phoneNumberId, accessToken' },
                { status: 400 }
            );
        }

        // Normalize phone: strip leading + and spaces, ensure 254XXXXXXXXX format
        const normalizedPhone = to
            .replace(/\s+/g, '')
            .replace(/^\+/, '')
            .replace(/^0/, '254');

        const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

        let body: any;

        if (messageType === 'template' && templateName) {
            // Template message (pre-approved by Meta)
            body = {
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'en' },
                    components: templateParams
                        ? [{ type: 'body', parameters: templateParams.map((p: string) => ({ type: 'text', text: p })) }]
                        : [],
                },
            };
        } else {
            // Free-form text message (only works within 24h window after tenant messages you)
            body = {
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                type: 'text',
                text: { body: message, preview_url: false },
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(body),
        });

        const result = await response.json();

        if (!response.ok) {
            const errMsg = result?.error?.message || result?.error?.error_data?.details || 'WhatsApp API error';
            console.error('WhatsApp API error:', JSON.stringify(result));
            return NextResponse.json({ success: false, error: errMsg, raw: result }, { status: response.status });
        }

        const messageId = result?.messages?.[0]?.id;
        return NextResponse.json({
            success: true,
            messageId,
            to: normalizedPhone,
            status: result?.messages?.[0]?.message_status || 'sent',
        });
    } catch (error: any) {
        console.error('WhatsApp send error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
