import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'ARMS - Alpha Rental Management System',
    description: 'Professional Rental Property Management System by Alpha Solutions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: { background: '#fff', color: '#1e293b', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' },
                        success: { duration: 2500, style: { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }, iconTheme: { primary: '#10b981', secondary: '#ecfdf5' } },
                        error: { duration: 3500, style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }, iconTheme: { primary: '#ef4444', secondary: '#fef2f2' } },
                    }}
                />
                {children}
            </body>
        </html>
    );
}
