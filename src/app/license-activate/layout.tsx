import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Activate License | ARMS',
    description: 'Activate your ARMS software license',
    icons: {
        icon: [{ url: '/favicon-license-activate.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-license-activate.svg',
        apple: '/favicon-license-activate.svg',
    },
};

export default function LicenseActivateLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
