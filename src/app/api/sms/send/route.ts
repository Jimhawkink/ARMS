import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARMS - Africa's Talking SMS Send API Route
// File: src/app/api/sms/send/route.ts
//
// Sends a single SMS via Africa's Talking REST API.
// Supports both sandbox (testing) and live (production) modes.
//
// FIX 1: Added AbortController 15s timeout → button never gets stuck.
// FIX 2: Falls back to Vercel env vars if DB credentials are missing.
//
// Add these in Vercel → Project → Settings → Environment Variables:
//   AT_API_KEY    = your Africa's Talking LIVE API key
//   AT_USERNAME   = zawydcoebo
//   AT_SENDER_ID  = ARMS
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            to,
            message,
            username:  bodyUsername,
            apiKey:    bodyApiKey,
            senderId:  bodySenderId,
            isSandbox,
        } = body;

        // ── Validate required fields ──────────────────────────────────────────
        if (!to || !message) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: to and message are required' },
                { status: 400 }
            );
        }

        // ── Use passed credentials OR fall back to Vercel env vars ────────────
        // Priority: body (loaded from Supabase DB) → Vercel env vars → error
        const finalApiKey   = bodyApiKey   || process.env.AT_API_KEY   || '';
        const finalUsername = bodyUsername || process.env.AT_USERNAME  || '';
        const finalSenderId = bodySenderId || process.env.AT_SENDER_ID || 'ARMS';

        // Log which source was used — visible in Vercel Functions → Logs tab
        console.log('[ARMS SMS] Credential source:', {
            apiKeySource:   bodyApiKey   ? 'DB/body' : process.env.AT_API_KEY   ? 'env var' : 'MISSING',
            usernameSource: bodyUsername ? 'DB/body' : process.env.AT_USERNAME  ? 'env var' : 'MISSING',
            senderSource:   bodySenderId ? 'DB/body' : process.env.AT_SENDER_ID ? 'env var' : 'default ARMS',
            isSandbox,
        });

        if (!finalUsername || !finalApiKey) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "SMS not configured. Please set your Africa's Talking API Key and Username " +
                        'in Settings → Config tab, or add AT_API_KEY + AT_USERNAME to Vercel env vars.',
                },
                { status: 400 }
            );
        }

        // ── Normalize phone number to +254XXXXXXXXX ───────────────────────────
        const normalizePhone = (phone: string): string => {
            const cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
            if (cleaned.startsWith('+254') && cleaned.length === 13) return cleaned;
            if (cleaned.startsWith('254')  && cleaned.length === 12) return `+${cleaned}`;
            if (cleaned.startsWith('0')    && cleaned.length === 10) return `+254${cleaned.slice(1)}`;
            return cleaned;
        };
        const normalizedPhone = normalizePhone(to);

        // ── Choose sandbox vs live endpoint ───────────────────────────────────
        // Sandbox → free, goes to AT simulator, NOT a real phone
        // Live    → real SMS, costs ~KES 0.50/msg, needs account balance
        const baseUrl = isSandbox
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';

        // ── Build POST form body ──────────────────────────────────────────────
        const formParams: Record<string, string> = {
            username: finalUsername,
            to:       normalizedPhone,
            message,
        };

        // Only add 'from' (Sender ID) in LIVE mode — sandbox doesn't need it
        if (finalSenderId && finalSenderId.trim() && !isSandbox) {
            formParams.from = finalSenderId.trim();
        }

        // ── AbortController: hard 15-second timeout ───────────────────────────
        // Prevents the Vercel function from hanging and the UI button from
        // staying stuck at "Sending..." forever if AT is unreachable.
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 15_000);

        let response: Response;
        try {
            response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept':       'application/json',
                    'apiKey':       finalApiKey,
                },
                body:   new URLSearchParams(formParams).toString(),
                signal: controller.signal,
            });
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            const isTimeout = fetchError.name === 'AbortError';
            console.error('[ARMS SMS] Fetch error:', fetchError.message);
            return NextResponse.json(
                {
                    success: false,
                    error: isTimeout
                        ? 'SMS request timed out (15s). Africa\'s Talking may be unreachable. ' +
                          'Check your API key is correct and your AT account has balance.'
                        : `Network error reaching Africa's Talking: ${fetchError.message}`,
                },
                { status: 500 }
            );
        }
        clearTimeout(timeoutId);

        // ── Parse JSON response safely ────────────────────────────────────────
        let result: any;
        try {
            result = await response.json();
        } catch {
            console.error('[ARMS SMS] Failed to parse AT response. HTTP status:', response.status);
            return NextResponse.json(
                {
                    success: false,
                    error:
                        `Africa's Talking returned an invalid response (HTTP ${response.status}). ` +
                        'This usually means your API key is wrong or expired. ' +
                        'Go to africastalking.com → Settings → API Key to get a fresh one.',
                },
                { status: 500 }
            );
        }

        // Log full AT response for debugging in Vercel Functions → Logs
        console.log('[ARMS SMS] Request sent:', {
            to:       normalizedPhone,
            username: finalUsername,
            isSandbox,
            senderId: finalSenderId,
        });
        console.log('[ARMS SMS] AT Response:', JSON.stringify(result, null, 2));

        // ── Handle AT response — SMSMessageData structure ─────────────────────
        // AT returns: { SMSMessageData: { Message: '...', Recipients: [...] } }
        if (result.SMSMessageData?.Recipients?.length > 0) {
            const recipient = result.SMSMessageData.Recipients[0];

            // statusCode 101 = sent to carrier, 102 = queued — both are success
            const isSuccess =
                recipient.statusCode === 101 ||
                recipient.statusCode === 102 ||
                recipient.status === 'Success';

            // AT returns cost as string: "KES 0.8000" — parse to number
            const costString = recipient.cost || '0';
            const costNumber = parseFloat(costString.replace(/[^0-9.]/g, '')) || 0;

            if (isSuccess) {
                return NextResponse.json({
                    success:   true,
                    messageId: recipient.messageId,
                    cost:      costNumber,
                    status:    recipient.status,
                    phone:     normalizedPhone,
                    mode:      isSandbox ? 'sandbox' : 'live',
                });
            } else {
                // AT responded but with a failure status code
                return NextResponse.json({
                    success: false,
                    error:
                        `SMS failed — AT status: "${recipient.status}" (code ${recipient.statusCode}). ` +
                        'Common causes: insufficient balance, invalid phone number, or unregistered Sender ID.',
                    details: recipient,
                });
            }
        }

        // ── Handle top-level AT error responses ───────────────────────────────
        if (result.error || result.errorMessage) {
            const errorMsg = result.error || result.errorMessage || 'Unknown Africa\'s Talking error';
            console.error('[ARMS SMS] AT Error:', errorMsg);
            return NextResponse.json({
                success: false,
                error:   `Africa's Talking error: ${errorMsg}`,
            });
        }

        // ── Fallback: unexpected response shape ───────────────────────────────
        console.error('[ARMS SMS] Unexpected AT response shape:', result);
        return NextResponse.json({
            success: false,
            error:
                result.SMSMessageData?.Message ||
                "Unexpected response from Africa's Talking. Check Vercel → Functions → Logs for details.",
            raw: result,
        });

    } catch (error: any) {
        // ── Top-level catch ───────────────────────────────────────────────────
        console.error('[ARMS SMS] Unhandled error:', error);
        return NextResponse.json(
            {
                success: false,
                error:   error.message || 'Internal server error while sending SMS',
            },
            { status: 500 }
        );
    }
}