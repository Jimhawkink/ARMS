'use client';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { KpiCard, DonutSVG, MiniBar, Sparkline, fmt, pct, monthLabel, COLORS } from './components';
import { FiTrendingUp, FiTrendingDown, FiArrowUpRight, FiArrowDownRight } from 'react-icons/fi';

export default function RevenueSection({ analytics, payments, expenses, locations, locationSummaries }: any) {
    const currentMonth = analytics[analytics.length - 1];
    const prevMonth = analytics[analytics.length - 2];
    const momChange = prevMonth?.collected > 0 ? Math.round(((currentMonth?.collected - prevMonth?.collected) / prevMonth.collected) * 100) : 0;

    // Revenue forecast (simple linear regression on last 6 months)
    const last6 = analytics.slice(-6);
    const avgGrowth = last6.length > 1 ? last6.reduce((s: number, a: any, i: number) => {
        if (i === 0) return 0;
        return s + (a.collected - last6[i - 1].collected);
    }, 0) / (last6.length - 1) : 0;
    const forecast3mo = Math.max(0, (currentMonth?.collected || 0) + avgGrowth * 3);
    const annualProjection = analytics.reduce((s: number, a: any) => s + (a.collected || 0), 0);

    // Expense data
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const totalRevenue = analytics.reduce((s: number, a: any) => s + (a.collected || 0), 0);
    const netIncome = totalRevenue - totalExpenses;
    const expenseRatio = totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 100) : 0;

    // Expense by category
    const expByCat: Record<string, number> = {};
    (expenses || []).forEach((e: any) => {
        const cat = e.category || 'Other';
        expByCat[cat] = (expByCat[cat] || 0) + (e.amount || 0);
    });
    const topExpenses = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Monthly revenue vs expenses
    const monthlyExpenses: Record<string, number> = {};
    (expenses || []).forEach((e: any) => {
        const m = (e.expense_date || '').slice(0, 7);
        if (m) monthlyExpenses[m] = (monthlyExpenses[m] || 0) + (e.amount || 0);
    });

    // Payment method trends
    const totalCash = analytics.reduce((s: number, a: any) => s + (a.cashCollected || 0), 0);
    const totalMpesa = analytics.reduce((s: number, a: any) => s + (a.mpesaCollected || 0), 0);
    const totalOther = Math.max(0, totalRevenue - totalCash - totalMpesa);

    // Chart configs
    const labels = analytics.map((a: any) => a.label);
    const tooltip = { backgroundColor: '#0f172a', titleFont: { size: 12, family: 'Outfit' }, bodyFont: { size: 12, family: 'Inter' }, padding: 14, cornerRadius: 12 };

    const revenueVsExpenseData = {
        labels,
        datasets: [
            { label: 'Revenue', data: analytics.map((a: any) => a.collected), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2.5, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#10b981' },
            { label: 'Expenses', data: analytics.map((a: any) => monthlyExpenses[a.month] || 0), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#ef4444' },
            { label: 'Net Income', data: analytics.map((a: any) => (a.collected || 0) - (monthlyExpenses[a.month] || 0)), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.06)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#6366f1', borderDash: [5, 3] },
        ]
    };

    const cashVsMpesaData = {
        labels,
        datasets: [
            { label: 'Cash', data: analytics.map((a: any) => a.cashCollected), backgroundColor: 'rgba(59,130,246,0.7)', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
            { label: 'M-Pesa', data: analytics.map((a: any) => a.mpesaCollected), backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#10b981', borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
        ]
    };

    const payMethodDonut = {
        labels: ['M-Pesa', 'Cash', 'Other'],
        datasets: [{ data: [totalMpesa, totalCash, totalOther], backgroundColor: ['#10b981', '#3b82f6', '#f59e0b'], borderWidth: 0, hoverOffset: 8 }]
    };

    const chartOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 16, font: { size: 11, weight: '600' }, color: '#64748b' } }, tooltip },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11 }, color: '#94a3b8' }, border: { display: false } },
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' }, border: { display: false } }
        }
    };
    const stackedOpts = { ...chartOpts, scales: { ...chartOpts.scales, x: { ...chartOpts.scales.x, stacked: true }, y: { ...chartOpts.scales.y, stacked: true } } };

    // Revenue by location
    const revByLoc = (locationSummaries || []).map((loc: any, i: number) => {
        const locPay = (payments || []).filter((p: any) => p.location_id === loc.location_id).reduce((s: number, p: any) => s + (p.amount || 0), 0);
        return { ...loc, totalCollected: locPay, color: COLORS[i % COLORS.length] };
    }).sort((a: any, b: any) => b.totalCollected - a.totalCollected);
    const maxLocRev = Math.max(...revByLoc.map((l: any) => l.totalCollected), 1);

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <KpiCard label="Total Revenue (12mo)" value={fmt(totalRevenue)} emoji="💰" color="#10b981" sub="All collections" trend={momChange} />
                <KpiCard label="Total Expenses (12mo)" value={fmt(totalExpenses)} emoji="📉" color="#ef4444" sub={`${expenseRatio}% of revenue`} />
                <KpiCard label="Net Income" value={fmt(netIncome)} emoji={netIncome >= 0 ? '📈' : '🚨'} color={netIncome >= 0 ? '#059669' : '#dc2626'} sub={netIncome >= 0 ? 'Profitable' : 'Loss-making'} />
                <KpiCard label="3-Month Forecast" value={fmt(forecast3mo)} emoji="🔮" color="#8b5cf6" sub="Projected revenue" />
                <KpiCard label="Annual Projection" value={fmt(annualProjection)} emoji="🏆" color="#d97706" sub="Based on 12mo trend" />
            </div>

            {/* Revenue vs Expenses Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">💹 Revenue vs Expenses vs Net Income</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">12-month financial performance trend</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold ${momChange >= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                            {momChange >= 0 ? <FiArrowUpRight size={12} /> : <FiArrowDownRight size={12} />}
                            {Math.abs(momChange)}% MoM
                        </span>
                    </div>
                </div>
                <div className="p-5" style={{ height: 320 }}>
                    <Line data={revenueVsExpenseData} options={chartOpts} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Cash vs M-Pesa Stacked */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">💳 Cash vs M-Pesa Breakdown</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Payment method distribution by month</p>
                    </div>
                    <div className="p-5" style={{ height: 280 }}>
                        <Bar data={cashVsMpesaData} options={stackedOpts} />
                    </div>
                </div>

                {/* Payment Method Split Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">📊 Payment Method Share</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">All-time payment method breakdown</p>
                    </div>
                    <div className="p-5 flex items-center gap-6">
                        <div style={{ width: 180, height: 180 }}>
                            <Doughnut data={payMethodDonut} options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }} />
                        </div>
                        <div className="flex-1 space-y-3">
                            {[{ label: 'M-Pesa', value: totalMpesa, color: '#10b981', emoji: '📱' }, { label: 'Cash', value: totalCash, color: '#3b82f6', emoji: '💵' }, { label: 'Other', value: totalOther, color: '#f59e0b', emoji: '🏦' }].map((m, i) => (
                                <div key={i}>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-xs font-bold text-gray-700">{m.emoji} {m.label}</span>
                                        <span className="text-xs font-extrabold" style={{ color: m.color }}>{fmt(m.value)}</span>
                                    </div>
                                    <MiniBar value={m.value} max={totalRevenue || 1} color={m.color} />
                                    <p className="text-[9px] text-gray-400 mt-0.5">{pct(m.value, totalRevenue || 1)}% of total</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Revenue by Location + Top Expenses */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Revenue by Location */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">📍 Revenue By Location</h3>
                    </div>
                    <div className="p-5 space-y-4">
                        {revByLoc.map((loc: any) => (
                            <div key={loc.location_id}>
                                <div className="flex justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: loc.color.text }} />
                                        <span className="text-xs font-bold text-gray-800">{loc.location_name}</span>
                                    </div>
                                    <span className="text-xs font-extrabold" style={{ color: loc.color.text }}>{fmt(loc.totalCollected)}</span>
                                </div>
                                <MiniBar value={loc.totalCollected} max={maxLocRev} color={loc.color.text} />
                                <div className="flex gap-4 mt-1 text-[9px] text-gray-400">
                                    <span>{pct(loc.totalCollected, totalRevenue || 1)}% of total</span>
                                    <span>Expected: {fmt(loc.expectedRevenue || 0)}/mo</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Expense Categories */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">🧾 Top Expense Categories</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Where your money goes</p>
                    </div>
                    <div className="p-5 space-y-4">
                        {topExpenses.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No expense data yet</p>}
                        {topExpenses.map(([cat, amount], i) => (
                            <div key={cat}>
                                <div className="flex justify-between mb-1.5">
                                    <span className="text-xs font-bold text-gray-800">{cat}</span>
                                    <div className="text-right">
                                        <span className="text-xs font-extrabold text-red-600">{fmt(amount)}</span>
                                        <span className="text-[9px] text-gray-400 ml-1">{pct(amount, totalExpenses || 1)}%</span>
                                    </div>
                                </div>
                                <MiniBar value={amount} max={topExpenses[0]?.[1] || 1} color={COLORS[i % COLORS.length].text} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* P&L Waterfall Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50">
                    <h3 className="text-sm font-bold text-gray-900">📈 Profit & Loss Waterfall</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Financial flow from revenue to net income</p>
                </div>
                <div className="p-5">
                    <div className="flex items-end gap-3 h-48">
                        {[
                            { label: 'Gross Revenue', value: totalRevenue, color: '#10b981' },
                            { label: 'Expenses', value: -totalExpenses, color: '#ef4444' },
                            { label: 'Net Income', value: netIncome, color: netIncome >= 0 ? '#6366f1' : '#dc2626' },
                        ].map((item, i) => {
                            const absMax = Math.max(totalRevenue, totalExpenses, Math.abs(netIncome), 1);
                            const h = Math.max(20, Math.round((Math.abs(item.value) / absMax) * 160));
                            return (
                                <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                                    <p className="text-[10px] font-extrabold" style={{ color: item.color }}>{fmt(Math.abs(item.value))}</p>
                                    <div className="w-full rounded-t-xl transition-all duration-700" style={{ height: h, background: item.color, opacity: 0.8 }} />
                                    <p className="text-[10px] font-bold text-gray-500 text-center">{item.label}</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-6 text-xs">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-200">
                            <span className="font-bold text-green-700">Expense Ratio</span>
                            <span className="font-extrabold text-green-800">{expenseRatio}%</span>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${netIncome >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`}>
                            <span className={`font-bold ${netIncome >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>Net Margin</span>
                            <span className={`font-extrabold ${netIncome >= 0 ? 'text-indigo-800' : 'text-red-800'}`}>{totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 100) : 0}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
