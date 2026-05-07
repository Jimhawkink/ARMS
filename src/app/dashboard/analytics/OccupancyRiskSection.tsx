'use client';
import { Radar, Bar } from 'react-chartjs-2';
import { KpiCard, DonutSVG, MiniBar, ScoreGauge, Sparkline, fmt, pct, COLORS } from './components';
import { FiAlertTriangle } from 'react-icons/fi';

export default function OccupancyRiskSection({ units, tenants, arrearsData, analytics, locationSummaries }: any) {
    const activeTenants = (tenants || []).filter((t: any) => t.status === 'Active');
    const totalUnits = (units || []).length;
    const occupied = (units || []).filter((u: any) => u.status === 'Occupied').length;
    const vacant = totalUnits - occupied;
    const occRate = pct(occupied, totalUnits);

    // Unit type breakdown
    const byType: Record<string, { total: number; occupied: number; revenue: number }> = {};
    (units || []).forEach((u: any) => {
        const t = u.unit_type || 'Standard';
        if (!byType[t]) byType[t] = { total: 0, occupied: 0, revenue: 0 };
        byType[t].total++;
        if (u.status === 'Occupied') { byType[t].occupied++; byType[t].revenue += u.monthly_rent || 0; }
    });

    // Vacancy cost (lost revenue from empty units)
    const vacantUnits = (units || []).filter((u: any) => u.status !== 'Occupied');
    const vacancyCost = vacantUnits.reduce((s: number, u: any) => s + (u.monthly_rent || 0), 0);
    const annualVacancyLoss = vacancyCost * 12;

    // Tenant risk scoring
    const critical = (arrearsData || []).filter((t: any) => (t.monthsOwed || 0) >= 3);
    const high = (arrearsData || []).filter((t: any) => (t.monthsOwed || 0) === 2);
    const medium = (arrearsData || []).filter((t: any) => (t.monthsOwed || 0) === 1);
    const totalArrears = (arrearsData || []).reduce((s: number, t: any) => s + (t.totalUnpaid || 0), 0);
    const totalOwed = (arrearsData || []).reduce((s: number, t: any) => s + (t.totalOwed || 0), 0);
    const totalPenalties = (arrearsData || []).reduce((s: number, t: any) => s + (t.totalPenalty || 0), 0);

    // Tenant tenure analysis
    const now = new Date();
    const tenureGroups = { 'New (<3mo)': 0, 'Short (3-6mo)': 0, 'Medium (6-12mo)': 0, 'Long (1-2yr)': 0, 'Veteran (2yr+)': 0 };
    activeTenants.forEach((t: any) => {
        const moveIn = new Date(t.move_in_date || t.created_at);
        const months = Math.floor((now.getTime() - moveIn.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
        if (months < 3) tenureGroups['New (<3mo)']++;
        else if (months < 6) tenureGroups['Short (3-6mo)']++;
        else if (months < 12) tenureGroups['Medium (6-12mo)']++;
        else if (months < 24) tenureGroups['Long (1-2yr)']++;
        else tenureGroups['Veteran (2yr+)']++;
    });

    // Collection rate sparkline data
    const collectionRates = (analytics || []).map((a: any) => a.rate || 0);
    const avgCollRate = collectionRates.length > 0 ? Math.round(collectionRates.reduce((a: number, b: number) => a + b, 0) / collectionRates.length) : 0;

    // Health scores
    const occupancyScore = occRate;
    const collectionScore = avgCollRate;
    const arrearsScore = Math.max(0, 100 - Math.round(((arrearsData || []).length / Math.max(activeTenants.length, 1)) * 100));
    const overallScore = Math.round((occupancyScore + collectionScore + arrearsScore) / 3);

    // Radar chart
    const radarData = {
        labels: ['Occupancy', 'Collection', 'Low Arrears', 'Tenant Retention', 'Revenue Growth'],
        datasets: [{
            label: 'Property Health', data: [occupancyScore, collectionScore, arrearsScore, Math.min(100, pct(activeTenants.length, totalUnits) + 15), Math.min(100, avgCollRate + 5)],
            backgroundColor: 'rgba(99,102,241,0.15)', borderColor: '#6366f1', borderWidth: 2.5, pointBackgroundColor: '#6366f1', pointRadius: 5, pointHoverRadius: 8,
        }]
    };
    const radarOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 25, font: { size: 10 }, color: '#94a3b8', backdropColor: 'transparent' }, grid: { color: 'rgba(0,0,0,0.06)' }, pointLabels: { font: { size: 11, weight: '600' }, color: '#475569' } } }
    };

    // Arrears bracket histogram
    const brackets = [
        { label: '0-5K', count: (arrearsData || []).filter((t: any) => t.totalOwed > 0 && t.totalOwed < 5000).length, color: '#10b981' },
        { label: '5K-10K', count: (arrearsData || []).filter((t: any) => t.totalOwed >= 5000 && t.totalOwed < 10000).length, color: '#f59e0b' },
        { label: '10K-20K', count: (arrearsData || []).filter((t: any) => t.totalOwed >= 10000 && t.totalOwed < 20000).length, color: '#ef4444' },
        { label: '20K+', count: (arrearsData || []).filter((t: any) => t.totalOwed >= 20000).length, color: '#b91c1c' },
    ];

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Health Score + KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                {/* Overall Health */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-center gap-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Overall Health Score</p>
                    <DonutSVG value={overallScore} max={100} color={overallScore >= 80 ? '#10b981' : overallScore >= 60 ? '#f59e0b' : '#ef4444'} size={130} label="score" />
                    <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${overallScore >= 80 ? 'bg-green-50 text-green-700' : overallScore >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {overallScore >= 80 ? '🟢 Excellent' : overallScore >= 60 ? '🟡 Fair' : '🔴 Needs Attention'}
                    </span>
                </div>
                {/* Sub-scores */}
                <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <KpiCard label="Occupancy Rate" value={`${occRate}%`} emoji="🏠" color="#6366f1" sub={`${occupied}/${totalUnits} units`} />
                    <KpiCard label="Vacant Units" value={vacant} emoji="🔓" color="#f59e0b" sub={`${fmt(vacancyCost)}/mo lost`} />
                    <KpiCard label="Annual Vacancy Loss" value={fmt(annualVacancyLoss)} emoji="💸" color="#ef4444" sub="Potential revenue" />
                    <KpiCard label="Avg Collection Rate" value={`${avgCollRate}%`} emoji="📊" color="#10b981" sub="12-month average" />
                    <KpiCard label="Tenants at Risk" value={(arrearsData || []).length} emoji="⚠️" color="#dc2626" sub={`${fmt(totalOwed)} total owed`} />
                    <KpiCard label="Active Tenants" value={activeTenants.length} emoji="👤" color="#0891b2" sub={`${totalUnits} total units`} />
                </div>
            </div>

            {/* Radar + Occupancy by Location */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">🎯 Property Health Radar</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Multi-dimensional performance assessment</p>
                    </div>
                    <div className="p-5" style={{ height: 300 }}>
                        <Radar data={radarData} options={radarOpts} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">📍 Occupancy by Location</h3>
                    </div>
                    <div className="p-5 space-y-4">
                        {(locationSummaries || []).map((loc: any, i: number) => {
                            const clr = COLORS[i % COLORS.length];
                            const rate = pct(loc.occupiedUnits || 0, loc.totalUnits || 1);
                            return (
                                <div key={loc.location_id}>
                                    <div className="flex justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: clr.text }} />
                                            <span className="text-xs font-bold text-gray-800">{loc.location_name}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="text-gray-500">{loc.occupiedUnits || 0}/{loc.totalUnits || 0}</span>
                                            <span className="font-extrabold" style={{ color: rate >= 80 ? '#10b981' : '#f59e0b' }}>{rate}%</span>
                                        </div>
                                    </div>
                                    <MiniBar value={loc.occupiedUnits || 0} max={loc.totalUnits || 1} color={clr.text} />
                                    <div className="flex gap-4 mt-1 text-[9px] text-gray-400">
                                        <span>✅ {loc.occupiedUnits || 0} occ.</span>
                                        <span>🔓 {loc.vacantUnits || 0} vacant</span>
                                        <span>💰 {fmt(loc.expectedRevenue || 0)}/mo</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Risk Matrix + Tenure + Unit Types */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Risk Level Cards */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">🚦 Risk Matrix</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        {[
                            { label: '🚨 Critical (3+ mo)', count: critical.length, owed: critical.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0), color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
                            { label: '⚠️ High (2 mo)', count: high.length, owed: high.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0), color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
                            { label: '⏰ Medium (1 mo)', count: medium.length, owed: medium.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0), color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                        ].map((r, i) => (
                            <div key={i} className="rounded-xl border-2 p-3" style={{ background: r.bg, borderColor: r.border }}>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] font-bold" style={{ color: r.color }}>{r.label}</span>
                                    <span className="text-lg font-black" style={{ color: r.color }}>{r.count}</span>
                                </div>
                                <p className="text-[10px] font-bold mt-1" style={{ color: r.color + '99' }}>{fmt(r.owed)} owed</p>
                                {r.count > 0 && (
                                    <div className="mt-2 space-y-1">
                                        {(r.label.includes('Critical') ? critical : r.label.includes('High') ? high : medium).slice(0, 3).map((t: any, ti: number) => (
                                            <div key={ti} className="flex justify-between items-center bg-white/60 rounded-lg px-2 py-1 border" style={{ borderColor: r.border }}>
                                                <span className="text-[10px] font-bold text-gray-800 truncate max-w-[100px]">{t.tenant_name}</span>
                                                <span className="text-[10px] font-extrabold" style={{ color: r.color }}>{fmt(t.totalOwed)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tenant Tenure */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">👥 Tenant Tenure Analysis</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">How long tenants have stayed</p>
                    </div>
                    <div className="p-4 space-y-3">
                        {Object.entries(tenureGroups).map(([label, count], i) => {
                            const clr = COLORS[i % COLORS.length];
                            return (
                                <div key={label}>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-xs font-bold text-gray-700">{label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-extrabold" style={{ color: clr.text }}>{count}</span>
                                            <span className="text-[9px] text-gray-400">{pct(count, activeTenants.length || 1)}%</span>
                                        </div>
                                    </div>
                                    <MiniBar value={count} max={Math.max(...Object.values(tenureGroups), 1)} color={clr.text} />
                                </div>
                            );
                        })}
                        <div className="mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                            <p className="text-[10px] font-bold text-indigo-700">📊 Avg Tenure: {activeTenants.length > 0 ? Math.round(activeTenants.reduce((s: number, t: any) => {
                                const moveIn = new Date(t.move_in_date || t.created_at);
                                return s + Math.floor((now.getTime() - moveIn.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
                            }, 0) / activeTenants.length) : 0} months</p>
                        </div>
                    </div>
                </div>

                {/* Unit Type Breakdown */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">🏷️ Unit Type Performance</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        {Object.entries(byType).sort((a, b) => b[1].total - a[1].total).map(([type, data], i) => {
                            const clr = COLORS[i % COLORS.length];
                            const rate = pct(data.occupied, data.total);
                            return (
                                <div key={type} className="rounded-xl border-2 p-3 relative overflow-hidden" style={{ background: clr.bg, borderColor: clr.border }}>
                                    <div className="absolute -bottom-3 -right-3 w-12 h-12 rounded-full opacity-10" style={{ background: clr.text }} />
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold" style={{ color: clr.text }}>{type}</span>
                                        <span className="text-lg font-black" style={{ color: clr.text }}>{rate}%</span>
                                    </div>
                                    <MiniBar value={data.occupied} max={data.total} color={clr.text} />
                                    <div className="flex justify-between mt-1.5 text-[9px]" style={{ color: clr.text + '99' }}>
                                        <span>{data.occupied}/{data.total} occupied</span>
                                        <span>{fmt(data.revenue)}/mo</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Arrears Distribution + Collection Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">📊 Arrears Distribution</h3>
                    </div>
                    <div className="p-5">
                        <div className="flex items-end gap-4 h-40">
                            {brackets.map((b, i) => {
                                const maxC = Math.max(...brackets.map(x => x.count), 1);
                                const h = Math.max(8, Math.round((b.count / maxC) * 130));
                                return (
                                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                                        <span className="text-[10px] font-extrabold" style={{ color: b.color }}>{b.count}</span>
                                        <div className="w-full rounded-t-xl" style={{ height: h, background: b.color, opacity: 0.75 }} />
                                        <span className="text-[9px] font-bold text-gray-500">{b.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-center">
                                <p className="text-[10px] font-bold text-red-600">Total Arrears</p>
                                <p className="text-sm font-extrabold text-red-700">{fmt(totalArrears)}</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                                <p className="text-[10px] font-bold text-amber-600">Penalties</p>
                                <p className="text-sm font-extrabold text-amber-700">{fmt(totalPenalties)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                        <h3 className="text-sm font-bold text-gray-900">📈 Collection Rate Trend</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">12-month collection efficiency</p>
                    </div>
                    <div className="p-5">
                        <div className="flex items-end gap-3 h-40">
                            {(analytics || []).map((a: any, i: number) => {
                                const h = Math.max(8, Math.round((a.rate / 100) * 130));
                                const clr = a.rate >= 80 ? '#10b981' : a.rate >= 50 ? '#f59e0b' : '#ef4444';
                                return (
                                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                                        <span className="text-[8px] font-extrabold" style={{ color: clr }}>{a.rate}%</span>
                                        <div className="w-full rounded-t-lg" style={{ height: h, background: clr, opacity: 0.7 }} />
                                        <span className="text-[7px] font-bold text-gray-400">{a.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-indigo-700">12-Month Average</span>
                            <span className="text-sm font-extrabold text-indigo-800">{avgCollRate}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
