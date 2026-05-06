import type { Metadata } from 'next';
import LoginPage from './LoginPage';

export const metadata: Metadata = {
    title: 'Login | ARMS - Alpha Rental Management System',
    description: 'Sign in to ARMS — your professional rental property management system',
    icons: {
        icon: [{ url: '/favicon-login.svg', type: 'image/svg+xml' }],
        shortcut: '/favicon-login.svg',
        apple: '/favicon-login.svg',
    },
};

export default function Page() {
    return <LoginPage />;
}
