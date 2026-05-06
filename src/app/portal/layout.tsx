import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Tenant Portal | ARMS',
    description: 'Self-service portal for tenants — view bills, receipts and raise issues',
    icons: {
        icon: [{ url: '/favicon-portal.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-portal.svg',
        apple: '/favicon-portal.svg',
    },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
