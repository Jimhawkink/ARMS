import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Caretakers | ARMS',
    description: 'Manage property caretakers and staff',
    icons: {
        icon: [{ url: '/favicon-caretakers.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-caretakers.svg',
        apple: '/favicon-caretakers.svg',
    },
};

export default function CaretakersLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
