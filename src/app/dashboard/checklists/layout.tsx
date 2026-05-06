import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Checklists | ARMS',
    description: 'Property inspection and move-in/out checklists',
    icons: {
        icon: [{ url: '/favicon-checklists.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-checklists.svg',
        apple: '/favicon-checklists.svg',
    },
};

export default function ChecklistsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
