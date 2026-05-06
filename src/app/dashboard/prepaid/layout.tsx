import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Prepaid Tokens | ARMS',
    description: 'Manage prepaid electricity tokens for tenants',
    icons: {
        icon: [{ url: '/favicon-prepaid.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-prepaid.svg',
        apple: '/favicon-prepaid.svg',
    },
};

export default function PrepaidLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
