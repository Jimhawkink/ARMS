import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Reports & Analytics | ARMS',
    description: 'Financial reports and rental analytics',
    icons: {
        icon: [{ url: '/favicon-reports.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-reports.svg',
        apple: '/favicon-reports.svg',
    },
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
