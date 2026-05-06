import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Messaging Hub | ARMS',
    description: 'Send SMS notifications to tenants',
    icons: {
        icon: [{ url: '/favicon-sms.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-sms.svg',
        apple: '/favicon-sms.svg',
    },
};

export default function SmsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
