import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Users & Access | ARMS',
    description: 'Manage system users and access control',
    icons: {
        icon: [{ url: '/favicon-users.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-users.svg',
        apple: '/favicon-users.svg',
    },
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
