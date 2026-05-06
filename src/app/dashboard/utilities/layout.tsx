import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Water & Utility Billing | ARMS',
    description: 'Manage water and utility billing for tenants',
    icons: {
        icon: [{ url: '/favicon-utilities.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-utilities.svg',
        apple: '/favicon-utilities.svg',
    },
};

export default function UtilitiesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
