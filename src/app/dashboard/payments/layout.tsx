import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Payments | ARMS',
    description: 'Record and track rent payments including M-Pesa',
    icons: {
        icon: [{ url: '/favicon-payments.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-payments.svg',
        apple: '/favicon-payments.svg',
    },
};

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
