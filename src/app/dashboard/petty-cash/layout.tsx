import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Petty Cash | ARMS',
    description: 'Track petty cash transactions and staff expenses',
    icons: {
        icon: [{ url: '/favicon-petty-cash.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-petty-cash.svg',
        apple: '/favicon-petty-cash.svg',
    },
};

export default function PettyCashLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
