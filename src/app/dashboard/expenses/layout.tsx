import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Expense Master | ARMS',
    description: 'Track and manage property expenses',
    icons: {
        icon: [{ url: '/favicon-expenses.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-expenses.svg',
        apple: '/favicon-expenses.svg',
    },
};

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
