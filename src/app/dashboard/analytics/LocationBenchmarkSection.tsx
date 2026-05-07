'use client';
import { KpiCard, DonutSVG, MiniBar, fmt, pct, COLORS } from './components';

export default function LocationBenchmarkSection({ locations, locationSummaries, payments, arrearsData, units, tenants }: any) {
    const activeTenants = (tenants || []).filter((t: any) => t.status === 'Active');

    // Enhanced location data
    const locData = (locationSummaries || []).map((loc: any, i: number) => {
        const locPayments = (payments || []).filter((p: any) => p.location_id === loc.location_id);
        const locArrears = (arrearsData || []).filter((a: any) => a.location_id === loc.location_id);
        const locUnits = (units || []).filter((u: any) => u.location_id === loc.location_id);
        const totalCollected = locPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const totalArrears = locArrears.reduce((s: number, a: any) => s + (a.totalOwed || 0), 0);
        const avgRent = loc.activeTenants > 0 ? Math.round((loc.expectedRevenue || 0) / loc.activeTenants) : 0;
        const occRate = pct(loc.occupiedUnits || 0, loc.totalUnits || 1);
        const collRate = loc.expectedRevenue > 0 ? pct(totalCollected, loc.expectedRevenue * 12) : 0;

        // Payment methods for this location
        const mpesa = locPayments.filter((p: any) => p.payment_method === 'M-Pesa').reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const cash = locPayments.filter((p: any) => p.payment_method === 'Cash').reduce((s: number, p: any) => s + (p.amount || 0), 0);

        // Vacancy cost
        const vacantUnits = locUnits.filter((u: any) => u.status !== 'Occupied');
        const vacancyCost = vacantUnits.reduce((s: number, u: any) => s + (u.monthly_rent || 0), 0);

        return {
            ...loc, totalCollected, totalArrears, avgRent, occRate, collRate,
            mpesa, cash, vacancyCost, tenantsWithArrears: locArrears.length,
            color: COLORS[i % COLORS.length]
        };
    });

    // Best & worst performers
    const bestOcc = [...locData].sort((a, b) => b.occRate - a.occRate)[0];
    const worstOcc = [...locData].sort((a, b) => a.occRate - b.occRate)[0];
    const topRevenue = [...locData].sort((a, b) => b.totalCollected - a.totalCollected)[0];
    const highestArrears = [...locData].sort((a, b) => b.totalArrears - a.totalArrears)[0];

    // Payment timing analysis
    const paymentsByDayOfMonth: Record<number, { count: number; amount: number }> = {};
    (payments || []).forEach((p: any) => {
        const day = new Date(p.payment_date).getDate();
        if (!paymentsByDayOfMonth[day]) paymentsByDayOfMonth[day] = { count: 0, amount: 0 };
        paymentsByDayOfMonth[day].count++;
        paymentsByDayOfMonth[day].amount += p.amount || 0;
    });

    // Group into periods
    const paymentTiming = [
        { label: '1st-5th (On Time)', range: [1, 5], color: '#10b981', emoji: '✅' },
        { label: '6th-10th (Grace)', range: [6, 10], color: '#f59e0b', emoji: '⏰' },
        { label: '11th-15th (Late)', range: [11, 15], color: '#ef4444', emoji: '⚠️' },
        { label: '16th+ (Very Late)', range: [16, 31], color: '#b91c1c', emoji: '🚨' },
    ].map(period => {
        let count = 0, amount = 0;
        for (let d = period.range[0]; d <= period.range[1]; d++) {
            if (paymentsByDayOfMonth[d]) { count += paymentsByDayOfMonth[d].count; amount += paymentsByDayOfMonth[d].amount; }
        }
        return { ...period, count, amount };
    });
    const totalPaymentCount = paymentTiming.reduce((s, p) => s + p.count, 0);

    // Payment method preference by location
    const maxCollected = Math.max(...locData.map((l: any) => l.totalCollected), 1);

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Top Performers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {bestOcc && <KpiCard label="🏆 Best Occupancy" value={`${bestOcc.occRate}%`} emoji="🏠" color="#10b981" sub={bestOcc.location_name} />}
                {topRevenue && <KpiCard label="💰 Top Revenue" value={fmt(topRevenue.totalCollected)} emoji="📈" color="#6366f1" sub={topRevenue.location_name} />}
                {worstOcc && <KpiCard label="⚠️ Lowest Occupancy" value={`${worstOcc.occRate}%`} emoji="🔓" color="#f59e0b" sub={worstOcc.location_name} />}
                {highestArrears && <KpiCard label="🚨 Highest Arrears" value={fmt(highestArrears.totalArrears)} emoji="💸" color="#ef4444" sub={highestArrears.location_name} />}
            </div>

            {/* Location Comparison Matrix */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50">
                    <h3 className="text-sm font-bold text-gray-900">📍 Location Benchmarking Matrix</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Side-by-side comparison of all properties</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 12 }}>
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                {['Location', 'Units', 'Occ. Rate', 'Revenue', 'Avg Rent', 'Arrears', 'Vacancy Loss', 'M-Pesa %', 'Score'].map((h, i) => (
                                    <th key={i} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {locData.map((loc: any) => {
                                const score = Math.round((loc.occRate + loc.collRate + Math.max(0, 100 - pct(loc.totalArrears, loc.expectedRevenue * 12 || 1))) / 3);
                                return (
                                    <tr key={loc.location_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: loc.color.text }} />
                                                <span className="font-bold text-gray-900">{loc.location_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-gray-700">{loc.occupiedUnits || 0}/{loc.totalUnits || 0}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-12 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${loc.occRate}%`, background: loc.occRate >= 80 ? '#10b981' : '#f59e0b' }} />
                                                </div>
                                                <span className="font-extrabold text-xs" style={{ color: loc.occRate >= 80 ? '#10b981' : '#c2410c' }}>{loc.occRate}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-green-700">{fmt(loc.totalCollected)}</td>
                                        <td className="px-4 py-3 font-bold text-indigo-600">{fmt(loc.avgRent)}</td>
                                        <td className="px-4 py-3">
                                            {loc.totalArrears > 0 ? (
                                                <span className="font-extrabold text-red-600">{fmt(loc.totalArrears)}</span>
                                            ) : <span className="text-green-600 font-bold text-[10px]">✅ Clear</span>}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-amber-600">{fmt(loc.vacancyCost)}/mo</td>
                                        <td className="px-4 py-3">
                                            <span className="font-bold text-green-600">{loc.totalCollected > 0 ? pct(loc.mpesa, loc.totalCollected) : 0}%</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-black ${score >= 70 ? 'bg-green-50 text-green-700 border border-green-200' : score >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                                {score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴'} {score}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Location Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locData.map((loc: any) => (
                    <div key={loc.location_id} className="rounded-2xl border-2 p-5 relative overflow-hidden hover:shadow-lg transition-all" style={{ background: loc.color.bg, borderColor: loc.color.border }}>
                        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-10" style={{ background: loc.color.text }} />
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: loc.color.text }}>📍 {loc.location_name}</p>
                                <p className="text-xl font-black mt-1" style={{ color: loc.color.text }}>{fmt(loc.totalCollected)}</p>
                                <p className="text-[9px] font-semibold mt-0.5" style={{ color: loc.color.text + '99' }}>Total collected</p>
                            </div>
                            <DonutSVG value={loc.occRate} max={100} color={loc.color.text} size={68} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                                { label: 'Tenants', value: loc.activeTenants || 0 },
                                { label: 'Avg Rent', value: fmt(loc.avgRent) },
                                { label: 'Arrears', value: fmt(loc.totalArrears) },
                                { label: 'Vacancy', value: fmt(loc.vacancyCost) + '/mo' },
                            ].map((s, j) => (
                                <div key={j} className="bg-white/60 rounded-xl p-2 text-center border" style={{ borderColor: loc.color.border }}>
                                    <p className="font-extrabold" style={{ color: loc.color.text }}>{s.value}</p>
                                    <p className="text-gray-500 text-[8px] mt-0.5 font-bold uppercase">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Payment Timing Analysis */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50">
                    <h3 className="text-sm font-bold text-gray-900">⏰ Payment Timing Intelligence</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">When do tenants typically pay? Based on {totalPaymentCount} total payments</p>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {paymentTiming.map((period, i) => (
                            <div key={i} className="rounded-xl border-2 p-4 text-center relative overflow-hidden" style={{ borderColor: period.color + '40', background: period.color + '08' }}>
                                <span className="text-2xl">{period.emoji}</span>
                                <p className="text-2xl font-black mt-2" style={{ color: period.color }}>{period.count}</p>
                                <p className="text-[10px] font-bold mt-1" style={{ color: period.color }}>{period.label}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{fmt(period.amount)}</p>
                                <div className="mt-2">
                                    <MiniBar value={period.count} max={totalPaymentCount || 1} color={period.color} />
                                </div>
                                <p className="text-[9px] font-bold mt-1" style={{ color: period.color + '99' }}>{pct(period.count, totalPaymentCount || 1)}%</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
                        <p className="text-[10px] font-bold text-blue-700">
                            💡 Insight: {paymentTiming[0].count > paymentTiming[2].count + paymentTiming[3].count
                                ? '✅ Most tenants pay on time (1st-5th). Great collection discipline!'
                                : '⚠️ Significant late payments detected. Consider automated reminders before the 5th.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
