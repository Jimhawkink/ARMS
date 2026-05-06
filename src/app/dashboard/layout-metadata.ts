// Shared metadata helper for dashboard pages
import type { Metadata } from 'next';

export function buildMeta(title: string, description: string, icon: string): Metadata {
    return {
        title: `${title} | ARMS`,
        description,
        icons: {
            icon: [{ url: icon, type: 'image/svg+xml' }],
            shortcut: icon,
            apple: icon,
        },
    };
}
