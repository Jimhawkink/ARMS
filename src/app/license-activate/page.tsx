'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { computeMachineFingerprint } from '@/lib/rbac';

function LicenseActivateContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [licenseKey, setLicenseKey] = useState('');
    const [activating, setActivating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const urlError = searchParams.get('error');

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!licenseKey.trim()) { setError('Please enter your license key'); return; }

        // Validate format
        const keyPattern = /^ARMS-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/i;
        if (!keyPattern.test(licenseKey.trim())) {
            setError('Invalid license key format. Expected: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
            return;
        }

        setActivating(true);
        setError('');

        try {
            const machineId = await computeMachineFingerprint();
            const res = await fetch('/api/license/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: licenseKey.trim(), machineId }),
            });
            const result = await res.json();

            if (!res.ok || !result.success) {
                setError(result.error || 'Activation failed. Please try again.');
                return;
            }

            // Store license
            const licensePayload = {
                licenseKey: result.licenseKey,
                clientName: result.clientName,
                expiryDate: result.expiryDate,
                features: result.features,
                machineId,
                activatedAt: result.activatedAt,
                isValid: true,
                daysUntilExpiry: Math.ceil((new Date(result.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            };
            localStorage.setItem('arms_license', JSON.stringify(licensePayload));

            setSuccess(`✅ License activated for ${result.clientName}! Redirecting…`);
            setTimeout(() => router.push('/dashboard'), 1500);
        } catch (err: any) {
            setError('Connection error. Please check your internet and try again.');
        } finally {
            setActivating(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl shadow-2xl mb-4"
                        style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)' }}>
                        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">ARMS<span className="text-blue-400">+</span></h1>
                    <p className="text-slate-400 text-sm mt-1">Alpha Rental Management System</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="px-6 py-5 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">🔑</div>
                        <div>
                            <h2 className="text-white font-bold text-lg">License Activation</h2>
                            <p className="text-indigo-300 text-xs">Enter your license key to activate ARMS</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* URL error */}
                        {urlError && (
                            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
                                <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
                                <p className="text-red-700 text-sm font-medium">{decodeURIComponent(urlError)}</p>
                            </div>
                        )}

                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                            <p className="text-blue-800 text-xs font-semibold">🔒 Machine-Locked License</p>
                            <p className="text-blue-700 text-xs mt-1">
                                Once activated, this license is permanently bound to this machine.
                                It cannot be transferred to another device.
                            </p>
                        </div>

                        <form onSubmit={handleActivate} className="space-y-4">
                            <div>
                                <label className="text-sm font-bold text-gray-700 mb-1.5 block">License Key</label>
                                <input
                                    value={licenseKey}
                                    onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                                    placeholder="ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition"
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Format: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX</p>
                            </div>

                            {error && (
                                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                                    <p className="text-red-700 text-sm font-medium">❌ {error}</p>
                                </div>
                            )}

                            {success && (
                                <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                                    <p className="text-green-700 text-sm font-bold">{success}</p>
                                </div>
                            )}

                            <button type="submit" disabled={activating}
                                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                                {activating ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Activating…</>
                                ) : (
                                    <>🔑 Activate License</>
                                )}
                            </button>
                        </form>

                        <div className="text-center pt-2">
                            <p className="text-xs text-gray-400">
                                Don't have a license? Contact{' '}
                                <a href="tel:0720316175" className="text-indigo-600 font-semibold">Jimhawkins Korir · 0720316175</a>
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-center text-slate-600 text-xs mt-4">
                    © 2025 Alpha Solutions · ARMS v1.1
                </p>
            </div>
        </div>
    );
}

export default function LicenseActivatePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-white">Loading…</div></div>}>
            <LicenseActivateContent />
        </Suspense>
    );
}
