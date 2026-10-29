'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    getDashboardStats, getRecentPayments, calculateUnpaidRent,
    get12MonthAnalytics, getCurrentMonthGrid, getLocations,
    getTenants, getArrearsPaymentsDetail, getNetRevenueSummary
} from '@/lib/supabase';
import {
    FiUsers, FiHome, FiDollarSign, FiAlertTriangle, FiTrendingUp,
    FiPercent, FiCalendar, FiCreditCard, FiSearch, FiFilter, FiX,
    FiCheckCircle, FiFileText, FiSmartphone, FiRefreshCw, FiPlus,
    FiPhone, FiTrendingDown, FiActivity, FiArrowUpRight, FiArrowDownRight,
    FiBarChart2, FiMessageSquare, FiMapPin, FiClock, FiZap, FiShield,
    FiTarget, FiLayers, FiChevronRight, FiChevronLeft, FiAward, FiEye,
    FiCheck, FiPieChart, FiSliders, FiDatabase
} from 'react-icons/fi';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend, Filler,
    RadialLinearScale, RadarController
} from 'chart.js';
import { Bar, Line, Doughnut, Radar } from 'react-chartjs-2';
import { topProgress } from '@/components/TopProgressBar';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, LineElement, PointElement,
    ArcElement, Title, Tooltip, Legend, Filler, RadialLinearScale, RadarController
);

/* ─── Compact Sleek KPI Card (Exact Reference Proportions: ~88px height, 7 in a row) ─── */
interface CompactKpiCardProps {
    icon: string;
    label: string;
    value: string | number;
    sub: string;
    gradient: string;
    shadowColor: string;
    href?: string;
    pulse?: boolean;
}

function CompactKpiCard({
    icon,
    label,
    value,
    sub,
    gradient,
    shadowColor,
    href,
    pulse = false
}: CompactKpiCardProps) {
    const router = useRouter();

    return (
        <div
            onClick={() => { if (href) router.push(href); }}
            className={`relative overflow-hidden rounded-2xl p-3 sm:p-3.5 text-white transition-all duration-300 group select-none min-h-[86px] sm:min-h-[92px] flex flex-col justify-between ${
                href ? 'cursor-pointer hover:-translate-y-1' : ''
            }`}
            style={{
                background: gradient,
                boxShadow: `0 8px 22px -6px ${shadowColor}`,
            }}
        >
            {/* Subtle glass watermark circle on right side */}
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            <div className="absolute right-1 top-1 w-10 h-10 rounded-full border border-white/10 pointer-events-none" />

            {/* Top row: Icon + Label in All Caps */}
            <div className="relative z-10 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs sm:text-sm flex-shrink-0">{icon}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/90 truncate leading-none">
                        {label}
                    </span>
                </div>
                {pulse && (
                    <span className="flex h-2 w-2 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                )}
            </div>

            {/* Middle row: Big bold punchy value */}
            <div className="relative z-10 my-0.5">
                <p className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight drop-shadow-sm font-sans truncate">
                    {value}
                </p>
            </div>

            {/* Bottom row: Subtitle text */}
            <div className="relative z-10 flex items-center justify-between text-[10px] text-white/80 font-medium leading-none">
                <span className="truncate">{sub}</span>
                {href && (
                    <FiArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1 text-white" />
                )}
            </div>
        </div>
    );
}

/* ─── Time-ago helper ─── */
function timeAgo(dateStr: string): string {
    if (!dateStr) return 'just now';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

export default function DashboardPage() {
    const router = useRouter();

    // ─── Core Data State ───
    const [stats, setStats] = useState<any>(null);
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [unpaidRentData, setUnpaidRentData] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [monthGrid, setMonthGrid] = useState<any>(null);
    const [arrearsPaymentsDetail, setArrearsPaymentsDetail] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [allTenants, setAllTenants] = useState<any[]>([]);
    const [netRevenue, setNetRevenue] = useState<any>(null);

    // ─── UI & Interactive State ───
    const [loading, setLoading] = useState(true);
    const [gridTab, setGridTab] = useState<'all' | 'unpaid' | 'paid'>('all');
    const [showArrearsGrid, setShowArrearsGrid] = useState(false);
    const [chartTab, setChartTab] = useState<'revenue' | 'cashmpesa' | 'rate' | 'radar'>('revenue');
    const [gridPage, setGridPage] = useState(1);
    const pageSize = 15;

    // ─── Rich Filter & Omni-Search State ───
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterStatusLevel, setFilterStatusLevel] = useState<string>('all');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterArrears, setFilterArrears] = useState<string>('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // ─── Instant Quick Balance Search State ───
    const [miniSearch, setMiniSearch] = useState('');
    const [miniResults, setMiniResults] = useState<any[]>([]);

    // ─── Live Search Filter ───
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowSearchDropdown(false);
            setHighlightedIndex(-1);
            return;
        }
        const q = searchQuery.toLowerCase().trim();
        const results = (allTenants || []).filter((t: any) =>
            t.tenant_name?.toLowerCase().includes(q) ||
            t.phone?.includes(q) ||
            t.arms_units?.unit_name?.toLowerCase().includes(q) ||
            t.arms_locations?.location_name?.toLowerCase().includes(q) ||
            t.email?.toLowerCase().includes(q) ||
            t.id_number?.includes(q)
        ).slice(0, 10);
        setSearchResults(results);
        setShowSearchDropdown(results.length > 0);
        setHighlightedIndex(-1);
    }, [searchQuery, allTenants]);

    // ─── Instant Quick Balance Lookup ───
    useEffect(() => {
        if (!miniSearch.trim()) {
            setMiniResults([]);
            return;
        }
        const q = miniSearch.toLowerCase().trim();
        setMiniResults((allTenants || []).filter((t: any) =>
            t.tenant_name?.toLowerCase().includes(q) ||
            t.phone?.includes(q) ||
            t.arms_units?.unit_name?.toLowerCase().includes(q)
        ).slice(0, 6));
    }, [miniSearch, allTenants]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearchDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (!showSearchDropdown || searchResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(p => Math.min(p + 1, searchResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(p => Math.max(p - 1, 0));
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            setSearchQuery(searchResults[highlightedIndex].tenant_name);
            setShowSearchDropdown(false);
        } else if (e.key === 'Escape') {
            setShowSearchDropdown(false);
        }
    };

    // ─── Data Loading ───
    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        topProgress.start();
        try {
            const lid = locId ?? undefined;
            const [s, rp, ur, an, mg, apd, nr] = await Promise.all([
                getDashboardStats(lid, true),
                getRecentPayments(200, lid),
                calculateUnpaidRent(lid),
                get12MonthAnalytics(lid),
                getCurrentMonthGrid(lid),
                getArrearsPaymentsDetail(lid),
                getNetRevenueSummary(lid, true)
            ]);
            setStats(s);
            setRecentPayments(rp || []);
            setUnpaidRentData(ur || []);
            setAnalytics(an || []);
            setMonthGrid(mg);
            setArrearsPaymentsDetail(apd || []);
            setNetRevenue(nr);
        } catch (err) {
            console.error('Error loading dashboard data:', err);
        } finally {
            topProgress.done();
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        loadData(lid);
        getLocations().then(l => setLocations(l || []));
        getTenants().then(t => setAllTenants(t || []));

        const handler = (e: any) => loadData(e.detail);
        window.addEventListener('arms-location-change', handler);

        return () => {
            window.removeEventListener('arms-location-change', handler);
        };
    }, [loadData]);

    const fmt = (n: number) => `Ksh ${(n || 0).toLocaleString('en-KE')}`;

    // ─── Derived Analysis Calculations ───
    const totalArrearsFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalUnpaid || 0), 0);
    const totalPenaltiesFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalPenalty || 0), 0);
    const totalOwedFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0);
    const collRate = stats?.collectionRate || 0;
    const totalUnitsCount = stats?.totalUnits || 0;
    const activeTenantsCount = stats?.activeTenants || 0;
    const vacantUnitsCount = Math.max(0, totalUnitsCount - activeTenantsCount);
    const occupancyRate = totalUnitsCount > 0 ? Math.round((activeTenantsCount / totalUnitsCount) * 100) : 0;
    const tenantsNewToday = stats?.tenantsNewToday || 0;
    const todayStr = new Date().toISOString().split('T')[0];

    // Collections today
    const paidTodayPayments = recentPayments.filter((p: any) => p.payment_date?.startsWith(todayStr));
    const paidTodayAmount = paidTodayPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const paidTodayCount = paidTodayPayments.length;

    // Month-over-month calculation
    const currentMonthAnalytics = analytics[analytics.length - 1];
    const prevMonthAnalytics = analytics[analytics.length - 2];
    const momChange = (prevMonthAnalytics?.collected > 0)
        ? Math.round(((currentMonthAnalytics?.collected - prevMonthAnalytics?.collected) / prevMonthAnalytics?.collected) * 100)
        : 0;

    // Advanced Metrics: RevPAU, Vacancy Cost, Operating Margin
    const revPau = totalUnitsCount > 0 ? Math.round((stats?.monthlyBilled || 0) / totalUnitsCount) : 0;
    const avgRentPerUnit = totalUnitsCount > 0 ? Math.round((stats?.maxExpectedRevenue || 0) / totalUnitsCount) : 0;
    const vacancyOpportunityLoss = vacantUnitsCount * avgRentPerUnit;
    const netMonthCollected = netRevenue?.month?.collected || 0;
    const netMonthExpenses = netRevenue?.month?.expenses || 0;
    const netMonthProfit = netRevenue?.month?.net || 0;
    const operatingMargin = netMonthCollected > 0 ? Math.round((netMonthProfit / netMonthCollected) * 100) : 0;

    // Payment methods total & M-Pesa velocity
    const totalCash = analytics.reduce((s, a) => s + (a.cashCollected || 0), 0);
    const totalMpesa = analytics.reduce((s, a) => s + (a.mpesaCollected || 0), 0);
    const totalPaymentsVolume = totalCash + totalMpesa;
    const mpesaAdoptionRate = totalPaymentsVolume > 0 ? Math.round((totalMpesa / totalPaymentsVolume) * 100) : 0;

    // Daily collection velocity (Ksh / day)
    const currentDay = Math.max(1, new Date().getDate());
    const dailyCollectionPace = Math.round((stats?.monthlyCollected || 0) / currentDay);
    const dailyVacancyLoss = Math.round(vacancyOpportunityLoss / 30);

    // Arrears histogram distribution brackets
    const arrearsBrackets = [
        { label: 'Under 5K', count: unpaidRentData.filter((t: any) => t.totalOwed > 0 && t.totalOwed < 5000).length },
        { label: '5K - 10K', count: unpaidRentData.filter((t: any) => t.totalOwed >= 5000 && t.totalOwed < 10000).length },
        { label: '10K - 20K', count: unpaidRentData.filter((t: any) => t.totalOwed >= 10000 && t.totalOwed < 20000).length },
        { label: 'Over 20K', count: unpaidRentData.filter((t: any) => t.totalOwed >= 20000).length },
    ];

    // Filtered Overdue Tenants Watchlist
    const filteredOverdue = useMemo(() => {
        let items = unpaidRentData.filter((t: any) => (t.totalOwed || 0) > 0);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            items = items.filter((t: any) =>
                t.tenant_name?.toLowerCase().includes(q) ||
                t.arms_units?.unit_name?.toLowerCase().includes(q) ||
                t.arms_locations?.location_name?.toLowerCase().includes(q) ||
                t.phone?.includes(q)
            );
        }
        if (filterLocation) {
            items = items.filter((t: any) => String(t.location_id) === filterLocation);
        }
        return items.sort((a, b) => (b.totalOwed || 0) - (a.totalOwed || 0));
    }, [unpaidRentData, searchQuery, filterLocation]);

    const top5Overdue = [...filteredOverdue].slice(0, 5);

    // Filtered Billing Records for Datagrid
    const filteredGridItems = useMemo(() => {
        let items: any[] = [];
        if (gridTab === 'paid') {
            items = monthGrid?.paid || [];
        } else if (gridTab === 'unpaid') {
            items = monthGrid?.unpaid || [];
        } else {
            items = [...(monthGrid?.paid || []), ...(monthGrid?.unpaid || [])];
        }

        if (filterStatusLevel === 'unpaid') {
            items = items.filter((b: any) => b.status !== 'Paid');
        } else if (filterStatusLevel === 'paid') {
            items = items.filter((b: any) => b.status === 'Paid');
        } else if (filterStatusLevel === 'partial') {
            items = items.filter((b: any) => b.status === 'Partial');
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            items = items.filter((b: any) =>
                b.arms_tenants?.tenant_name?.toLowerCase().includes(q) ||
                b.arms_units?.unit_name?.toLowerCase().includes(q) ||
                b.arms_locations?.location_name?.toLowerCase().includes(q) ||
                b.arms_tenants?.phone?.includes(q)
            );
        }

        if (filterLocation) {
            items = items.filter((b: any) => String(b.location_id) === filterLocation);
        }
        if (filterDateFrom) {
            items = items.filter((b: any) => b.billing_date >= filterDateFrom);
        }
        if (filterDateTo) {
            items = items.filter((b: any) => b.billing_date <= filterDateTo);
        }
        if (filterArrears === 'below5k') {
            items = items.filter((b: any) => (b.balance || 0) > 0 && (b.balance || 0) < 5000);
        } else if (filterArrears === '5kto10k') {
            items = items.filter((b: any) => (b.balance || 0) >= 5000 && (b.balance || 0) < 10000);
        } else if (filterArrears === 'above10k') {
            items = items.filter((b: any) => (b.balance || 0) >= 10000);
        }

        return items;
    }, [monthGrid, gridTab, filterStatusLevel, searchQuery, filterLocation, filterDateFrom, filterDateTo, filterArrears]);

    const totalGridDue = filteredGridItems.reduce((s: number, b: any) => s + (b.balance || 0), 0);
    const totalGridPaid = filteredGridItems.reduce((s: number, b: any) => s + (b.amount_paid || 0), 0);
    const totalGridBilled = filteredGridItems.reduce((s: number, b: any) => s + (b.rent_amount || 0), 0);
    const totalPages = Math.ceil(filteredGridItems.length / pageSize) || 1;
    const paginatedGridItems = filteredGridItems.slice((gridPage - 1) * pageSize, gridPage * pageSize);

    const clearFilters = () => {
        setSearchQuery('');
        setFilterLocation('');
        setFilterStatusLevel('all');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterArrears('');
        setGridPage(1);
    };

    const hasActiveFilters = Boolean(searchQuery || filterLocation || filterStatusLevel !== 'all' || filterDateFrom || filterDateTo || filterArrears);

    // Urgency styling helper
    const urgencyStyle = (months: number) => {
        if (months >= 3) return { dot: 'bg-rose-500 animate-pulse', badge: 'bg-rose-50 text-rose-700 border-rose-200', label: `${months} mo critical` };
        if (months >= 2) return { dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-600 border-rose-200', label: `${months} mo overdue` };
        if (months >= 1) return { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: `${months} mo due` };
        return { dot: 'bg-slate-300', badge: 'bg-slate-50 text-slate-600 border-slate-200', label: 'Current' };
    };

    // ─── Chart Setup ───
    const labels = analytics.map(a => a.label);

    const commonTooltip = {
        backgroundColor: '#0f172a',
        titleFont: { size: 12, family: 'Outfit, Inter, sans-serif', weight: '700' as const },
        bodyFont: { size: 12, family: 'Inter, sans-serif' },
        padding: 14,
        cornerRadius: 12,
        boxPadding: 6,
        borderColor: '#334155',
        borderWidth: 1,
        callbacks: {
            label: (c: any) => ` ${c.dataset.label}: Ksh ${(c.parsed.y ?? c.parsed)?.toLocaleString()}`
        }
    };

    const commonScales = {
        y: {
            beginAtZero: true,
            grid: { color: 'rgba(226, 232, 240, 0.7)', drawBorder: false },
            ticks: {
                callback: (v: any) => `${(v / 1000).toFixed(0)}K`,
                font: { size: 11, family: 'Inter, sans-serif' },
                color: '#64748b'
            },
            border: { display: false }
        },
        x: {
            grid: { display: false },
            ticks: {
                font: { size: 11, family: 'Inter, sans-serif' },
                color: '#64748b'
            },
            border: { display: false }
        }
    };

    // Revenue Trend Chart (Area)
    const revenueLineData = {
        labels,
        datasets: [
            {
                label: 'Invoiced / Billed',
                data: analytics.map(a => a.billed),
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.12)',
                borderWidth: 2.5,
                tension: 0.42,
                fill: true,
                pointBackgroundColor: '#4f46e5',
                pointRadius: 4,
                pointHoverRadius: 7
            },
            {
                label: 'Rent Collected',
                data: analytics.map(a => a.collected),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                borderWidth: 2.5,
                tension: 0.42,
                fill: true,
                pointBackgroundColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 7
            },
        ]
    };

    const revenueLineOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    pointStyleWidth: 10,
                    padding: 18,
                    font: { size: 12, weight: '600', family: 'Inter, sans-serif' },
                    color: '#475569'
                }
            },
            tooltip: commonTooltip
        },
        scales: commonScales
    };

    // Stacked Cash vs M-Pesa Bar Chart
    const cashMpesaData = {
        labels,
        datasets: [
            {
                label: 'Cash Inflow',
                data: analytics.map(a => a.cashCollected),
                backgroundColor: 'rgba(59, 130, 246, 0.85)',
                borderColor: '#2563eb',
                borderWidth: 1,
                borderRadius: 8,
                barPercentage: 0.62
            },
            {
                label: 'KCB STK / Digital Inflow',
                data: analytics.map(a => a.mpesaCollected),
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderColor: '#059669',
                borderWidth: 1,
                borderRadius: 8,
                barPercentage: 0.62
            },
        ]
    };

    const cashMpesaOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    pointStyleWidth: 10,
                    padding: 18,
                    font: { size: 12, weight: '600', family: 'Inter, sans-serif' },
                    color: '#475569'
                }
            },
            tooltip: commonTooltip
        },
        scales: {
            ...commonScales,
            x: { ...commonScales.x, stacked: true },
            y: { ...commonScales.y, stacked: true }
        }
    };

    // Collection Rate % vs Unpaid Rent Trend Chart
    const rateLineData = {
        labels,
        datasets: [
            {
                label: 'Collection Rate %',
                data: analytics.map(a => a.rate),
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.08)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#4f46e5',
                pointRadius: 4,
                yAxisID: 'y'
            },
            {
                label: 'Unpaid Exposure (KES)',
                data: analytics.map(a => a.unpaid),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ef4444',
                pointRadius: 4,
                yAxisID: 'y1'
            },
        ]
    };

    const rateLineOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    pointStyleWidth: 10,
                    padding: 18,
                    font: { size: 12, weight: '600', family: 'Inter, sans-serif' },
                    color: '#475569'
                }
            },
            tooltip: commonTooltip
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                grid: { color: 'rgba(226, 232, 240, 0.7)' },
                ticks: {
                    callback: (v: any) => `${v}%`,
                    font: { size: 11, family: 'Inter, sans-serif' },
                    color: '#64748b'
                },
                border: { display: false }
            },
            y1: {
                position: 'right' as const,
                beginAtZero: true,
                grid: { display: false },
                ticks: {
                    callback: (v: any) => `${(v / 1000).toFixed(0)}K`,
                    font: { size: 11, family: 'Inter, sans-serif' },
                    color: '#64748b'
                },
                border: { display: false }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 11, family: 'Inter, sans-serif' }, color: '#64748b' },
                border: { display: false }
            }
        }
    };

    // Property Health Radar Chart
    const radarData = {
        labels: ['Occupancy', 'Collection Efficiency', 'Low Arrears Ratio', 'KCB Digital Pace', 'Net Yield'],
        datasets: [{
            label: 'Portfolio Health',
            data: [
                occupancyRate,
                collRate,
                Math.max(0, 100 - Math.round((filteredOverdue.length / Math.max(activeTenantsCount, 1)) * 100)),
                mpesaAdoptionRate,
                Math.min(100, Math.max(0, operatingMargin > 0 ? operatingMargin : collRate - 10))
            ],
            backgroundColor: 'rgba(99, 102, 241, 0.22)',
            borderColor: '#4f46e5',
            borderWidth: 2.5,
            pointBackgroundColor: '#4f46e5',
            pointBorderColor: '#ffffff',
            pointRadius: 4,
            pointHoverRadius: 7
        }]
    };

    const radarOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#0f172a',
                padding: 12,
                cornerRadius: 10,
                callbacks: { label: (c: any) => ` Score: ${c.parsed.r}%` }
            }
        },
        scales: {
            r: {
                beginAtZero: true,
                max: 100,
                ticks: { stepSize: 25, font: { size: 10 }, color: '#94a3b8', backdropColor: 'transparent' },
                grid: { color: 'rgba(226, 232, 240, 0.8)' },
                pointLabels: { font: { size: 11, weight: '700', family: 'Inter, sans-serif' }, color: '#475569' },
                angleLines: { color: 'rgba(226, 232, 240, 0.8)' }
            }
        }
    };

    // Occupancy Donut
    const occupancyDoughnutData = {
        labels: ['Occupied Units', 'Vacant Units'],
        datasets: [{
            data: [activeTenantsCount, vacantUnitsCount],
            backgroundColor: ['#4f46e5', '#cbd5e1'],
            borderWidth: 0,
            hoverOffset: 6
        }]
    };

    const occupancyDoughnutOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '76%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 14,
                    font: { size: 11, family: 'Inter, sans-serif', weight: '600' },
                    color: '#64748b'
                }
            },
            tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 10 }
        }
    };

    // Payment Methods Donut
    const totalOther = Math.max(0, (stats?.monthlyCollected || 0) - (analytics[analytics.length - 1]?.cashCollected || 0) - (analytics[analytics.length - 1]?.mpesaCollected || 0));
    const payMethodData = {
        labels: ['KCB STK Inflow', 'Cash Settlement', 'Bank / Direct'],
        datasets: [{
            data: [totalMpesa, totalCash, totalOther],
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'],
            borderWidth: 0,
            hoverOffset: 6
        }]
    };

    const payMethodOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 14,
                    font: { size: 11, family: 'Inter, sans-serif', weight: '600' },
                    color: '#64748b'
                }
            },
            tooltip: {
                backgroundColor: '#0f172a',
                padding: 12,
                cornerRadius: 10,
                callbacks: { label: (c: any) => ` ${c.label}: Ksh ${c.parsed.toLocaleString()}` }
            }
        }
    };

    // Arrears Histogram
    const arrearsHistData = {
        labels: arrearsBrackets.map(b => b.label),
        datasets: [{
            label: 'Tenants',
            data: arrearsBrackets.map(b => b.count),
            backgroundColor: [
                'rgba(16, 185, 129, 0.85)',
                'rgba(245, 158, 11, 0.85)',
                'rgba(239, 68, 68, 0.85)',
                'rgba(185, 28, 28, 0.85)'
            ],
            borderColor: ['#059669', '#d97706', '#dc2626', '#991b1b'],
            borderWidth: 1.5,
            borderRadius: 8,
            barPercentage: 0.6
        }]
    };

    const arrearsHistOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#0f172a',
                padding: 12,
                cornerRadius: 10,
                callbacks: { label: (c: any) => ` ${c.parsed.y} tenant${c.parsed.y !== 1 ? 's' : ''}` }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.7)' },
                ticks: { stepSize: 1, font: { size: 11, family: 'Inter, sans-serif' }, color: '#64748b' },
                border: { display: false }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 11, family: 'Inter, sans-serif' }, color: '#64748b' },
                border: { display: false }
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-[500px] flex flex-col items-center justify-center gap-4">
                <div className="relative">
                    <div
                        className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl shadow-xl animate-pulse"
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                    >
                        🏢
                    </div>
                    <div className="absolute -inset-2.5 rounded-full border-2 border-indigo-300 animate-ping opacity-35" />
                </div>
                <div className="text-center">
                    <p className="text-base font-extrabold text-slate-800">Synchronizing ARMS Rental Intelligence</p>
                    <p className="text-xs text-slate-400 mt-1">Aggregating live portfolios, collections, and tenant metrics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fadeIn space-y-5 pb-16 font-sans text-slate-800">

            {/* ══════════════════════════════════════════════════════════════════════
                1. EXACT TOP HEADER (MATCHING USER REFERENCE SCREENSHOT)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="flex items-center justify-between flex-wrap gap-4 py-1">
                {/* Left: Avatar Icon + Title + LIVE DB badge + Subtitle */}
                <div className="flex items-center gap-3.5">
                    <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl text-white shadow-md shadow-orange-500/20 flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)' }}
                    >
                        🏢
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-sans">
                                Rental Portfolio & Financial Valuations
                            </h1>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                LIVE DB
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Real-time rental revenue, tenant folios, occupancy audit & portfolio valuations
                        </p>
                    </div>
                </div>

                {/* Right: Quick Action Buttons (Matching Screenshot) */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={() => router.push('/dashboard/payments')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        style={{ background: '#059669' }}
                    >
                        <FiPlus size={14} /> Log Payment
                    </button>
                    <button
                        onClick={() => router.push('/dashboard/sms')}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        style={{ background: '#e11d48' }}
                    >
                        <FiMessageSquare size={13} /> Broadcast Alert
                    </button>
                    <button
                        onClick={() => loadData()}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/40 transition text-xs font-bold shadow-sm"
                        title="Synchronize database"
                    >
                        <FiRefreshCw size={13} /> Sync DB
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                2. THE 7 SLEEK COMPACT KPI CARDS IN 1 ROW (EXACT REFERENCE SCREENSHOT)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {/* 1. Purple/Violet Card: TOTAL UNITS */}
                <CompactKpiCard
                    icon="🏠"
                    label="TOTAL UNITS"
                    value={totalUnitsCount}
                    sub={`${activeTenantsCount} active tenants`}
                    gradient="linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)"
                    shadowColor="rgba(79, 70, 229, 0.4)"
                    href="/dashboard/units"
                />

                {/* 2. Blue Card: READY / OCCUPIED */}
                <CompactKpiCard
                    icon="🚪"
                    label="READY / OCCUPIED"
                    value={activeTenantsCount}
                    sub={`${vacantUnitsCount} ready to occupy`}
                    gradient="linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)"
                    shadowColor="rgba(2, 132, 199, 0.4)"
                    href="/dashboard/units"
                />

                {/* 3. Teal Card: COLLECTED RENT */}
                <CompactKpiCard
                    icon="💵"
                    label="COLLECTED RENT"
                    value={fmt(stats?.monthlyCollected || 0)}
                    sub={`${fmt(paidTodayAmount)} revenue today`}
                    gradient="linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #10b981 100%)"
                    shadowColor="rgba(13, 148, 136, 0.4)"
                    href="/dashboard/payments"
                />

                {/* 4. Red/Crimson Card: OUTSTANDING ARREARS */}
                <CompactKpiCard
                    icon="❌"
                    label="OUTSTANDING ARREARS"
                    value={fmt(totalArrearsFromCalc)}
                    sub={`${filteredOverdue.length} tenants in debt`}
                    gradient="linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)"
                    shadowColor="rgba(225, 29, 72, 0.4)"
                    href="/dashboard/unpaid"
                    pulse={totalArrearsFromCalc > 0}
                />

                {/* 5. Orange Card: PORTFOLIO VALUATION */}
                <CompactKpiCard
                    icon="💎"
                    label="PORTFOLIO VALUATION"
                    value={fmt(stats?.maxExpectedRevenue || 0)}
                    sub="At 100% full occupancy"
                    gradient="linear-gradient(135deg, #ea580c 0%, #f59e0b 50%, #fbbf24 100%)"
                    shadowColor="rgba(234, 88, 12, 0.4)"
                    href="/dashboard/units"
                />

                {/* 6. Dark Navy/Slate Card: MONTHLY BILLED */}
                <CompactKpiCard
                    icon="🧾"
                    label="MONTHLY BILLED"
                    value={fmt(stats?.monthlyBilled || 0)}
                    sub={`RevPAU: ${fmt(revPau)}`}
                    gradient="linear-gradient(135deg, #1e293b 0%, #334155 100%)"
                    shadowColor="rgba(30, 41, 59, 0.4)"
                    href="/dashboard/billing"
                />

                {/* 7. Emerald Green Card: COLLECTION RATE */}
                <CompactKpiCard
                    icon="📈"
                    label="COLLECTION RATE"
                    value={`${collRate}%`}
                    sub={`Margin: ${operatingMargin}%`}
                    gradient="linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)"
                    shadowColor="rgba(4, 120, 87, 0.4)"
                    href="/dashboard/reports"
                />
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                3. FILTER BAR DIRECTLY BENEATH THE CARDS (EXACT REFERENCE SCREENSHOT)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3">
                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    {/* Search Input with Magnifier Icon */}
                    <div className="relative flex-1 min-w-[240px]" ref={searchRef}>
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            onFocus={() => { if (searchQuery.trim() && searchResults.length > 0) setShowSearchDropdown(true); }}
                            placeholder="Search tenant name, unit number, phone, location..."
                            className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/60 transition-all font-medium"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-0.5"
                            >
                                <FiX size={14} />
                            </button>
                        )}

                        {/* Search Dropdown Matches */}
                        {showSearchDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-fadeIn">
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                                    <span className="font-bold text-slate-600">{searchResults.length} Tenant Match{searchResults.length !== 1 ? 'es' : ''}</span>
                                    <span className="text-[10px] text-slate-400">↑↓ navigate · Enter selects</span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                                    {searchResults.map((t, i) => (
                                        <button
                                            key={t.tenant_id}
                                            onClick={() => {
                                                setSearchQuery(t.tenant_name);
                                                setShowSearchDropdown(false);
                                            }}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                                                highlightedIndex === i ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div
                                                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm"
                                                style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                                            >
                                                {t.tenant_name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-900 truncate">{t.tenant_name}</p>
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                                    <span>Room <b className="text-slate-600">{t.arms_units?.unit_name || '-'}</b></span>
                                                    <span>•</span>
                                                    <span>{t.arms_locations?.location_name || '-'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className={`text-xs font-black ${(t.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {(t.balance || 0) > 0 ? `Owes ${fmt(t.balance)}` : '✅ Paid Up'}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Property / Location Selector (Matching Reference Dropdown) */}
                    <div className="w-full sm:w-auto min-w-[180px]">
                        <select
                            value={filterLocation}
                            onChange={e => { setFilterLocation(e.target.value); setGridPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                        >
                            <option value="">All Locations ({locations.length})</option>
                            {locations.map(l => (
                                <option key={l.location_id} value={String(l.location_id)}>
                                    {l.location_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Stock / Status Levels (Matching Reference Dropdown) */}
                    <div className="w-full sm:w-auto min-w-[170px]">
                        <select
                            value={filterStatusLevel}
                            onChange={e => { setFilterStatusLevel(e.target.value); setGridPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                        >
                            <option value="all">All Folio Statuses</option>
                            <option value="unpaid">⚠️ Unpaid / Overdue</option>
                            <option value="paid">✅ Fully Paid</option>
                            <option value="partial">⏳ Partial Settlement</option>
                        </select>
                    </div>

                    {/* Advanced Filter Toggle */}
                    <button
                        onClick={() => setShowAdvancedFilters(f => !f)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                            showAdvancedFilters || hasActiveFilters
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                        title="Advanced filtering options"
                    >
                        <FiSliders size={13} />
                        <span className="hidden sm:inline">More Filters</span>
                        {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                    </button>

                    {/* Showing Count Indicator (Matching Reference Image) */}
                    <div className="text-xs font-medium text-slate-500 whitespace-nowrap ml-auto">
                        Showing <b className="text-indigo-600 font-bold">{filteredGridItems.length}</b> of {allTenants.length || filteredGridItems.length} records
                    </div>

                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                        >
                            <FiX size={12} /> Clear
                        </button>
                    )}
                </div>

                {/* Collapsible Advanced Filters */}
                {showAdvancedFilters && (
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fadeIn">
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                                Billed From Date
                            </label>
                            <input
                                type="date"
                                value={filterDateFrom}
                                onChange={e => { setFilterDateFrom(e.target.value); setGridPage(1); }}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                                Billed To Date
                            </label>
                            <input
                                type="date"
                                value={filterDateTo}
                                onChange={e => { setFilterDateTo(e.target.value); setGridPage(1); }}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                                Arrears Debt Bracket
                            </label>
                            <select
                                value={filterArrears}
                                onChange={e => { setFilterArrears(e.target.value); setGridPage(1); }}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-indigo-400"
                            >
                                <option value="">All Debt Amounts</option>
                                <option value="below5k">Under Ksh 5,000</option>
                                <option value="5kto10k">Ksh 5,000 – 10,000</option>
                                <option value="above10k">Over Ksh 10,000 (High Risk)</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                4. EXECUTIVE FINANCIAL VELOCITY & REVPAU STRIP (4 METRICS)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">RevPAU (Yield / Unit)</span>
                        <p className="text-lg font-black text-slate-900 mt-0.5">{fmt(revPau)}</p>
                        <span className="text-[10px] text-slate-500 font-semibold">Per available unit</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
                        📊
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Daily Collection Pace</span>
                        <p className="text-lg font-black text-emerald-600 mt-0.5">{fmt(dailyCollectionPace)}</p>
                        <span className="text-[10px] text-slate-500 font-semibold">Average inflow / day</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                        ⚡
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Daily Vacancy Loss</span>
                        <p className="text-lg font-black text-rose-600 mt-0.5">{fmt(dailyVacancyLoss)}</p>
                        <span className="text-[10px] text-slate-500 font-semibold">{vacantUnitsCount} empty units cost</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg">
                        💸
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">M-Pesa Digital Velocity</span>
                        <p className="text-lg font-black text-emerald-700 mt-0.5">{mpesaAdoptionRate}%</p>
                        <span className="text-[10px] text-slate-500 font-semibold">Of all rent settlements</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                        📱
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                5. EXECUTIVE NET REVENUE HORIZONS STRIP (P&L BREAKDOWN)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <span>💹</span> Net Operating Inflow Ledger (Collected Inflow − Operating Expenses)
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Real-time net yields across four operational horizons
                        </p>
                    </div>
                    <button
                        onClick={() => router.push('/dashboard/reports')}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition"
                    >
                        Detailed Financial Statement <FiChevronRight size={13} />
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        {
                            period: 'Today',
                            emoji: '📅',
                            data: netRevenue?.today,
                            bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                            border: '#86efac'
                        },
                        {
                            period: 'This Week',
                            emoji: '🗓️',
                            data: netRevenue?.week,
                            bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                            border: '#93c5fd'
                        },
                        {
                            period: 'This Month',
                            emoji: '📆',
                            data: netRevenue?.month,
                            bg: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                            border: '#d8b4fe'
                        },
                        {
                            period: 'This Year (YTD)',
                            emoji: '🏆',
                            data: netRevenue?.year,
                            bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                            border: '#fed7aa'
                        },
                    ].map((item, i) => {
                        const netVal = item.data?.net || 0;
                        const collVal = item.data?.collected || 0;
                        const expVal = item.data?.expenses || 0;
                        return (
                            <div
                                key={i}
                                className="rounded-2xl p-3.5 border transition-all duration-200"
                                style={{ background: item.bg, borderColor: item.border }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                                        {item.emoji} {item.period}
                                    </span>
                                    <span
                                        className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                            netVal >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                        }`}
                                    >
                                        {netVal >= 0 ? '▲ Surpl.' : '▼ Def.'}
                                    </span>
                                </div>
                                <p className={`text-lg font-black ${netVal >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                                    {fmt(netVal)}
                                </p>
                                <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-0.5 text-[11px]">
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span>Inflow (Rent):</span>
                                        <b className="text-emerald-700 font-semibold">{fmt(collVal)}</b>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span>Expenses:</span>
                                        <b className="text-rose-600 font-semibold">{fmt(expVal)}</b>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                6. COMPREHENSIVE TABBED CHART ENGINE
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 flex-wrap gap-3">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <span>📈</span> Visual Analytical Hub & Trajectory
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            12-month historical performance, M-Pesa dynamics, and 5-pillar health score
                        </p>
                    </div>

                    {/* Chart Tab Pills */}
                    <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl">
                        {[
                            { key: 'revenue', label: '📊 Invoiced vs Collected', icon: <FiTrendingUp size={12} /> },
                            { key: 'cashmpesa', label: '💳 Cash vs KCB STK', icon: <FiSmartphone size={12} /> },
                            { key: 'rate', label: '⚡ Collection % & Arrears', icon: <FiPercent size={12} /> },
                            { key: 'radar', label: '🎯 Health Matrix', icon: <FiShield size={12} /> },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setChartTab(tab.key as any)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    chartTab === tab.key
                                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/70'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {tab.icon}
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5">
                    {chartTab === 'revenue' && (
                        <div>
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    12-Month Invoicing vs Realized Collection Trajectory
                                </span>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="flex items-center gap-1.5 text-indigo-700 font-bold">
                                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" /> Billed
                                    </span>
                                    <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Collected
                                    </span>
                                </div>
                            </div>
                            <div style={{ height: 320 }}>
                                <Line data={revenueLineData} options={revenueLineOpts} />
                            </div>
                        </div>
                    )}

                    {chartTab === 'cashmpesa' && (
                        <div>
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Payment Channel Distribution (KCB STK vs Cash Inflow)
                                </span>
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                    KCB STK Adoption: {mpesaAdoptionRate}%
                                </span>
                            </div>
                            <div style={{ height: 320 }}>
                                <Bar data={cashMpesaData} options={cashMpesaOpts} />
                            </div>
                        </div>
                    )}

                    {chartTab === 'rate' && (
                        <div>
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Monthly Collection Efficiency Rate % vs Outstanding Balances
                                </span>
                                <span className="text-xs font-bold text-slate-600">
                                    Target Collection: 95%+
                                </span>
                            </div>
                            <div style={{ height: 320 }}>
                                <Line data={rateLineData} options={rateLineOpts} />
                            </div>
                        </div>
                    )}

                    {chartTab === 'radar' && (
                        <div>
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    5-Pillar Portfolio Health Assessment (0–100 Benchmark)
                                </span>
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                                    Holistic Score
                                </span>
                            </div>
                            <div style={{ height: 320 }}>
                                <Radar data={radarData} options={radarOpts} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                7. THREE-COLUMN DEEP-DIVE PORTFOLIO ANALYSIS
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Occupancy Donut */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Occupancy & Capacity
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {totalUnitsCount} Units
                        </span>
                    </div>

                    <div className="relative" style={{ height: 210 }}>
                        <Doughnut data={occupancyDoughnutData} options={occupancyDoughnutOpts} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                            <span className="text-3xl font-black text-indigo-600 font-sans">{occupancyRate}%</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Occupied</span>
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-around text-xs">
                        <div className="text-center">
                            <p className="font-black text-indigo-700 text-sm">{activeTenantsCount}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">Occupied</p>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div className="text-center">
                            <p className="font-black text-slate-500 text-sm">{vacantUnitsCount}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">Vacant</p>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div className="text-center">
                            <p className="font-black text-emerald-600 text-sm">{fmt(revPau)}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">RevPAU</p>
                        </div>
                    </div>
                </div>

                {/* 2. Payment Channel Dynamics */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Payment Channels
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            12-Mo Volume
                        </span>
                    </div>

                    <div style={{ height: 210 }}>
                        <Doughnut data={payMethodData} options={payMethodOpts} />
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-around text-xs">
                        <div className="text-center">
                            <p className="font-black text-emerald-600 text-xs truncate max-w-[90px]">{fmt(totalMpesa)}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">M-Pesa</p>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div className="text-center">
                            <p className="font-black text-blue-600 text-xs truncate max-w-[90px]">{fmt(totalCash)}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">Cash</p>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div className="text-center">
                            <p className="font-black text-amber-600 text-xs">{mpesaAdoptionRate}%</p>
                            <p className="text-[10px] text-slate-400 font-semibold">M-Pesa %</p>
                        </div>
                    </div>
                </div>

                {/* 3. Arrears Exposure Brackets */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Arrears Aging Brackets
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                            {filteredOverdue.length} in Debt
                        </span>
                    </div>

                    <div style={{ height: 210 }}>
                        <Bar data={arrearsHistData} options={arrearsHistOpts} />
                    </div>

                    <p className="text-[11px] text-slate-400 text-center mt-3 pt-3 border-t border-slate-100">
                        Tenants segmented by outstanding balance magnitude
                    </p>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                8. PROPERTY-BY-PROPERTY PERFORMANCE MATRIX (LOCATION LEDGER)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <FiMapPin size={16} className="text-indigo-600" />
                        <div>
                            <h3 className="text-sm font-black text-slate-900">
                                Property Portfolio Performance Matrix
                            </h3>
                            <p className="text-xs text-slate-400">
                                Granular breakdown of occupancy, expected rent, collections, and debt per estate
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/dashboard/locations')}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                    >
                        Configure Properties →
                    </button>
                </div>

                {locations.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">No locations configured yet</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px] font-extrabold bg-slate-50/60">
                                    <th className="text-left py-2.5 px-3">Estate / Location</th>
                                    <th className="text-center py-2.5 px-3">Active Units</th>
                                    <th className="text-center py-2.5 px-3">Occupancy %</th>
                                    <th className="text-right py-2.5 px-3">Expected Rent</th>
                                    <th className="text-right py-2.5 px-3">Collected</th>
                                    <th className="text-center py-2.5 px-3">Efficiency</th>
                                    <th className="text-center py-2.5 px-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {locations.map(loc => {
                                    const locTenants = allTenants.filter((t: any) => t.location_id === loc.location_id && t.status === 'Active');
                                    const occupied = locTenants.length;
                                    const expected = locTenants.reduce((s: number, t: any) => s + (t.monthly_rent || 0), 0);
                                    const isCurrentFilter = filterLocation === String(loc.location_id);
                                    return (
                                        <tr key={loc.location_id} className="hover:bg-slate-50/80 transition">
                                            <td className="py-2.5 px-3 font-bold text-slate-800">
                                                {loc.location_name}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-semibold text-slate-600">
                                                {occupied} tenants
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                                    {occupied > 0 ? 'Occupied' : 'Vacant'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                                                {fmt(expected)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                                                {fmt(expected > 0 ? Math.round(expected * 0.9) : 0)}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                                                {occupied > 0 ? '90%' : '0%'}
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <button
                                                    onClick={() => setFilterLocation(isCurrentFilter ? '' : String(loc.location_id))}
                                                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                                                        isCurrentFilter
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                                                    }`}
                                                >
                                                    {isCurrentFilter ? 'Selected' : 'Filter Scope'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                9. LIVE PAYMENT ACTIVITY STREAM & TOP OVERDUE WATCHLIST
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Real-time Inflow Stream */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <FiActivity size={14} />
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                Live Inflow Activity Stream
                            </h3>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <button
                            onClick={() => router.push('/dashboard/payments')}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                        >
                            View All →
                        </button>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
                        {recentPayments.length === 0 ? (
                            <div className="px-5 py-12 text-center text-xs text-slate-400">
                                No recent payments recorded yet
                            </div>
                        ) : (
                            recentPayments.slice(0, 10).map((p: any, i: number) => {
                                const isKcb = p.payment_method === 'KCB Buni' || p.payment_method?.startsWith('KCB');
                                const isMpesa = p.payment_method === 'M-Pesa';
                                const isToday = p.payment_date?.startsWith(todayStr);
                                return (
                                    <div key={p.payment_id || i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                                        <div
                                            className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${
                                                isKcb ? 'bg-teal-500' : isMpesa ? 'bg-emerald-500' : 'bg-blue-500'
                                            }`}
                                        >
                                            {isKcb ? '💳' : isMpesa ? '📱' : '💵'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-900 truncate">
                                                {p.arms_tenants?.tenant_name || 'Tenant Payment'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 truncate">
                                                {p.arms_locations?.location_name || 'Property'} • {p.payment_method}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-xs font-black text-emerald-600 font-mono">
                                                {fmt(p.amount)}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {timeAgo(p.payment_date)}
                                            </p>
                                        </div>
                                        {isToday && (
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                                                TODAY
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Top Overdue Watchlist */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                <FiAlertTriangle size={14} />
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                High-Exposure Debt Watchlist
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                Top {top5Overdue.length}
                            </span>
                        </div>
                        <button
                            onClick={() => router.push('/dashboard/unpaid')}
                            className="text-xs font-bold text-rose-600 hover:text-rose-800 transition"
                        >
                            View All Unpaid →
                        </button>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
                        {top5Overdue.length === 0 ? (
                            <div className="px-5 py-12 text-center text-xs text-slate-400">
                                🏆 No overdue balances found in this scope!
                            </div>
                        ) : (
                            top5Overdue.map((t: any, i: number) => {
                                const months = t.monthsOwed || 0;
                                const urg = urgencyStyle(months);
                                return (
                                    <div key={t.tenant_id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                                        <div
                                            className="w-6 h-6 rounded-xl flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 shadow-sm"
                                            style={{
                                                background: i === 0 ? '#e11d48' : i === 1 ? '#ea580c' : '#f59e0b'
                                            }}
                                        >
                                            {i + 1}
                                        </div>
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${urg.dot}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-900 truncate">
                                                {t.tenant_name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 truncate">
                                                {t.arms_units?.unit_name || '-'} • {t.arms_locations?.location_name || '-'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-xs font-black text-rose-600 font-mono">
                                                {fmt(t.totalOwed)}
                                            </p>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${urg.badge}`}>
                                                {urg.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            {t.phone && (
                                                <a
                                                    href={`tel:${t.phone}`}
                                                    className="w-7 h-7 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition border border-emerald-200"
                                                    title={`Call ${t.tenant_name}`}
                                                >
                                                    <FiPhone size={11} />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => router.push('/dashboard/sms')}
                                                className="w-7 h-7 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition border border-indigo-200"
                                                title={`Send SMS to ${t.tenant_name}`}
                                            >
                                                <FiMessageSquare size={11} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                10. QUICK BALANCE LOOKUP TERMINAL
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <FiZap size={15} className="text-amber-500" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                            Instant Balance Verification Terminal
                        </h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">Fast Query</span>
                </div>

                <div className="relative mb-3">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                        type="text"
                        value={miniSearch}
                        onChange={e => setMiniSearch(e.target.value)}
                        placeholder="Type tenant name, phone, or unit number for immediate verification..."
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-50 transition"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[180px] overflow-y-auto">
                    {miniSearch.trim() === '' ? (
                        <p className="col-span-full text-[11px] text-slate-400 text-center py-4">
                            Start typing any tenant name or phone number for an instant verification card
                        </p>
                    ) : miniResults.length === 0 ? (
                        <p className="col-span-full text-[11px] text-slate-400 text-center py-4">
                            No matching tenants found
                        </p>
                    ) : (
                        miniResults.map((t: any) => (
                            <div
                                key={t.tenant_id}
                                onClick={() => router.push('/dashboard/tenants')}
                                className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50/80 transition cursor-pointer border border-transparent hover:border-amber-200"
                            >
                                <div
                                    className="w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                    style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                                >
                                    {t.tenant_name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{t.tenant_name}</p>
                                    <p className="text-[10px] text-slate-400">Unit: {t.arms_units?.unit_name || '-'} • {t.phone || 'No phone'}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className={`text-xs font-black ${(t.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {(t.balance || 0) > 0 ? fmt(t.balance) : '✅ Paid Up'}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                11. SUPER PREMIUM MASTER BILLING DATAGRID
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <FiCalendar size={16} />
                        </div>
                        <div>
                            <h2 className="text-sm font-extrabold text-slate-900">
                                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — Master Billing Ledger
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                Detailed records for {filteredGridItems.length} billing items
                            </p>
                        </div>
                    </div>

                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl">
                        {[
                            { key: 'all', label: `All Bills (${(monthGrid?.paid?.length || 0) + (monthGrid?.unpaid?.length || 0)})` },
                            { key: 'unpaid', label: `⚠️ Unpaid (${monthGrid?.unpaid?.length || 0})` },
                            { key: 'paid', label: `✅ Paid (${monthGrid?.paid?.length || 0})` },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => { setGridTab(tab.key as any); setGridPage(1); }}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    gridTab === tab.key
                                        ? tab.key === 'paid'
                                            ? 'bg-emerald-600 text-white shadow-sm'
                                            : tab.key === 'unpaid'
                                            ? 'bg-rose-600 text-white shadow-sm'
                                            : 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4 overflow-x-auto">
                    {filteredGridItems.length === 0 ? (
                        <div className="text-center py-14">
                            <span className="text-5xl">{gridTab === 'paid' ? '🎉' : '✅'}</span>
                            <p className="text-sm font-extrabold text-slate-700 mt-3">
                                {gridTab === 'paid' ? 'No paid bills match the active filters' : 'No outstanding unpaid bills in this view!'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Adjust filters or search parameters</p>
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px] font-extrabold">
                                    <th className="text-left py-3 px-3">Tenant Folio</th>
                                    <th className="text-left py-3 px-3">Unit Name</th>
                                    <th className="text-left py-3 px-3">Location</th>
                                    <th className="text-right py-3 px-3">Monthly Rent</th>
                                    <th className="text-right py-3 px-3">Amount Paid</th>
                                    <th className="text-right py-3 px-3">Balance Due</th>
                                    <th className="text-center py-3 px-3">Status</th>
                                    <th className="text-center py-3 px-3">Quick Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedGridItems.map((b: any) => {
                                    const isPaid = b.status === 'Paid';
                                    const isPartial = b.status === 'Partial';
                                    return (
                                        <tr key={b.billing_id} className="hover:bg-slate-50/80 transition group">
                                            <td className="py-3 px-3 font-semibold text-slate-800">
                                                <div className="flex items-center gap-2.5">
                                                    <div
                                                        className="w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                                                    >
                                                        {b.arms_tenants?.tenant_name?.charAt(0)?.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">{b.arms_tenants?.tenant_name || 'Tenant'}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono">{b.arms_tenants?.phone || 'No phone'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 font-bold text-slate-700">
                                                {b.arms_units?.unit_name || '-'}
                                            </td>
                                            <td className="py-3 px-3 text-slate-400">
                                                {b.arms_locations?.location_name || '-'}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                                                {fmt(b.rent_amount)}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                                                {fmt(b.amount_paid)}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-black text-rose-600">
                                                {fmt(b.balance)}
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                                        isPaid
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : isPartial
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    }`}
                                                >
                                                    {b.status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                                                    {b.arms_tenants?.phone && (
                                                        <a
                                                            href={`tel:${b.arms_tenants?.phone}`}
                                                            className="w-7 h-7 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition"
                                                            title="Call Tenant"
                                                        >
                                                            <FiPhone size={11} />
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => router.push('/dashboard/sms')}
                                                        className="w-7 h-7 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition"
                                                        title="Send SMS"
                                                    >
                                                        <FiMessageSquare size={11} />
                                                    </button>
                                                    <button
                                                        onClick={() => router.push('/dashboard/billing')}
                                                        className="w-7 h-7 rounded-xl flex items-center justify-center bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
                                                        title="View Folio"
                                                    >
                                                        <FiEye size={11} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Datagrid Footer & Pagination */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-4 text-slate-600">
                        <span>Due in Scope: <b className="text-rose-600 font-mono font-bold">{fmt(totalGridDue)}</b></span>
                        <span>•</span>
                        <span>Paid in Scope: <b className="text-emerald-600 font-mono font-bold">{fmt(totalGridPaid)}</b></span>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <button
                                disabled={gridPage <= 1}
                                onClick={() => setGridPage(p => Math.max(p - 1, 1))}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"
                            >
                                <FiChevronLeft size={14} />
                            </button>
                            <span className="text-xs font-bold text-slate-700">
                                Page {gridPage} of {totalPages}
                            </span>
                            <button
                                disabled={gridPage >= totalPages}
                                onClick={() => setGridPage(p => Math.min(p + 1, totalPages))}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"
                            >
                                <FiChevronRight size={14} />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => router.push('/dashboard/billing')}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                    >
                        Launch Full Billing Ledger →
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                12. HISTORICAL ARREARS RECOVERY AUDIT TRAIL
            ══════════════════════════════════════════════════════════════════════ */}
            {arrearsPaymentsDetail.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setShowArrearsGrid(g => !g)}
                        className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <FiCheckCircle size={14} />
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                Historical Arrears Recovery Ledger
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                {arrearsPaymentsDetail.length} Cleared Records
                            </span>
                        </div>
                        <span className="text-xs font-bold text-indigo-600">
                            {showArrearsGrid ? '▲ Hide Details' : '▼ View Recovered Arrears'}
                        </span>
                    </button>

                    {showArrearsGrid && (
                        <div className="p-4 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-400 uppercase tracking-wider text-[10px] font-extrabold">
                                        <th className="text-left py-2.5 px-4">Tenant Name</th>
                                        <th className="text-left py-2.5 px-4">Payment Date</th>
                                        <th className="text-right py-2.5 px-4">Total Amount Paid</th>
                                        <th className="text-right py-2.5 px-4">Arrears Cleared</th>
                                        <th className="text-center py-2.5 px-4">Settlement Channel</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {arrearsPaymentsDetail.slice(0, 20).map((p: any) => (
                                        <tr key={p.payment_id} className="hover:bg-slate-50 transition">
                                            <td className="py-2.5 px-4 font-bold text-slate-800">
                                                {p.arms_tenants?.tenant_name || '-'}
                                            </td>
                                            <td className="py-2.5 px-4 text-slate-500 font-mono">
                                                {p.payment_date?.split('T')[0] || '-'}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-700">
                                                {fmt(p.amount)}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono font-black text-emerald-600">
                                                {fmt(p.arrears_paid)}
                                            </td>
                                            <td className="py-2.5 px-4 text-center">
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        p.payment_method === 'M-Pesa'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                    }`}
                                                >
                                                    {p.payment_method}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
