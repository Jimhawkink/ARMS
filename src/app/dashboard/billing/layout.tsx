import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Billing | ARMS',
    description: 'Manage monthly rent billing and invoices',
    icons: {
        icon: [{ url: '/favicon-billing.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-billing.svg',
        apple: '/favicon-billing.svg',
    },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
