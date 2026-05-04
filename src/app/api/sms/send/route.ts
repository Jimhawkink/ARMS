import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARMS - Africa's Talking SMS Send API Route
// File: src/app/api/sms/send/route.ts
//
// Sends a single SMS via Africa's Talking REST API.
// Supports both sandbox (testing) and live (production) modes.
//
// IMPORTANT: Sandbox and Live use DIFFERENT API keys!
//   - Sandbox username is always "sandbox"
//   - Live username is your AT account username
//
// Add these in Vercel → Project → Settings → Environment Variables:
//   AT_API_KEY    = your Africa's Talking API key
//   AT_USERNAME   = your AT username (or "sandbox" for testing)
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
        const finalApiKey   = bodyApiKey   || process.env.AT_API_KEY   || '';
        const finalUsername = bodyUsername || process.env.AT_USERNAME  || '';
        const finalSenderId = bodySenderId || process.env.AT_SENDER_ID || '';

        // For sandbox mode, AT requires username to be "sandbox"
        const effectiveUsername = isSandbox ? 'sandbox' : finalUsername;

        const mode = isSandbox ? 'SANDBOX' : 'LIVE';
        const maskedKey = finalApiKey ? `${finalApiKey.slice(0, 6)}...${finalApiKey.slice(-4)}` : 'EMPTY';

        console.log(`[ARMS SMS] Mode: ${mode} | Username: ${effectiveUsername} | API Key: ${maskedKey}`);

        if (!effectiveUsername || !finalApiKey) {
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
        const baseUrl = isSandbox
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';

        // ── Build POST form body ──────────────────────────────────────────────
        const formParams: Record<string, string> = {
            username: effectiveUsername,
            to:       normalizedPhone,
            message,
        };

        // NOTE: Sender ID (from) is DISABLED until a registered sender ID is approved by AT.
        // AT will use its default short code. To re-enable, uncomment below after registering
        // a sender ID at africastalking.com → SMS → Sender IDs.
        // if (finalSenderId && finalSenderId.trim() && !isSandbox) {
        //     formParams.from = finalSenderId.trim();
        // }

        // ── AbortController: hard 15-second timeout ───────────────────────────
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
                        ? `SMS request timed out (15s) in ${mode} mode. ` +
                          'Africa\'s Talking may be unreachable or your API key is invalid.'
                        : `Network error reaching Africa's Talking: ${fetchError.message}`,
                },
                { status: 500 }
            );
        }
        clearTimeout(timeoutId);

        // ── Handle HTTP errors (401, 403, etc.) before JSON parsing ───────────
        if (!response.ok) {
            let errorBody = '';
            try { errorBody = await response.text(); } catch { errorBody = 'Could not read response'; }
            console.error(`[ARMS SMS] HTTP ${response.status} from AT (${mode}):`, errorBody);

            if (response.status === 401) {
                return NextResponse.json({
                    success: false,
                    error:
                        `API Key rejected by Africa's Talking (HTTP 401) in ${mode} mode. ` +
                        (isSandbox
                            ? 'For SANDBOX: Go to africastalking.com → Sandbox dashboard → Settings → API Key. ' +
                              'Make sure you\'re generating the key from the SANDBOX app, not the Live app.'
                            : 'For LIVE mode: Go to africastalking.com → Your App → Settings → API Key. ' +
                              'Make sure the key matches your LIVE app (not sandbox). ' +
                              'Also verify your username "' + finalUsername + '" is correct. ' +
                              'Try switching to Sandbox mode (toggle Live Mode OFF) to test with free messages first.'
                        ),
                });
            }

            return NextResponse.json({
                success: false,
                error: `Africa's Talking returned HTTP ${response.status} (${mode} mode): ${errorBody.slice(0, 200)}`,
            });
        }

        // ── Parse JSON response safely ────────────────────────────────────────
        let result: any;
        try {
            result = await response.json();
        } catch {
            console.error('[ARMS SMS] Failed to parse AT response body as JSON');
            return NextResponse.json({
                success: false,
                error: `Africa's Talking returned a non-JSON response (HTTP ${response.status}, ${mode} mode).`,
            }, { status: 500 });
        }

        console.log(`[ARMS SMS] ${mode} Response:`, JSON.stringify(result, null, 2));

        // ── Handle AT response — SMSMessageData structure ─────────────────────
        if (result.SMSMessageData?.Recipients?.length > 0) {
            const recipient = result.SMSMessageData.Recipients[0];

            const isSuccess =
                recipient.statusCode === 101 ||
                recipient.statusCode === 102 ||
                recipient.status === 'Success';

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
                return NextResponse.json({
                    success: false,
                    error:
                        `SMS failed (${mode}) — AT status: "${recipient.status}" (code ${recipient.statusCode}). ` +
                        (recipient.statusCode === 403
                            ? 'Your Sender ID "' + finalSenderId + '" may not be approved. Try removing it or contact AT support.'
                            : recipient.statusCode === 405
                            ? 'Insufficient AT balance. Top up your Africa\'s Talking account.'
                            : 'Check: phone number format, AT balance, and Sender ID registration.'),
                    details: recipient,
                });
            }
        }

        // ── Handle top-level AT error responses ───────────────────────────────
        if (result.error || result.errorMessage) {
            const errorMsg = result.error || result.errorMessage || 'Unknown error';
            console.error('[ARMS SMS] AT Error:', errorMsg);
            return NextResponse.json({
                success: false,
                error:   `Africa's Talking error (${mode}): ${errorMsg}`,
            });
        }

        // ── Fallback: unexpected response ─────────────────────────────────────
        console.error('[ARMS SMS] Unexpected response:', result);
        return NextResponse.json({
            success: false,
            error:
                result.SMSMessageData?.Message ||
                `Unexpected response from Africa's Talking (${mode}). Check Vercel logs for details.`,
            raw: result,
        });

    } catch (error: any) {
        console.error('[ARMS SMS] Unhandled error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error while sending SMS' },
            { status: 500 }
        );
    }
}