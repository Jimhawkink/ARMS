'use client';
import { useState, useEffect, useCallback } from 'react';
import {
    getDashboardStats, getLocations, getTenants, getUnits, getPayments,
    calculateUnpaidRent, get12MonthAnalytics, getLocationSummary, getExpenses,
} from '@/lib/supabase';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend, Filler,
    RadialLinearScale, RadarController
} from 'chart.js';
import { FiRefreshCw, FiPrinter, FiTrendingUp, FiShield, FiMapPin, FiBarChart2, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import RevenueSection from './RevenueSection';
import OccupancyRiskSection from './OccupancyRiskSection';
import LocationBenchmarkSection from './LocationBenchmarkSection';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, LineElement, PointElement,
    ArcElement, Title, Tooltip, Legend, Filler, RadialLinearScale, RadarController
);

type Tab = 'revenue' | 'occupancy' | 'locations';

const TABS: { id: Tab; label: string; emoji: string; icon: any; color: string; desc: string }[] = [
    { id: 'revenue', label: 'Revenue & Finance', emoji: '💹', icon: FiTrendingUp, color: '#10b981', desc: 'Financial performance, P&L, forecasting' },
    { id: 'occupancy', label: 'Occupancy & Risk', emoji: '🛡️', icon: FiShield, color: '#6366f1', desc: 'Health scores, risk matrix, tenant analysis' },
    { id: 'locations', label: 'Locations & Payments', emoji: '📍', icon: FiMapPin, color: '#d97706', desc: 'Benchmarking, payment timing intelligence' },
];

export default function SuperAnalyticsPage() {
    const [tab, setTab] = useState<Tab>('revenue');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [locations, setLocations] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [arrearsData, setArrearsData] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [locationSummaries, setLocationSummaries] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [s, l, t, u, p, arr, an, exp] = await Promise.all([
                getDashboardStats(),
                getLocations(),
                getTenants(),
                getUnits(),
                getPayments({}),
                calculateUnpaidRent(),
                get12MonthAnalytics(),
                getExpenses({}),
            ]);
            setStats(s); setLocations(l); setTenants(t); setUnits(u);
            setPayments(p); setArrearsData(arr); setAnalytics(an); setExpenses(exp);

            // Build per-location summaries
            const summaries = await Promise.all(l.map(async (loc: any) => {
                const locSum = await getLocationSummary(loc.location_id);
                const locArr = arr.filter((a: any) => a.location_id === loc.location_id);
                return {
                    ...loc, ...locSum,
                    totalArrears: locArr.reduce((s: number, a: any) => s + (a.totalUnpaid || 0), 0),
                    totalOwed: locArr.reduce((s: number, a: any) => s + (a.totalOwed || 0), 0),
                    tenantsWithArrears: locArr.length,
                };
            }));
            setLocationSummaries(summaries);
            setLastRefresh(new Date());
        } catch (e) {
            toast.error('Failed to load analytics data');
            console.error(e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Listen for location changes
    useEffect(() => {
        const handler = () => loadAll();
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadAll]);

    const activeTenants = tenants.filter(t => t.status === 'Active');
    const totalRevenue = analytics.reduce((s, a) => s + (a.collected || 0), 0);
    const totalExpenses2 = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    <FiBarChart2 className="text-white" size={28} />
                </div>
                <div className="absolute -inset-3 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <div className="text-center">
                <p className="text-sm font-bold text-gray-700">Loading Super Analytics</p>
                <p className="text-xs text-gray-400 mt-1">Crunching your rental intelligence data…</p>
            </div>
            <div className="flex gap-1 mt-2">
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
            </div>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title flex items-center gap-2.5">
                        <span className="text-2xl">⚡</span>
                        <span>Super Analytics</span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-gradient-to-r from-indigo-500 to-purple-600 text-white ml-2">
                            <FiZap size={10} /> ULTRA
                        </span>
                    </h1>
                    <p className="text-sm text-gray-400 mt-1 font-medium">
                        Deep rental intelligence · {locations.length} properties · {activeTenants.length} active tenants · {units.length} units
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 font-medium">
                        Last refreshed: {lastRefresh.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={loadAll} className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition text-xs font-semibold shadow-sm">
                        <FiRefreshCw size={13} /> Refresh
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition no-print"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>
                        <FiPrinter size={13} /> Export
                    </button>
                </div>
            </div>

            {/* Quick Summary Banner */}
            <div className="rounded-2xl px-5 py-4 flex items-center gap-6 flex-wrap"
                style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', border: '1.5px solid #4338ca' }}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.15)' }}>📊</div>
                    <div>
                        <p className="text-white font-bold text-sm">Portfolio Summary</p>
                        <p className="text-indigo-300 text-xs">12-month performance snapshot</p>
                    </div>
                </div>
                <div className="flex gap-6 flex-wrap ml-auto">
                    {[
                        { label: 'Revenue', value: `KES ${(totalRevenue / 1000000).toFixed(1)}M`, color: '#34d399' },
                        { label: 'Expenses', value: `KES ${(totalExpenses2 / 1000000).toFixed(1)}M`, color: '#f87171' },
                        { label: 'Occupancy', value: `${stats?.totalUnits > 0 ? Math.round(((stats?.occupiedUnits || 0) / stats.totalUnits) * 100) : 0}%`, color: '#818cf8' },
                        { label: 'Collection', value: `${stats?.collectionRate || 0}%`, color: '#fbbf24' },
                    ].map((m, i) => (
                        <div key={i} className="text-center">
                            <p className="text-lg font-black" style={{ color: m.color }}>{m.value}</p>
                            <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">{m.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-print">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border-2 ${tab === t.id ? 'shadow-lg text-white scale-[1.02]' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200 hover:text-gray-700 hover:shadow-sm'}`}
                            style={tab === t.id ? { background: t.color, borderColor: t.color } : {}}>
                            <Icon size={16} />
                            <div className="text-left">
                                <span className="block">{t.emoji} {t.label}</span>
                                {tab === t.id && <span className="block text-[10px] font-medium opacity-80 mt-0.5">{t.desc}</span>}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {tab === 'revenue' && (
                <RevenueSection
                    analytics={analytics}
                    payments={payments}
                    expenses={expenses}
                    locations={locations}
                    locationSummaries={locationSummaries}
                />
            )}

            {tab === 'occupancy' && (
                <OccupancyRiskSection
                    units={units}
                    tenants={tenants}
                    arrearsData={arrearsData}
                    analytics={analytics}
                    locationSummaries={locationSummaries}
                />
            )}

            {tab === 'locations' && (
                <LocationBenchmarkSection
                    locations={locations}
                    locationSummaries={locationSummaries}
                    payments={payments}
                    arrearsData={arrearsData}
                    units={units}
                    tenants={tenants}
                />
            )}

            {/* Footer */}
            <div className="text-center py-4 no-print">
                <p className="text-[10px] text-gray-300 font-medium">
                    ⚡ ARMS+ Super Analytics · Powered by Alpha Solutions · Generated {new Date().toLocaleDateString('en-KE')}
                </p>
            </div>
        </div>
    );
}
