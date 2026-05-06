import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Units | ARMS',
    description: 'Manage rental units and rooms',
    icons: {
        icon: [{ url: '/favicon-units.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-units.svg',
        apple: '/favicon-units.svg',
    },
};

export default function UnitsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
