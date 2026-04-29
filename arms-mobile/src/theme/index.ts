// ============================================
// ARMS TENANT APP - THEME
// Ultra-modern dark theme with indigo accents
// ============================================

export const colors = {
    // Primary Background
    bgPrimary: '#0f0a2e',
    bgSecondary: '#1a1340',
    bgCard: 'rgba(255,255,255,0.05)',
    bgCardActive: 'rgba(79,70,229,0.12)',
    bgInput: 'rgba(255,255,255,0.06)',

    // Borders
    borderColor: 'rgba(255,255,255,0.08)',
    borderActive: '#4f46e5',
    borderLight: 'rgba(255,255,255,0.04)',

    // Text
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.6)',
    textMuted: 'rgba(255,255,255,0.35)',
    textWhite: '#ffffff',
    textPlaceholder: 'rgba(255,255,255,0.2)',

    // Accent Colors
    accentIndigo: '#4f46e5',
    accentPurple: '#8b5cf6',
    accentBlue: '#3b82f6',
    accentEmerald: '#10b981',
    accentOrange: '#f97316',
    accentRed: '#ef4444',
    accentYellow: '#f59e0b',
    accentSky: '#0ea5e9',

    // Gradients
    gradientPrimary: ['#4f46e5', '#7c3aed'],
    gradientButton: ['#4f46e5', '#6366f1'],
    gradientSuccess: ['#10b981', '#059669'],
    gradientDanger: ['#ef4444', '#dc2626'],
    gradientWarm: ['#f97316', '#ea580c'],

    // Status Colors
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#0ea5e9',
    paid: '#10b981',
    unpaid: '#ef4444',
    partial: '#f59e0b',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const borderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 9999,
};

export const fontSize = {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    title: 28,
    hero: 34,
};

export const fontWeight = {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
};

export const shadows = {
    sm: {
        shadowColor: '#4f46e5',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#4f46e5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    lg: {
        shadowColor: '#4f46e5',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },
};

export default {
    colors,
    spacing,
    borderRadius,
    fontSize,
    fontWeight,
    shadows,
};
