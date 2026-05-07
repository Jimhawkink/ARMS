'use client';
import { FiArrowUpRight, FiArrowDownRight } from 'react-icons/fi';

export const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;
export const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
export const monthLabel = (m: string) => {
    try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); } catch { return m; }
};

export const COLORS = [
    { bg: '#eef2ff', border: '#818cf8', text: '#4338ca', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
    { bg: '#f0fdfa', border: '#2dd4bf', text: '#0f766e', grad: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
    { bg: '#fff7ed', border: '#fb923c', text: '#c2410c', grad: 'linear-gradient(135deg,#ea580c,#f97316)' },
    { bg: '#faf5ff', border: '#a78bfa', text: '#7c3aed', grad: 'linear-gradient(135deg,#7c3aed,#a855f7)' },
    { bg: '#f0fdf4', border: '#4ade80', text: '#15803d', grad: 'linear-gradient(135deg,#059669,#10b981)' },
    { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8', grad: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' },
];

export function KpiCard({ label, value, emoji, color, sub, trend }: {
    label: string; value: string | number; emoji: string; color: string; sub?: string; trend?: number;
}) {
    return (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden group"
            style={{ borderLeftWidth: 4, borderLeftColor: color }}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{label}</p>
                <span className="text-lg">{emoji}</span>
            </div>
            <p className="text-xl font-extrabold text-gray-900">{value}</p>
            {trend !== undefined && (
                <div className="flex items-center gap-1 mt-1">
                    {trend >= 0 ? <FiArrowUpRight size={11} className="text-green-500" /> : <FiArrowDownRight size={11} className="text-red-500" />}
                    <span className={`text-[10px] font-bold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>{Math.abs(trend)}%</span>
                </div>
            )}
            {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
            <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06] group-hover:opacity-[0.12] transition-opacity" style={{ background: color }} />
        </div>
    );
}

export function DonutSVG({ value, max, color, size = 100, label }: {
    value: number; max: number; color: string; size?: number; label?: string;
}) {
    const r = 36; const circ = 2 * Math.PI * r;
    const filled = max > 0 ? circ * (value / max) : 0;
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
                <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="10"
                    strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
                    transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <div className="absolute text-center">
                <div className="font-black text-gray-900 leading-none" style={{ fontSize: size * 0.18 }}>{pct(value, max)}%</div>
                {label && <div className="text-gray-400 leading-none mt-0.5" style={{ fontSize: size * 0.1 }}>{label}</div>}
            </div>
        </div>
    );
}

export function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: color }} />
        </div>
    );
}

export function ScoreGauge({ score, label }: { score: number; label: string }) {
    const clr = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
    const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
    return (
        <div className="flex flex-col items-center gap-2">
            <DonutSVG value={score} max={100} color={clr} size={90} label={label} />
            <span className="text-xs font-bold">{emoji} {score >= 80 ? 'Healthy' : score >= 60 ? 'Fair' : 'At Risk'}</span>
        </div>
    );
}

export function HeatCell({ value, max }: { value: number; max: number }) {
    const intensity = max > 0 ? Math.min(1, value / max) : 0;
    const bg = intensity > 0.7 ? '#10b981' : intensity > 0.4 ? '#fbbf24' : intensity > 0 ? '#f87171' : '#f1f5f9';
    const opacity = Math.max(0.15, intensity);
    return (
        <div className="w-full h-8 rounded-lg flex items-center justify-center text-[9px] font-bold"
            style={{ background: bg, opacity, color: intensity > 0.5 ? '#fff' : '#374151' }}>
            {value > 0 ? fmt(value) : '—'}
        </div>
    );
}

export function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const w = 120;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4)}`).join(' ');
    return (
        <svg width={w} height={height} className="overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {data.length > 0 && (
                <circle cx={(data.length - 1) / (data.length - 1) * w} cy={height - ((data[data.length - 1] - min) / range) * (height - 4)}
                    r="3" fill={color} />
            )}
        </svg>
    );
}
