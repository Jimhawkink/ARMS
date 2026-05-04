import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARMS - Africa's Talking SMS Send API Route
// File: src/app/api/sms/send/route.ts
//
// Sends a single SMS via Africa's Talking REST API.
// Supports both sandbox (testing) and live (production) modes.
// Called by the Messaging Hub when sending to tenants.
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { to, message, username, apiKey, senderId, isSandbox } = body;

        // ── Validate required fields ──────────────────────────────────────────
        if (!to || !message) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: to and message are required' },
                { status: 400 }
            );
        }

        if (!username || !apiKey) {
            return NextResponse.json(
                { success: false, error: 'SMS not configured. Please set your Africa\'s Talking API Key and Username in Settings → SMS & Notifications.' },
                { status: 400 }
            );
        }

        // ── Normalize phone number to +254XXXXXXXXX format ────────────────────
        const normalizePhone = (phone: string): string => {
            const cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
            if (cleaned.startsWith('+254') && cleaned.length === 13) return cleaned;
            if (cleaned.startsWith('254') && cleaned.length === 12) return `+${cleaned}`;
            if (cleaned.startsWith('0') && cleaned.length === 10) return `+254${cleaned.slice(1)}`;
            return cleaned;
        };
        const normalizedPhone = normalizePhone(to);

        // ── Choose sandbox vs live endpoint ───────────────────────────────────
        // Sandbox: messages show in AT simulator, free, no real SMS sent
        // Live:    real SMS delivered to phone, costs KES 0.50/msg
        const baseUrl = isSandbox
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';

        // ── Build form body ───────────────────────────────────────────────────
        const formParams: Record<string, string> = {
            username,
            to: normalizedPhone,
            message,
        };

        // Only include 'from' if a Sender ID is set AND we're in live mode
        // In sandbox mode, Sender ID is not needed and can cause errors
        if (senderId && senderId.trim() && !isSandbox) {
            formParams.from = senderId.trim();
        }

        // ── Call Africa's Talking API ─────────────────────────────────────────
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'apiKey': apiKey,
            },
            body: new URLSearchParams(formParams).toString(),
        });

        // ── Parse response ────────────────────────────────────────────────────
        const result = await response.json();

        // Log for debugging (visible in Vercel function logs)
        console.log('[ARMS SMS] Request:', { to: normalizedPhone, username, isSandbox, senderId });
        console.log('[ARMS SMS] Response:', JSON.stringify(result, null, 2));

        // ── Handle AT response structure ──────────────────────────────────────
        // AT returns: { SMSMessageData: { Message: '...', Recipients: [...] } }
        if (result.SMSMessageData?.Recipients?.length > 0) {
            const recipient = result.SMSMessageData.Recipients[0];

            // statusCode 101 = sent, 102 = queued — both are success
            const isSuccess =
                recipient.statusCode === 101 ||
                recipient.statusCode === 102 ||
                recipient.status === 'Success';

            // Parse cost — AT returns "KES 0.8000" format
            const costString = recipient.cost || '0';
            const costNumber = parseFloat(costString.replace(/[^0-9.]/g, '')) || 0;

            if (isSuccess) {
                return NextResponse.json({
                    success: true,
                    messageId: recipient.messageId,
                    cost: costNumber,
                    status: recipient.status,
                    phone: normalizedPhone,
                    mode: isSandbox ? 'sandbox' : 'live',
                });
            } else {
                // AT delivered a response but it's a failure status
                return NextResponse.json({
                    success: false,
                    error: `SMS failed with status: ${recipient.status} (code: ${recipient.statusCode})`,
                    details: recipient,
                });
            }
        }

        // ── Handle error responses ────────────────────────────────────────────
        // AT may return an error object instead of SMSMessageData
        if (result.error || result.errorMessage) {
            const errorMsg = result.error || result.errorMessage || 'Unknown AT error';
            console.error('[ARMS SMS] AT Error:', errorMsg);
            return NextResponse.json({
                success: false,
                error: errorMsg,
            });
        }

        // ── Fallback: unexpected response shape ───────────────────────────────
        console.error('[ARMS SMS] Unexpected response:', result);
        return NextResponse.json({
            success: false,
            error: result.SMSMessageData?.Message || 'Unexpected response from Africa\'s Talking',
            raw: result,
        });

    } catch (error: any) {
        // ── Network or parse errors ───────────────────────────────────────────
        console.error('[ARMS SMS] Caught error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Internal server error while sending SMS',
            },
            { status: 500 }
        );
    }
}