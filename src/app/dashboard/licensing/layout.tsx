import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Licensing | ARMS',
    description: 'Manage ARMS software licensing',
    icons: {
        icon: [{ url: '/favicon-licensing.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-licensing.svg',
        apple: '/favicon-licensing.svg',
    },
};

export default function LicensingLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
