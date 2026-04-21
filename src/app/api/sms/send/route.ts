import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { to, message, username, apiKey, senderId, isSandbox } = await req.json();

        if (!to || !message || !username || !apiKey) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        const baseUrl = isSandbox
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'apiKey': apiKey,
            },
            body: new URLSearchParams({
                username,
                to,
                message,
                from: senderId || '',
            }).toString(),
        });

        const result = await response.json();

        if (result.SMSMessageData?.Recipients?.length > 0) {
            const recipient = result.SMSMessageData.Recipients[0];
            return NextResponse.json({
                success: recipient.statusCode === 101 || recipient.status === 'Success',
                messageId: recipient.messageId,
                cost: recipient.cost,
                status: recipient.status,
            });
        }

        return NextResponse.json({ success: false, error: result.SMSMessageData?.Message || 'Unknown error' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
