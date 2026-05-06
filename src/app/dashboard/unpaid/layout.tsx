import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Unpaid Rent | ARMS',
    description: 'View and manage overdue rent payments',
    icons: {
        icon: [{ url: '/favicon-unpaid.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-unpaid.svg',
        apple: '/favicon-unpaid.svg',
    },
};

export default function UnpaidLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
