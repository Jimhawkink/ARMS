import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Demand Letters | ARMS',
    description: 'Generate and send demand letters to tenants',
    icons: {
        icon: [{ url: '/favicon-demand-letters.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-demand-letters.svg',
        apple: '/favicon-demand-letters.svg',
    },
};

export default function DemandLettersLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
