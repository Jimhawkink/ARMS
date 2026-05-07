'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMpesaTransactions, getLocations, getTenants, supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    FiSearch, FiRefreshCw, FiX, FiChevronLeft, FiChevronRight,
    FiSmartphone, FiDollarSign, FiHash, FiClock, FiMapPin,
    FiUsers, FiCalendar, FiFilter, FiTrendingUp, FiCheckCircle,
    FiAlertTriangle, FiPhone, FiHome, FiLayers, FiArrowUp, FiArrowDown,
} from 'react-icons/fi';

const C = {
    date:     { bg:'#eef2ff', text:'#4338ca', head:'#c7d2fe' },
    sender:   { bg:'#f0fdfa', text:'#0f766e', head:'#99f6e4' },
    phone:    { bg:'#faf5ff', text:'#7c3aed', head:'#e9d5ff' },
    amount:   { bg:'#f0fdf4', text:'#15803d', head:'#bbf7d0' },
    code:     { bg:'#fffbeb', text:'#b45309', head:'#fde68a' },
    tenant:   { bg:'#eff6ff', text:'#1d4ed8', head:'#bfdbfe' },
    location: { bg:'#f8fafc', text:'#475569', head:'#e2e8f0' },
    room:     { bg:'#fff1f2', text:'#be123c', head:'#fecdd3' },
    status:   { bg:'#ecfdf5', text:'#059669', head:'#a7f3d0' },
    actions:  { bg:'#f5f3ff', text:'#6d28d9', head:'#ddd6fe' },
};
const fmt = (n: number) => `KES ${(n||0).toLocaleString()}`;
const PAGE_SIZES = [10, 25, 50, 100];

export default function MpesaTransactionsPage() {
    const [allTxns, setAllTxns] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState<number|null>(null);
    const [matchFilter, setMatchFilter] = useState<'all'|'matched'|'unmatched'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: txns } = await supabase.from('arms_mpesa_transactions')
                .select('*').order('created_at', { ascending: false }).limit(5000);
            const [t, l] = await Promise.all([getTenants(), getLocations()]);
            setAllTxns(txns || []); setTenants(t); setLocations(l);
        } catch { toast.error('Failed to load M-Pesa data'); }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Build tenant lookup by phone
    const tenantByPhone = useMemo(() => {
        const map: Record<string, any> = {};
        tenants.forEach(t => {
            const norm = (t.phone||'').replace(/[^0-9]/g,'').replace(/^254/,'0');
            if (norm.length >= 9) map[norm] = t;
        });
        return map;
    }, [tenants]);

    const normPhone = (p: string) => p.replace(/[^0-9]/g,'').replace(/^254/,'0');

    // Filtered data
    const filtered = useMemo(() => {
        let items = [...allTxns];
        if (matchFilter === 'matched') items = items.filter(t => t.matched);
        if (matchFilter === 'unmatched') items = items.filter(t => !t.matched);
        if (dateFrom) items = items.filter(t => (t.created_at||'') >= dateFrom);
        if (dateTo) items = items.filter(t => (t.created_at||'') <= dateTo + 'T23:59:59');
        if (locationFilter) {
            items = items.filter(t => {
                const tn = tenantByPhone[normPhone(t.msisdn||'')];
                return tn && tn.location_id === locationFilter;
            });
        }
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(t => {
                const name = `${t.first_name||''} ${t.last_name||''}`.toLowerCase();
                const phone = (t.msisdn||'').toLowerCase();
                const code = (t.trans_id||'').toLowerCase();
                const tn = tenantByPhone[normPhone(t.msisdn||'')];
                const tName = (tn?.tenant_name||'').toLowerCase();
                const unit = (tn?.arms_units?.unit_name||'').toLowerCase();
                return name.includes(s) || phone.includes(s) || code.includes(s) || tName.includes(s) || unit.includes(s);
            });
        }
        return items;
    }, [allTxns, matchFilter, dateFrom, dateTo, locationFilter, search, tenantByPhone]);

    // KPI stats
    const totalAmount = filtered.reduce((s,t) => s + (t.trans_amount||0), 0);
    const matchedCount = filtered.filter(t => t.matched).length;
    const unmatchedCount = filtered.filter(t => !t.matched).length;
    const todayTxns = filtered.filter(t => (t.created_at||'').startsWith(new Date().toISOString().split('T')[0]));
    const todayAmount = todayTxns.reduce((s,t) => s + (t.trans_amount||0), 0);

    // Daily chart data (last 14 days)
    const chartData = useMemo(() => {
        const days: Record<string, number> = {};
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            days[d.toISOString().split('T')[0]] = 0;
        }
        allTxns.forEach(t => {
            const day = (t.created_at||'').slice(0,10);
            if (days[day] !== undefined) days[day] += (t.trans_amount||0);
        });
        return Object.entries(days).map(([d,v]) => ({ day: d, amount: v }));
    }, [allTxns]);
    const chartMax = Math.max(...chartData.map(d => d.amount), 1);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page-1)*pageSize, page*pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:'linear-gradient(135deg,#10b981,#059669)'}}>📱</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-green-200 animate-ping opacity-30"/>
            </div>
            <p className="text-sm font-bold text-gray-500">Loading M-Pesa transactions…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">📱 M-Pesa Transactions</h1>
                    <p className="text-sm text-gray-500 mt-1">{allTxns.length} total · {matchedCount} matched · {unmatchedCount} pending</p>
                </div>
                <button onClick={loadData} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-green-600 hover:border-green-200 transition"><FiRefreshCw size={15}/></button>
            </div>

            {/* Glassmorphic KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    {label:'Total Transactions',value:filtered.length,icon:FiHash,color:'#6366f1',bg:'#eef2ff',sub:'All records'},
                    {label:"Today's Volume",value:fmt(todayAmount),icon:FiTrendingUp,color:'#10b981',bg:'#f0fdf4',sub:`${todayTxns.length} txns today`},
                    {label:'Total Value',value:fmt(totalAmount),icon:FiDollarSign,color:'#3b82f6',bg:'#eff6ff',sub:'Filtered total'},
                    {label:'Matched',value:matchedCount,icon:FiCheckCircle,color:'#059669',bg:'#ecfdf5',sub:'Linked to tenants'},
                    {label:'Unmatched',value:unmatchedCount,icon:FiAlertTriangle,color:'#ef4444',bg:'#fef2f2',sub:'Pending match'},
                ].map((card,i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{borderLeftWidth:4,borderLeftColor:card.color}}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <div className="p-2 rounded-xl" style={{background:card.bg}}><card.icon size={16} style={{color:card.color}}/></div>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{background:card.color}}/>
                    </div>
                ))}
            </div>

            {/* Mini Line Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><FiTrendingUp size={14} className="text-green-600"/> Daily M-Pesa Volume</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">Last 14 days</p>
                    </div>
                </div>
                <div className="flex items-end gap-1.5" style={{height:120}}>
                    {chartData.map((d,i) => {
                        const h = Math.max(4, (d.amount / chartMax) * 100);
                        const isToday = d.day === new Date().toISOString().split('T')[0];
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                                    {fmt(d.amount)}<br/>{new Date(d.day).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                                </div>
                                <div className="w-full rounded-t-lg transition-all group-hover:opacity-80" style={{
                                    height:`${h}%`, minHeight:4,
                                    background: isToday ? 'linear-gradient(180deg,#10b981,#059669)' : `linear-gradient(180deg,#6366f1,#8b5cf6)`,
                                    opacity: isToday ? 1 : 0.7,
                                }}/>
                                <span className="text-[8px] text-gray-400 font-bold">{new Date(d.day).getDate()}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15}/>
                        <input value={search} onChange={e => {setSearch(e.target.value);setPage(1);}}
                            placeholder="Search code, phone, sender, tenant, room…"
                            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-green-300 focus:ring-4 focus:ring-green-50 transition-all"/>
                        {search && <button onClick={() => {setSearch('');setPage(1);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14}/></button>}
                    </div>
                    {/* Match filter */}
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                        {([{k:'all',l:'All'},{k:'matched',l:'✅ Matched'},{k:'unmatched',l:'⏳ Pending'}] as const).map(f => (
                            <button key={f.k} onClick={() => {setMatchFilter(f.k as any);setPage(1);}}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${matchFilter===f.k?'bg-white shadow text-green-700':'text-gray-500 hover:text-gray-700'}`}>{f.l}</button>
                        ))}
                    </div>
                    {/* Location */}
                    <select value={locationFilter||''} onChange={e => {setLocationFilter(e.target.value?parseInt(e.target.value):null);setPage(1);}}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                        <option value="">📍 All Locations</option>
                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                    </select>
                    {/* Date range */}
                    <div className="flex items-center gap-1.5">
                        <FiCalendar size={13} className="text-gray-400"/>
                        <input type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value);setPage(1);}}
                            className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 focus:outline-none"/>
                        <span className="text-[10px] text-gray-400">to</span>
                        <input type="date" value={dateTo} onChange={e => {setDateTo(e.target.value);setPage(1);}}
                            className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 focus:outline-none"/>
                    </div>
                    <select value={pageSize} onChange={e => {setPageSize(Number(e.target.value));setPage(1);}}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                    <p className="ml-auto text-xs font-bold text-gray-400">{filtered.length} result{filtered.length!==1?'s':''}</p>
                </div>
            </div>

            {/* Ultra DataGrid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">📱 M-Pesa Transaction Records</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">{filtered.length} transactions · Real-time Daraja data</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{fontSize:12}}>
                        <thead>
                            <tr>
                                {[
                                    {label:'#',col:C.date,w:40},
                                    {label:'📅 Date & Time',col:C.date},
                                    {label:'👤 Sender',col:C.sender},
                                    {label:'📞 Phone',col:C.phone},
                                    {label:'💰 Amount',col:C.amount},
                                    {label:'🏷 Trans Code',col:C.code},
                                    {label:'👥 Matched Tenant',col:C.tenant},
                                    {label:'🏠 Room',col:C.room},
                                    {label:'📍 Location',col:C.location},
                                    {label:'✅ Status',col:C.status},
                                ].map((h,i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                        style={{background:h.col.head,color:h.col.text,borderBottom:`2px solid ${h.col.text}30`}}>{h.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr><td colSpan={10} className="text-center py-16 text-gray-400">
                                    <div className="flex flex-col items-center gap-2"><span className="text-5xl">📱</span><p className="text-sm font-medium">No transactions found</p><p className="text-xs">Try adjusting your filters</p></div>
                                </td></tr>
                            ) : paginated.map((txn, idx) => {
                                const name = `${txn.first_name||''} ${txn.last_name||''}`.trim() || '—';
                                const phone = txn.msisdn || '—';
                                const amount = txn.trans_amount || 0;
                                const code = txn.trans_id || '—';
                                const time = txn.created_at ? new Date(txn.created_at).toLocaleString('en-KE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
                                const dateStr = txn.created_at ? new Date(txn.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : '—';
                                const timeStr = txn.created_at ? new Date(txn.created_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '';
                                const tn = tenantByPhone[normPhone(phone)];
                                const initials = name.split(' ').slice(0,2).map(w => w[0]?.toUpperCase()||'').join('') || '?';
                                const GRADS = ['linear-gradient(135deg,#6366f1,#8b5cf6)','linear-gradient(135deg,#0891b2,#06b6d4)','linear-gradient(135deg,#059669,#10b981)','linear-gradient(135deg,#d97706,#f59e0b)','linear-gradient(135deg,#dc2626,#ef4444)','linear-gradient(135deg,#7c3aed,#a855f7)'];
                                const gradIdx = (name||'').charCodeAt(0) % GRADS.length;

                                return (
                                    <tr key={txn.id||idx} className="transition-colors" style={{borderBottom:'1px solid #f1f5f9'}}
                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background='#fafbff'}
                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background=''}>
                                        <td className="px-3 py-3 text-center font-bold text-xs" style={{background:C.date.bg+'60',color:C.date.text}}>
                                            {(page-1)*pageSize+idx+1}
                                        </td>
                                        <td className="px-3 py-3" style={{background:C.date.bg+'60'}}>
                                            <div className="font-semibold text-xs" style={{color:C.date.text}}>{dateStr}</div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1"><FiClock size={9}/> {timeStr}</div>
                                        </td>
                                        <td className="px-3 py-3" style={{background:C.sender.bg+'60'}}>
                                            <div className="flex items-center gap-2">
                                                <div style={{width:30,height:30,borderRadius:'50%',background:GRADS[gradIdx],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:10,flexShrink:0}}>
                                                    {initials}
                                                </div>
                                                <span className="font-semibold text-gray-900 whitespace-nowrap">{name}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap" style={{background:C.phone.bg+'60'}}>
                                            <div className="flex items-center gap-1 font-medium" style={{color:C.phone.text}}>
                                                <FiPhone size={10}/> {phone}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3" style={{background:C.amount.bg+'60'}}>
                                            <span className="text-xs font-extrabold" style={{color:C.amount.text}}>{fmt(amount)}</span>
                                        </td>
                                        <td className="px-3 py-3" style={{background:C.code.bg+'60'}}>
                                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{background:C.code.head,color:C.code.text}}>{code}</span>
                                        </td>
                                        <td className="px-3 py-3" style={{background:C.tenant.bg+'60'}}>
                                            {tn ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:'#dbeafe',color:'#1d4ed8'}}>
                                                    <FiUsers size={9}/> {tn.tenant_name}
                                                </span>
                                            ) : txn.matched ? (
                                                <span className="text-[10px] text-green-600 font-semibold">✅ Matched</span>
                                            ) : (
                                                <span className="text-[10px] text-gray-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap" style={{background:C.room.bg+'60'}}>
                                            {tn?.arms_units?.unit_name ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{color:C.room.text}}>
                                                    <FiHome size={9}/> {tn.arms_units.unit_name}
                                                </span>
                                            ) : <span className="text-[10px] text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-[11px]" style={{background:C.location.bg+'60',color:C.location.text}}>
                                            {tn?.arms_locations?.location_name ? `📍 ${tn.arms_locations.location_name}` : '—'}
                                        </td>
                                        <td className="px-3 py-3" style={{background:C.status.bg+'60'}}>
                                            {txn.matched ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                                                    <FiCheckCircle size={9}/> Matched
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                                    <FiClock size={9}/> Pending
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filtered.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-400">{Math.min((page-1)*pageSize+1,filtered.length)}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</p>
                            <div className="hidden sm:flex gap-4 text-xs font-bold">
                                <span className="text-green-600">Matched: {matchedCount}</span>
                                <span className="text-amber-600">Pending: {unmatchedCount}</span>
                                <span className="text-blue-600">Value: {fmt(totalAmount)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14}/></button>
                            {Array.from({length:totalPages},(_,i) => i+1)
                                .filter(p => p===1||p===totalPages||Math.abs(p-page)<=1)
                                .reduce<(number|'...')[]>((acc,p,i,arr) => {
                                    if (i>0 && (p as number)-(arr[i-1] as number)>1) acc.push('...');
                                    acc.push(p); return acc;
                                }, [])
                                .map((p,i) => p==='...'
                                    ? <span key={`dot-${i}`} className="px-2 text-gray-400 text-xs">…</span>
                                    : <button key={p} onClick={() => setPage(p as number)}
                                        className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page===p?'bg-green-600 text-white shadow-md':'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                )}
                            <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14}/></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
