'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, getSettings, getRolePermissions } from '@/lib/supabase';

// ── 6 Feature Highlights for ARMS (Rental Management) ─────────────────
const rentalFeatures = [
    {
        title: 'Tenant & Unit Hub',
        subtitle: 'Occupancy & lease contracts',
        icon: (
            <svg className="w-5 h-5 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
        ),
    },
    {
        title: 'Automated Billing',
        subtitle: 'Rent, water & utility invoices',
        icon: (
            <svg className="w-5 h-5 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
            </svg>
        ),
    },
    {
        title: 'M-Pesa Auto-Match',
        subtitle: 'Instant C2B reconciliation',
        icon: (
            <svg className="w-5 h-5 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
        ),
    },
    {
        title: 'Financial Intelligence',
        subtitle: 'Collections, arrears & P&L',
        icon: (
            <svg className="w-5 h-5 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
        ),
    },
    {
        title: 'Caretakers & Repairs',
        subtitle: 'Maintenance & expense tracking',
        icon: (
            <svg className="w-5 h-5 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
        ),
    },
    {
        title: 'Cloud Real-Time Sync',
        subtitle: 'Multi-property & bank-grade audit',
        icon: (
            <svg className="w-5 h-5 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
        ),
    },
];

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');
    const [companyName, setCompanyName] = useState('Alpha Rental Management System');

    useEffect(() => {
        const update = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
            setCurrentDate(now.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }));
        };
        update();
        const interval = setInterval(update, 1000);
        const user = localStorage.getItem('arms_user');
        if (user) router.push('/dashboard');

        const loadCompanyName = async () => {
            try {
                const settings = await getSettings();
                const nameSetting = settings?.find((s: any) => s.setting_key === 'company_name');
                if (nameSetting?.setting_value) setCompanyName(nameSetting.setting_value);
            } catch { /* Use default */ }
        };
        loadCompanyName();

        return () => clearInterval(interval);
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        if (!username || !password) {
            setError('Please enter username and password');
            setIsLoading(false);
            return;
        }
        try {
            const user = await loginUser(username, password);
            if (user) {
                // Fetch role permissions for this user's role so sidebar shows correctly
                let permissions: Record<string, boolean> | undefined;
                try {
                    if (!user.is_super_admin) {
                        const rolePerms = await getRolePermissions();
                        const roleRow = rolePerms?.find((r: any) => r.role_name === (user.user_role || user.user_type || 'admin'));
                        if (roleRow) {
                            const permKeys = [
                                'can_manage_tenants','can_manage_units','can_record_payments',
                                'can_view_reports','can_send_sms','can_manage_utilities',
                                'can_manage_caretakers','can_issue_demand_letters','can_manage_settings',
                                'can_manage_users','can_view_dashboard','can_manage_expenses',
                                'can_manage_billing','can_manage_checklists','is_super_admin',
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

                localStorage.setItem('arms_user', JSON.stringify({
                    userId: user.user_id,
                    userName: user.user_name,
                    name: user.name,
                    userType: user.user_type,
                    userRole: user.user_role || user.user_type || 'admin',
                    isSuperAdmin: user.is_super_admin === true,
                    permissions,
                }));
                router.push('/dashboard');
            } else {
                setError('Invalid username or password');
            }
        } catch (err) {
            console.error(err);
            setError('Connection error. Please try again.');
        }
        setIsLoading(false);
    };

    return (
        <div className="h-screen w-full flex flex-col justify-between overflow-hidden font-sans bg-[#041226] relative">
            <style>{`html, body { height: 100%; overflow: hidden; margin: 0; padding: 0; background-color: #041226; }`}</style>

            {/* ═══════════════════════════════════════════════════
                LUXURY APARTMENT / REAL ESTATE ARCHITECTURE BACKGROUND
            ═══════════════════════════════════════════════════ */}
            <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none"
                style={{
                    backgroundImage: `url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=2200&q=85')`,
                    filter: 'brightness(0.36) saturate(1.25)'
                }}
            />

            {/* Deep Midnight Navy Vignette Overlay */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `linear-gradient(90deg, 
                        rgba(4, 18, 38, 0.97) 0%, 
                        rgba(4, 22, 46, 0.92) 40%, 
                        rgba(5, 28, 58, 0.85) 65%, 
                        rgba(4, 18, 38, 0.92) 100%)`
                }}
            />

            {/* ═══════════════════════════════════════════════════
                SWEEPING EMERALD & GOLD DYNAMIC CURVED RIBBONS
            ═══════════════════════════════════════════════════ */}
            {/* Top Ribbon Wave */}
            <div className="absolute top-0 right-0 left-0 h-48 pointer-events-none overflow-hidden opacity-90">
                <svg className="w-full h-full" viewBox="0 0 1440 280" fill="none" preserveAspectRatio="none">
                    <path
                        d="M600 0 C780 120, 1000 180, 1440 30 L1440 0 Z"
                        fill="url(#topGreenGradArms)"
                        opacity="0.8"
                    />
                    <path
                        d="M680 0 C840 90, 1080 140, 1440 10 L1440 0 Z"
                        fill="url(#topGoldGradArms)"
                        opacity="0.7"
                    />
                    <defs>
                        <linearGradient id="topGreenGradArms" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00E676" />
                            <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        <linearGradient id="topGoldGradArms" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#F59E0B" />
                            <stop offset="100%" stopColor="#EAB308" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* Bottom Swooshing Curved Ribbon */}
            <div className="absolute bottom-10 left-0 right-0 h-60 pointer-events-none overflow-hidden opacity-95">
                <svg className="w-full h-full" viewBox="0 0 1440 320" fill="none" preserveAspectRatio="none">
                    <path
                        d="M-50 280 C320 280, 560 210, 850 120 C1020 70, 1220 90, 1500 240 L1500 340 L-50 340 Z"
                        fill="url(#bottomGreenRibbonArms)"
                    />
                    <path
                        d="M-50 295 C300 295, 520 240, 780 165 C960 115, 1180 135, 1500 280 L1500 340 L-50 340 Z"
                        fill="url(#bottomGoldRibbonArms)"
                    />
                    <defs>
                        <linearGradient id="bottomGreenRibbonArms" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#00E676" />
                            <stop offset="50%" stopColor="#10B981" />
                            <stop offset="100%" stopColor="#047857" />
                        </linearGradient>
                        <linearGradient id="bottomGoldRibbonArms" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#F59E0B" />
                            <stop offset="60%" stopColor="#D97706" />
                            <stop offset="100%" stopColor="#047857" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* ═══════════════════════════════════════════════════
                MAIN VIEWPORT CONTENT: LEFT BRANDING + RIGHT LOGIN CARD
            ═══════════════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col lg:flex-row items-center justify-between px-6 sm:px-10 lg:px-16 xl:px-20 py-4 lg:py-6 relative z-10 gap-8 my-auto">

                {/* ── LEFT SHOWCASE: ARMS BRANDING & FEATURES ── */}
                <div className="w-full lg:max-w-[560px] xl:max-w-[620px] flex flex-col justify-between">

                    {/* Logo & Subtitle */}
                    <div className="flex items-center gap-3.5 mb-6">
                        <div className="w-13 h-13 rounded-2xl bg-[#00E676]/15 border-2 border-[#00E676]/40 flex items-center justify-center p-2.5 shadow-lg shadow-emerald-500/10">
                            {/* Building / Home Icon */}
                            <svg className="w-8 h-8 text-[#00E676]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-3xl font-black text-white tracking-tight leading-none flex items-center gap-1.5">
                                ARMS<span className="text-[#00E676]">·</span><span className="text-emerald-400 text-xl font-bold">Cloud</span>
                            </div>
                            <div className="text-[10px] font-bold tracking-[0.25em] text-slate-300 uppercase mt-1">
                                {companyName}
                            </div>
                        </div>
                    </div>

                    {/* Headline */}
                    <div className="mb-6">
                        <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-black text-white leading-[1.12] tracking-tight">
                            Smart Rental<br />
                            <span className="text-[#00E676]">Property Management.</span>
                        </h1>
                        <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mt-3 max-w-lg font-normal">
                            Kenya's premier cloud rental platform — tenant tracking, automated monthly billing, M-Pesa C2B auto-reconciliation and comprehensive financial analytics.
                        </p>
                    </div>

                    {/* 6 Feature Pills in 2 Columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
                        {rentalFeatures.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-[#081B38]/85 backdrop-blur-md border border-[#163866] hover:border-emerald-400/50 transition-all duration-200 group"
                            >
                                <div className="w-9 h-9 rounded-xl bg-[#0D2852] border border-[#1E4D8A] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    {item.icon}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-white font-bold text-xs leading-tight truncate">
                                        {item.title}
                                    </p>
                                    <p className="text-slate-300 text-[10.5px] leading-tight mt-0.5 truncate">
                                        {item.subtitle}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Tagline */}
                    <div className="flex items-center gap-2">
                        <span className="w-1 h-5 rounded-full bg-[#00E676] inline-block shadow-sm shadow-emerald-400" />
                        <p className="text-slate-200 text-xs sm:text-sm font-medium">
                            Maximize Your Rental Yield with <span className="text-[#00E676] font-bold">ARMS Enterprise</span>
                        </p>
                    </div>
                </div>

                {/* ── RIGHT LOGIN CARD (EXACT ALPHARETAIL WORLD-CLASS LOOK) ── */}
                <div className="w-full max-w-[400px] relative z-10">

                    <div className="w-full bg-white/97 lg:bg-white rounded-3xl p-6 sm:p-7 shadow-2xl relative border-2 border-emerald-400/90 backdrop-blur-xl"
                        style={{
                            boxShadow: '0 25px 65px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(16, 185, 129, 0.25)'
                        }}
                    >

                        {/* Top Badge: Shield Icon + Secure Access */}
                        <div className="flex items-center gap-3 mb-4 pb-1">
                            <div className="w-10 h-10 rounded-xl bg-[#091D3E] text-white flex items-center justify-center shadow-md shrink-0">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-[11px] font-black text-emerald-600 uppercase tracking-wide">
                                    Secure Access
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                    Sign in to your ARMS portal
                                </div>
                            </div>
                        </div>

                        {/* Heading */}
                        <div className="mb-4">
                            <h2 className="text-2xl sm:text-[26px] font-black text-[#091D3E] tracking-tight leading-tight">
                                Welcome back
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                Sign in to manage your <span className="font-bold text-[#091D3E]">Rental Properties</span>
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleLogin} className="space-y-3.5">
                            {/* Username */}
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                                    <svg className="w-3.5 h-3.5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                                    </svg>
                                    Username
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                                        </svg>
                                    </div>
                                    <input
                                        id="username"
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
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
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                                    </svg>
                                    Password
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                                        </svg>
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
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
                                            <svg style={{width:'18px',height:'18px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                            </svg>
                                        ) : (
                                            <svg style={{width:'18px',height:'18px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    <svg className="w-3.5 h-3.5 shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                                    </svg>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Sign In Button */}
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
                                        <svg style={{width:'18px',height:'18px',flexShrink:0}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                        <span>Sign In to ARMS</span>
                                    </>
                                )}
                            </button>

                            {/* Protected Note */}
                            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
                                <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                </svg>
                                <span>Your rental & tenant data is protected and secure</span>
                            </div>
                        </form>

                        {/* Card Bottom Footer */}
                        <div className="pt-2.5 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                            <span>© {new Date().getFullYear()} ARMS Enterprise</span>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                                    <span className="text-slate-600 font-semibold">Online</span>
                                </span>
                                <span className="text-slate-300">|</span>
                                <span>Cloud Connected</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                BOTTOM FULL-WIDTH STATUS BAR
            ═══════════════════════════════════════════════════ */}
            <div className="shrink-0 h-10 w-full px-6 lg:px-12 flex items-center justify-between text-xs text-slate-300 relative z-20"
                style={{ background: 'rgba(2, 8, 20, 0.98)', borderTop: '1px solid rgba(30, 58, 138, 0.4)' }}>
                <div className="flex items-center gap-5 sm:gap-7 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <span>🎧</span>
                        <span className="font-semibold text-[11px]">24/7 Support</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span>⚡</span>
                        <span className="font-semibold text-[11px]">High Performance</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span>🛡️</span>
                        <span className="font-semibold text-[11px]">Bank-Grade Security</span>
                    </div>
                    {/* Live Clock */}
                    <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-700/60 text-emerald-400 font-mono text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{currentTime}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400 font-sans">{currentDate}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs tracking-wide">ARMS<span className="text-[#00E676]">·</span>Cloud</span>
                    <span className="text-slate-600">|</span>
                    <span className="italic text-[11px] text-slate-400">Smart Rental Management. Maximum Yield.</span>
                </div>
            </div>
        </div>
    );
}
