'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, getSettings, getRolePermissions } from '@/lib/supabase';

export default function LoginPage() {
    const router = useRouter();

    // Login state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [companyName, setCompanyName] = useState('Alpha ARMS');

    // Forgot password & help modal views
    const [view, setView] = useState<'login' | 'forgot' | 'sent'>('login');
    const [fpUsername, setFpUsername] = useState('');
    const [fpLoading, setFpLoading] = useState(false);
    const [fpError, setFpError] = useState('');
    const [showHelpModal, setShowHelpModal] = useState(false);

    useEffect(() => {
        const tick = () => {
            const n = new Date();
            setCurrentTime(n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
            setCurrentDate(n.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }));
        };
        tick();
        const iv = setInterval(tick, 1000);

        // Check if already logged in
        const user = localStorage.getItem('arms_user');
        if (user) {
            router.push('/dashboard');
        }

        // Fetch company name from settings
        const loadCompanyName = async () => {
            try {
                const settings = await getSettings();
                const nameSetting = settings?.find((s: any) => s.setting_key === 'company_name');
                if (nameSetting?.setting_value) setCompanyName(nameSetting.setting_value);
            } catch {
                /* Use default */
            }
        };
        loadCompanyName();

        return () => clearInterval(iv);
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!username.trim() || !password.trim()) {
            setError('Enter your username and password.');
            return;
        }
        setIsLoading(true);

        try {
            const user = await loginUser(username.trim(), password);
            if (user) {
                // Fetch role permissions for this user's role
                let permissions: Record<string, boolean> | undefined;
                try {
                    if (!user.is_super_admin) {
                        const rolePerms = await getRolePermissions();
                        const roleRow = rolePerms?.find(
                            (r: any) => r.role_name === (user.user_role || user.user_type || 'admin')
                        );
                        if (roleRow) {
                            const permKeys = [
                                'can_manage_tenants', 'can_manage_units', 'can_record_payments',
                                'can_view_reports', 'can_send_sms', 'can_manage_utilities',
                                'can_manage_caretakers', 'can_issue_demand_letters', 'can_manage_settings',
                                'can_manage_users', 'can_view_dashboard', 'can_manage_expenses',
                                'can_manage_billing', 'can_manage_checklists', 'is_super_admin',
                            ];
                            permissions = {} as Record<string, boolean>;
                            for (const k of permKeys) {
                                permissions[k] = roleRow[k] === true;
                            }
                        }
                        if (user.custom_permissions && typeof user.custom_permissions === 'object') {
                            permissions = { ...(permissions || {}), ...user.custom_permissions };
                        }
                    }
                } catch (permErr) {
                    console.warn('Could not load role permissions:', permErr);
                }

                localStorage.setItem(
                    'arms_user',
                    JSON.stringify({
                        userId: user.user_id,
                        userName: user.user_name,
                        name: user.name,
                        userType: user.user_type,
                        userRole: user.user_role || user.user_type || 'admin',
                        isSuperAdmin: user.is_super_admin === true,
                        permissions,
                    })
                );
                router.push('/dashboard');
            } else {
                setError('Invalid username or password.');
            }
        } catch (err) {
            console.error(err);
            setError('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fpUsername.trim()) {
            setFpError('Enter your username.');
            return;
        }
        setFpLoading(true);
        setFpError('');
        try {
            // Emulate recovery check
            setTimeout(() => {
                setView('sent');
                setFpLoading(false);
            }, 600);
        } catch {
            setFpError('Network error. Please contact your system administrator.');
            setFpLoading(false);
        }
    };

    return (
        <div className="h-screen w-full flex flex-col justify-between overflow-hidden font-sans bg-[#041226] select-none">
            <style>{`
                html, body { height: 100%; overflow: hidden; margin: 0; padding: 0; background-color: #041226; }
                @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');
                .cursive-highlight { font-family: 'Caveat', cursive; }
            `}</style>

            {/* ═══════════════════════════════════════════════════════════════
                MAIN HERO AREA: Luxury Property Wallpaper with Left Gradient
            ═══════════════════════════════════════════════════════════════ */}
            <div
                className="flex-1 w-full flex flex-col lg:flex-row items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-12 py-3 relative overflow-hidden bg-no-repeat bg-[#041226]"
                style={{
                    backgroundImage: `url('/login-bg.jpg')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            >
                {/* Seamless Midnight Navy Gradient Overlay */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            'linear-gradient(to right, rgba(4, 18, 38, 0.65) 0%, rgba(4, 18, 38, 0.20) 10%, transparent 18%)',
                    }}
                />

                {/* 🌟 LEFT HERO BRANDING (Identical to AlphaPharmacy / AlphaRetail layout) 🌟 */}
                <div className="hidden lg:flex flex-col justify-center max-w-[330px] xl:max-w-[360px] relative z-10 text-white space-y-2 py-1">
                    {/* Logo & Brand Pill */}
                    <div className="flex items-center gap-3">
                        <div
                            className="rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/25 p-2 shrink-0 border border-emerald-300/40"
                            style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px' }}
                        >
                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-2xl xl:text-[28px] font-black tracking-tight text-white leading-none">
                                    Alpha<span className="text-[#00E676]">ARMS</span>
                                </span>
                            </div>
                            <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mt-1">
                                ENTERPRISE PROPERTY SYSTEM
                            </div>
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className="text-2xl xl:text-[27px] font-black text-white leading-tight tracking-tight pt-0.5">
                        Everything You Need<br />
                        <span className="text-white">to Run Your Properties.</span>
                    </h1>

                    {/* Feature Checklist with Emerald Ticks */}
                    <div className="space-y-1.5 pt-1">
                        {[
                            'Residential & Commercial Units',
                            'Automated Monthly Rent & Utilities',
                            'M-Pesa C2B & KCB Buni Auto-Recon',
                            'FIFO Arrears & Advance Balances',
                            'And More...',
                        ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2.5 text-slate-200 text-[14px] font-bold">
                                <span className="text-[#00E676] text-base font-black">✓</span>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>

                    {/* Luminous Cursive Script Accent */}
                    <div className="pt-1">
                        <p className="cursive-highlight text-xl xl:text-2xl text-[#00E676] font-bold tracking-wide -rotate-1 drop-shadow-[0_2px_10px_rgba(0,230,118,0.45)] leading-tight">
                            Smart Rentals... Better Yield!
                        </p>
                    </div>

                    {/* Feature Capsule Badges */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {[
                            'Auto Billing & Invoices',
                            'Instant M-Pesa C2B',
                            'KCB Buni Live STK',
                            'Student Vacation Mode',
                            'Comrade Surcharge',
                            'Cloud Real-Time Sync',
                        ].map((badge, idx) => (
                            <span
                                key={idx}
                                className="px-3 py-1 rounded-full text-[11px] font-semibold text-slate-200 bg-white/10 backdrop-blur-md border border-white/20 shadow-xs hover:border-emerald-400/60 transition-colors"
                            >
                                {badge}
                            </span>
                        ))}
                    </div>
                </div>

                {/* 🌟 RIGHT LOGIN CARD (EXACT ALPHAPHARMA / ALPHARETAIL FLOATING CARD) 🌟 */}
                <div className="w-full max-w-[380px] relative z-10 py-1">
                    <div
                        className="w-full bg-white/98 lg:bg-white rounded-3xl p-5 sm:p-6 shadow-2xl relative border-2 border-emerald-400/90 backdrop-blur-xl"
                        style={{
                            boxShadow: '0 25px 65px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(16, 185, 129, 0.25)',
                        }}
                    >
                        {/* Top Badge: Shield Icon + Secure Access */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-[#091D3E] text-white flex items-center justify-center shadow-md shrink-0">
                                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none">
                                    SECURE ACCESS
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                    Sign in to your ARMS portal
                                </div>
                            </div>
                        </div>

                        {/* Heading */}
                        <div className="mb-4">
                            {view === 'login' && (
                                <>
                                    <h2 className="text-2xl sm:text-[26px] font-black text-[#091D3E] tracking-tight leading-tight">
                                        Welcome back
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-1 font-medium">
                                        Sign in to manage your <span className="font-bold text-[#091D3E]">{companyName}</span>
                                    </p>
                                </>
                            )}
                            {view === 'forgot' && (
                                <>
                                    <button
                                        onClick={() => { setView('login'); setFpError(''); setFpUsername(''); }}
                                        className="flex items-center gap-1 text-slate-400 hover:text-emerald-600 text-xs mb-2 font-semibold transition-colors"
                                    >
                                        ← Back to login
                                    </button>
                                    <h2 className="text-xl font-black text-[#091D3E] tracking-tight">
                                        Forgot Password?
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Enter your username to verify your account.
                                    </p>
                                </>
                            )}
                            {view === 'sent' && (
                                <div className="text-center py-2">
                                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
                                        ✓
                                    </div>
                                    <h2 className="text-lg font-black text-[#091D3E]">Account Verified</h2>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                        Username <span className="font-bold text-emerald-600">{fpUsername}</span> confirmed. Please contact the Super Admin to reset your password.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ═══ LOGIN FORM ═══ */}
                        {view === 'login' && (
                            <form onSubmit={handleLogin} className="space-y-3.5">
                                {/* Username */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                        </svg>
                                        Username
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <input
                                            id="username"
                                            type="text"
                                            value={username}
                                            onChange={e => setUsername(e.target.value)}
                                            placeholder="Enter your username"
                                            autoComplete="username"
                                            className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 outline-none transition-all placeholder:text-slate-400"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                        </svg>
                                        Password
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            autoComplete="current-password"
                                            className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 outline-none transition-all placeholder:text-slate-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                                        >
                                            {showPassword ? (
                                                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                                </svg>
                                            ) : (
                                                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Error alert */}
                                {error && (
                                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                                        <svg className="w-4 h-4 shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <span>{error}</span>
                                    </div>
                                )}

                                {/* Forgot Password & Help */}
                                <div className="flex justify-between items-center text-xs pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setShowHelpModal(true)}
                                        className="text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                    >
                                        Need help?
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setView('forgot'); setError(''); }}
                                        className="text-[#1E40AF] hover:text-[#1D4ED8] font-bold hover:underline transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                </div>

                                {/* Sign In Button (Deep Midnight Navy with Clean Arrow) */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3 rounded-xl text-white font-bold text-sm tracking-wide bg-gradient-to-r from-[#091D3E] via-[#0E2852] to-[#12356B] hover:from-[#0B2349] hover:to-[#174384] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/40 disabled:opacity-60 cursor-pointer"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                            <span>Signing in to ARMS...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg style={{ width: '18px', height: '18px', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                            </svg>
                                            <span>Sign In to ARMS</span>
                                        </>
                                    )}
                                </button>

                                {/* Protected Note */}
                                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
                                    <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>Your rental & tenant data is protected and secure</span>
                                </div>
                            </form>
                        )}

                        {/* ═══ FORGOT PASSWORD FORM ═══ */}
                        {view === 'forgot' && (
                            <form onSubmit={handleForgotPassword} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Your Username</label>
                                    <input
                                        type="text"
                                        value={fpUsername}
                                        onChange={e => setFpUsername(e.target.value)}
                                        placeholder="Enter your username"
                                        autoFocus
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 outline-none"
                                    />
                                </div>

                                {fpError && (
                                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                                        {fpError}
                                    </div>
                                )}

                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 leading-relaxed">
                                    🔒 If you forgot your password or PIN, your Property Super Admin can reset it immediately in <strong>Settings → Users</strong>.
                                </div>

                                <button
                                    type="submit"
                                    disabled={fpLoading}
                                    className="w-full py-2.5 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-[#091D3E] via-[#0E2852] to-[#12356B] shadow-md"
                                >
                                    {fpLoading ? 'Checking...' : 'Verify Username'}
                                </button>
                            </form>
                        )}

                        {/* ═══ RECOVERY INSTRUCTIONS ═══ */}
                        {view === 'sent' && (
                            <div className="space-y-2.5 mt-3">
                                <button
                                    onClick={() => { setView('login'); setFpUsername(''); setFpError(''); }}
                                    className="w-full py-2.5 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-[#091D3E] via-[#0E2852] to-[#12356B] shadow-lg"
                                >
                                    ← Back to Login
                                </button>
                            </div>
                        )}

                        {/* Card Bottom Footer */}
                        <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                            <span>© {new Date().getFullYear()} ARMS Cloud v4.2</span>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                                    <span className="text-slate-600 font-semibold">Online</span>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span>Enterprise Ready</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                BOTTOM FULL-WIDTH FOOTER BAR (Identical to AlphaPharmacy)
            ═══════════════════════════════════════════════════════════════ */}
            <div
                className="shrink-0 h-10 w-full px-6 lg:px-16 flex items-center justify-between text-xs text-slate-300 relative z-20"
                style={{ background: 'rgba(2, 8, 20, 0.98)', borderTop: '1px solid rgba(30, 58, 138, 0.4)' }}
            >
                <div className="flex items-center gap-5 sm:gap-7 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400">🎧</span>
                        <span className="font-semibold text-[11px]">24/7 Support</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-amber-400">⚡</span>
                        <span className="font-semibold text-[11px]">High Performance</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400">🛡️</span>
                        <span className="font-semibold text-[11px]">Enterprise Security</span>
                    </div>
                    {/* Live Clock Placed Cleanly In Footer */}
                    <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-700/60 text-emerald-400 font-mono text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{currentTime}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400 font-sans">{currentDate}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs tracking-wide">
                        Alpha<span className="text-[#00E676]">ARMS</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="italic text-[11px] text-slate-400">Manage Smarter. Yield Better.</span>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                HELP / SUPPORT MODAL
            ═══════════════════════════════════════════════════════════════ */}
            {showHelpModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative border-2 border-emerald-400/80">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                                🏢
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 text-base">ARMS Support</h3>
                                <p className="text-xs text-slate-500">Alpha Rental Management System</p>
                            </div>
                        </div>

                        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <p className="font-bold text-slate-800 mb-1">🔑 Login Assistance</p>
                                <p>If you forgot your password or cannot access your account, contact your property Super Administrator to reset your credentials.</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <p className="font-bold text-slate-800 mb-1">📞 Technical Support</p>
                                <p>Email: support@alphaplus.co.ke</p>
                                <p>Helpline: +254 700 000 000</p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowHelpModal(false)}
                            className="mt-5 w-full py-2.5 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-[#091D3E] via-[#0E2852] to-[#12356B]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
