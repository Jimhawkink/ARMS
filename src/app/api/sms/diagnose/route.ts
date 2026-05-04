import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARMS - SMS Diagnostic Endpoint
// Tests credentials against BOTH sandbox and live AT endpoints
// to help users identify credential mismatches.
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const { apiKey, username } = await req.json();

        if (!apiKey || !username) {
            return NextResponse.json({
                success: false,
                error: 'Provide apiKey and username to diagnose',
            });
        }

        const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
        const results: any = { maskedKey, username, tests: [] };

        // Test 1: Sandbox endpoint with username "sandbox"
        try {
            const sandboxRes = await fetch('https://api.sandbox.africastalking.com/version1/messaging', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'apiKey': apiKey,
                },
                body: new URLSearchParams({
                    username: 'sandbox',
                    to: '+254700000000',
                    message: 'ARMS diagnostic test',
                }).toString(),
                signal: AbortSignal.timeout(10000),
            });

            const sandboxBody = await sandboxRes.text();
            results.tests.push({
                mode: 'SANDBOX',
                endpoint: 'api.sandbox.africastalking.com',
                usernameUsed: 'sandbox',
                httpStatus: sandboxRes.status,
                passed: sandboxRes.ok,
                response: sandboxBody.slice(0, 300),
            });
        } catch (e: any) {
            results.tests.push({
                mode: 'SANDBOX',
                passed: false,
                error: e.message,
            });
        }

        // Test 2: Live endpoint with user's username
        try {
            const liveRes = await fetch('https://api.africastalking.com/version1/messaging', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'apiKey': apiKey,
                },
                body: new URLSearchParams({
                    username: username,
                    to: '+254700000000',
                    message: 'ARMS diagnostic test',
                }).toString(),
                signal: AbortSignal.timeout(10000),
            });

            const liveBody = await liveRes.text();
            results.tests.push({
                mode: 'LIVE',
                endpoint: 'api.africastalking.com',
                usernameUsed: username,
                httpStatus: liveRes.status,
                passed: liveRes.ok,
                response: liveBody.slice(0, 300),
            });
        } catch (e: any) {
            results.tests.push({
                mode: 'LIVE',
                passed: false,
                error: e.message,
            });
        }

        // Determine diagnosis
        const sandboxTest = results.tests.find((t: any) => t.mode === 'SANDBOX');
        const liveTest = results.tests.find((t: any) => t.mode === 'LIVE');

        if (sandboxTest?.passed && liveTest?.passed) {
            results.diagnosis = '✅ API key works on BOTH endpoints! Your credentials are valid.';
        } else if (sandboxTest?.passed && !liveTest?.passed) {
            results.diagnosis = '🧪 Your API key is a SANDBOX key. Switch to Sandbox mode (toggle Live Mode OFF) to use it. For live SMS, generate a LIVE API key from your AT live app.';
        } else if (!sandboxTest?.passed && liveTest?.passed) {
            results.diagnosis = '🚀 Your API key is a LIVE key. Keep Live Mode ON. It won\'t work in sandbox mode.';
        } else {
            results.diagnosis = `❌ API key rejected on BOTH endpoints. This key is invalid or expired. Steps:\n1. Go to africastalking.com and log in\n2. Check if your username is "${username}" (visible at top-right)\n3. Go to Settings → API Key → Generate a new key\n4. Copy it carefully (no extra spaces)\n5. For sandbox testing, use the Sandbox app's API key`;
        }

        return NextResponse.json({ success: true, ...results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
