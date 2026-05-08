'use client';

/**
 * VacationBanner
 * Displays an amber/yellow gradient banner when the current month is a vacation month
 * (May, June, July, August — months 05–08 for Kenyan university students).
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 1.1, 1.2, 1.3
 */
export default function VacationBanner() {
    return (
        <div
            className="flex items-center gap-3 px-5 py-3 rounded-2xl border"
            style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%)',
                borderColor: '#f59e0b',
                boxShadow: '0 2px 12px rgba(245,158,11,0.18)',
            }}
        >
            <span className="text-2xl flex-shrink-0">🏖️</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-amber-900 leading-tight">
                    Vacation Month Active
                </p>
                <p className="text-xs text-amber-800 mt-0.5 leading-snug">
                    Student rent is <strong>50%</strong> for tenants on vacation (May – August).
                    Check tenant vacation status before recording payments.
                </p>
            </div>
            <div
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold"
                style={{ background: 'rgba(180,83,9,0.12)', color: '#92400e' }}
            >
                🏖️ VACATION
            </div>
        </div>
    );
}
