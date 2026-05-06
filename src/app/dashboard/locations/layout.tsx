import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Locations | ARMS',
    description: 'Manage rental property locations',
    icons: {
        icon: [{ url: '/favicon-locations.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-locations.svg',
        apple: '/favicon-locations.svg',
    },
};

export default function LocationsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
