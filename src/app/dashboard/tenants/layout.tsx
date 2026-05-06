import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Tenants | ARMS',
    description: 'Manage tenants and rental agreements',
    icons: {
        icon: [{ url: '/favicon-tenants.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-tenants.svg',
        apple: '/favicon-tenants.svg',
    },
};

export default function TenantsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
