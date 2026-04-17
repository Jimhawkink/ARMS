'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, getSettings } from '@/lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');

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
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 30%, #f0f9ff 60%, #ecfdf5 100%)' }}>
            {/* Animated orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent)' }}></div>
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.1), transparent)', animationDelay: '1s' }}></div>
                {/* Floating icons */}
                <div className="absolute top-20 left-[10%] text-4xl opacity-[0.07] animate-bounce" style={{ animationDuration: '3s' }}>🏠</div>
                <div className="absolute top-40 right-[15%] text-3xl opacity-[0.07] animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>🔑</div>
                <div className="absolute bottom-32 left-[20%] text-3xl opacity-[0.07] animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1s' }}>🏢</div>
                <div className="absolute bottom-48 right-[10%] text-4xl opacity-[0.07] animate-bounce" style={{ animationDuration: '4.5s' }}>📋</div>
            </div>

            <div className="relative z-10 w-full max-w-md animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-xl shadow-indigo-500/5 border border-gray-100 overflow-hidden">
                    {/* Header */}
                    <div className="px-8 py-8 text-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1, #7c3aed)' }}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
                        <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg border border-white/20 bg-white/15 backdrop-blur-sm">
                            <span className="text-5xl">🏘️</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">ARMS</h1>
                        <p className="text-indigo-200 text-sm font-medium">Alpha Rental Management System</p>
                        <div className="mt-3 flex items-center justify-center gap-4 text-white/60 text-xs">
                            <span>🕐 {currentTime}</span>
                            <span className="w-1 h-1 rounded-full bg-white/30"></span>
                            <span>📅 {currentDate}</span>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="px-8 py-8">
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">👤 Username</label>
                                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" className="input-field" />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">🔐 Password</label>
                                <div className="relative">
                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="input-field pr-12" />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xl p-1 hover:scale-110 transition-transform">
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-medium animate-shake bg-red-50 border border-red-200 text-red-700">
                                    ⚠️ {error}
                                </div>
                            )}
                            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60">
                                {isLoading ? <><div className="spinner" style={{ width: 20, height: 20 }}></div> Signing in...</> : <>🏘️ Sign In to ARMS →</>}
                            </button>
                        </form>
                        <div className="mt-5 text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">🔒 Secure Property Management</div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-5 text-center">
                    <div className="bg-white/70 backdrop-blur-sm rounded-2xl px-5 py-3 border border-gray-100 shadow-sm inline-block">
                        <p className="text-gray-700 font-semibold text-sm">💎 Alpha Solutions</p>
                        <p className="text-gray-400 text-xs mt-0.5">Developed by <span className="font-semibold text-indigo-600">Jimhawkins Korir</span> • 📞 0720316175</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
