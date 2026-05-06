import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Settings | ARMS',
    description: 'System configuration and preferences',
    icons: {
        icon: [{ url: '/favicon-settings.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-settings.svg',
        apple: '/favicon-settings.svg',
    },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
