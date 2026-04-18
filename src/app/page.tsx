'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, getSettings } from '@/lib/supabase';

// Floating building animation elements
function FloatingBuildings() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[15%] left-[10%] w-8 h-12 bg-indigo-400/10 rounded-t-lg animate-float1"></div>
            <div className="absolute top-[30%] right-[15%] w-10 h-8 bg-violet-400/10 rounded-t-lg animate-float2"></div>
            <div className="absolute top-[60%] left-[20%] w-6 h-10 bg-purple-400/10 rounded-t-lg animate-float3"></div>
            <div className="absolute bottom-[20%] right-[25%] w-9 h-14 bg-indigo-300/10 rounded-t-lg animate-float1"></div>
            <div className="absolute top-[45%] left-[70%] w-7 h-9 bg-violet-300/10 rounded-t-lg animate-float2"></div>
            <div className="absolute top-[20%] right-[30%] text-indigo-500/8 text-3xl font-bold animate-float3">🏠</div>
            <div className="absolute bottom-[30%] left-[15%] text-violet-500/8 text-4xl font-bold animate-float1">🏢</div>
            <div className="absolute top-[70%] right-[10%] text-purple-500/8 text-2xl font-bold animate-float2">🔑</div>
        </div>
    );
}

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
            setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
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
        if (!username || !password) { setError('Please enter username and password'); setIsLoading(false); return; }
        try {
            const user = await loginUser(username, password);
            if (user) {
                localStorage.setItem('arms_user', JSON.stringify({ userId: user.user_id, userName: user.user_name, name: user.name, userType: user.user_type }));
                router.push('/dashboard');
            } else { setError('Invalid username or password'); }
        } catch (err) { console.error(err); setError('Connection error. Please try again.'); }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex relative overflow-hidden">
            {/* Left Panel - Dark Rental Branding */}
            <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex-col justify-between p-10 relative overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl"></div>
                    <div className="absolute top-1/3 left-1/4 w-48 h-48 bg-purple-400/5 rounded-full blur-2xl animate-pulse"></div>
                    {/* Grid pattern */}
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
                    {/* Building pattern overlay */}
                    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}></div>
                </div>

                <FloatingBuildings />

                {/* Top - Logo & Branding */}
                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 relative">
                            {/* Building/Home Icon */}
                            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">{companyName}</h2>
                            <p className="text-indigo-400/70 text-xs font-medium tracking-wider uppercase">Rental Management System</p>
                        </div>
                    </div>
                </div>

                {/* Middle - Feature Highlights */}
                <div className="relative z-10 space-y-6">
                    <h1 className="text-3xl font-bold leading-tight">
                        Smart Rental<br />
                        <span className="bg-gradient-to-r from-indigo-400 to-violet-300 bg-clip-text text-transparent">Management System</span>
                    </h1>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
                        Complete property management with tenant tracking, automated billing, M-Pesa payment integration, and comprehensive financial reporting.
                    </p>

                    <div className="space-y-4 pt-4">
                        {[
                            { emoji: '🏠', text: 'Tenant management & unit tracking' },
                            { emoji: '💰', text: 'Automated monthly billing & invoicing' },
                            { emoji: '📱', text: 'M-Pesa C2B auto-reconciliation' },
                            { emoji: '📊', text: 'Payment tracking & balance reports' },
                            { emoji: '📋', text: 'Location & property management' },
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-slate-300">
                                <span className="text-lg flex-shrink-0">{feature.emoji}</span>
                                <span>{feature.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom - Date/Time & Credits */}
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
                        <span>{currentTime}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                        <span>{currentDate}</span>
                    </div>
                    <div className="border-t border-slate-800 pt-4">
                        <p className="text-slate-500 text-xs">Powered by <span className="text-indigo-400 font-semibold">Alpha Solutions</span></p>
                        <p className="text-slate-600 text-[10px] mt-1">Developed by Jimhawkins Korir • 0720316175</p>
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 via-indigo-50/20 to-violet-50/30 p-6 relative">
                {/* Subtle background */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-100/40 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-20 -left-20 w-52 h-52 bg-violet-100/30 rounded-full blur-3xl"></div>
                    <div className="absolute top-1/2 right-1/4 w-40 h-40 bg-purple-100/20 rounded-full blur-3xl"></div>
                </div>

                {/* Main Login Form */}
                <div className="relative z-10 w-full max-w-md">
                    {/* Mobile-only header */}
                    <div className="lg:hidden text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-400 to-violet-600 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4 text-white">
                            <svg className="w-11 h-11" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800">{companyName}</h1>
                        <p className="text-gray-500 text-sm mt-1">Rental Management System</p>
                    </div>

                    {/* Login Card */}
                    <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                        {/* Rental header bar */}
                        <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-8 py-5 flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-lg">ARMS Login</h2>
                                <p className="text-indigo-200 text-xs">Secure access to your rental system</p>
                            </div>
                        </div>

                        <div className="p-8">
                            {/* Welcome text */}
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900">Welcome back</h3>
                                <p className="text-gray-500 text-sm mt-1">Sign in to manage your properties</p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-5">
                                {/* Username */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-gray-700">Username</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="Enter your username"
                                            className="w-full px-4 py-3.5 pl-12 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm"
                                        />
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-gray-700">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full px-4 py-3.5 pl-12 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm"
                                        />
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            {showPassword ? (
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm animate-shake">
                                        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                                        <span className="font-medium">{error}</span>
                                    </div>
                                )}

                                {/* Login Button */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:via-indigo-700 hover:to-violet-700 text-white text-base font-bold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            <span>Signing in...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                                            </svg>
                                            <span>Sign In to ARMS</span>
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Security Badge */}
                            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                <span>Secure Rental Management System</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 text-center lg:hidden">
                        <p className="text-gray-500 text-xs">Powered by <span className="font-semibold text-indigo-600">Alpha Solutions</span></p>
                        <p className="text-gray-400 text-[10px] mt-1">Developed by Jimhawkins Korir • 0720316175</p>
                    </div>
                    <p className="text-center text-gray-300 text-xs mt-4">© 2025 Alpha Rental Management System • v1.0</p>
                </div>
            </div>

            {/* Animations */}
            <style jsx>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
                    20%, 40%, 60%, 80% { transform: translateX(4px); }
                }
                .animate-shake {
                    animation: shake 0.5s ease-in-out;
                }
                @keyframes float1 {
                    0%, 100% { transform: translateY(0) rotate(45deg); opacity: 0.6; }
                    50% { transform: translateY(-20px) rotate(50deg); opacity: 0.3; }
                }
                @keyframes float2 {
                    0%, 100% { transform: translateY(0) rotate(-12deg); opacity: 0.5; }
                    50% { transform: translateY(-15px) rotate(-8deg); opacity: 0.2; }
                }
                @keyframes float3 {
                    0%, 100% { transform: translateY(0) rotate(30deg); opacity: 0.4; }
                    50% { transform: translateY(-25px) rotate(35deg); opacity: 0.2; }
                }
                .animate-float1 { animation: float1 6s ease-in-out infinite; }
                .animate-float2 { animation: float2 8s ease-in-out infinite; }
                .animate-float3 { animation: float3 7s ease-in-out infinite; }
            `}</style>
        </div>
    );
}
