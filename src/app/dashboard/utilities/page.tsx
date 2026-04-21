'use client';
import { useState, useEffect } from 'react';
import { getUtilityTypes, getMeterReadings, addMeterReading, getLatestReading, getUtilityBills, generateUtilityBills, getUtilityRates, getUnits, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiDroplet, FiZap, FiPlus, FiRefreshCw, FiChevronDown } from 'react-icons/fi';

export default function UtilitiesPage() {
    const [tab, setTab] = useState<'readings' | 'bills' | 'rates'>('readings');
    const [utilityTypes, setUtilityTypes] = useState<any[]>([]);
    const [readings, setReadings] = useState<any[]>([]);
    const [bills, setBills] = useState<any[]>([]);
    const [rates, setRates] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    // Add reading form
    const [showAddReading, setShowAddReading] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState('');
    const [selectedUtility, setSelectedUtility] = useState('');
    const [prevReading, setPrevReading] = useState(0);
    const [currentReadingVal, setCurrentReadingVal] = useState('');
    const [readingDate, setReadingDate] = useState(new Date().toISOString().split('T')[0]);

    // Generate bills form
    const [showGenBills, setShowGenBills] = useState(false);
    const [genBillMonth, setGenBillMonth] = useState(new Date().toISOString().slice(0, 7));
    const [genBillUtility, setGenBillUtility] = useState('');

    const fmt = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(n || 0);

    useEffect(() => {
        const handler = (e: any) => setGlobalLocationId(e.detail);
        const saved = localStorage.getItem('arms_location');
        if (saved) setGlobalLocationId(parseInt(saved));
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [types, readingData, billData, rateData, unitData, tenantData] = await Promise.all([
                getUtilityTypes(),
                getMeterReadings(globalLocationId ? { locationId: globalLocationId } : undefined),
                getUtilityBills(globalLocationId ? { locationId: globalLocationId } : undefined),
                getUtilityRates(globalLocationId || undefined),
                getUnits(globalLocationId || undefined),
                getTenants(globalLocationId || undefined),
            ]);
            setUtilityTypes(types);
            setReadings(readingData);
            setBills(billData);
            setRates(rateData);
            setUnits(unitData);
            setTenants(tenantData.filter((t: any) => t.status === 'Active'));
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleAddReading = async () => {
        if (!selectedUnit || !selectedUtility || !currentReadingVal) return toast.error('Fill all fields');
        const unitId = parseInt(selectedUnit);
        const utilityTypeId = parseInt(selectedUtility);
        const cur = parseFloat(currentReadingVal);
        try {
            const latest = await getLatestReading(unitId, utilityTypeId);
            setPrevReading(latest);
            if (cur < latest) return toast.error(`Current reading (${cur}) must be >= previous (${latest})`);
            const unit = units.find((u: any) => u.unit_id === unitId);
            await addMeterReading({
                unit_id: unitId,
                utility_type_id: utilityTypeId,
                location_id: unit?.location_id || globalLocationId || undefined,
                previous_reading: latest,
                current_reading: cur,
                reading_date: readingDate,
                read_by: 'Admin',
            });
            toast.success('Reading recorded');
            setShowAddReading(false); setCurrentReadingVal(''); setSelectedUnit(''); setSelectedUtility('');
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleGenerateBills = async () => {
        if (!genBillMonth || !genBillUtility) return toast.error('Select month and utility type');
        try {
            const result = await generateUtilityBills(genBillMonth, parseInt(genBillUtility), globalLocationId || undefined);
            toast.success(`Generated ${result.generated} utility bills`);
            setShowGenBills(false);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleUnitSelect = async (unitId: string, utilityTypeId: string) => {
        if (unitId && utilityTypeId) {
            const latest = await getLatestReading(parseInt(unitId), parseInt(utilityTypeId));
            setPrevReading(latest);
        }
    };

    const tabs = [
        { key: 'readings', label: 'Meter Readings', icon: FiDroplet },
        { key: 'bills', label: 'Utility Bills', icon: FiZap },
        { key: 'rates', label: 'Rates Config', icon: FiRefreshCw },
    ] as const;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>💧 Water & Utility Billing</h1>
                    <p className="text-sm text-gray-500 mt-1">Meter readings • Per-unit billing • Prepaid tracking</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowGenBills(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition">
                        <FiZap size={14} /> Generate Bills
                    </button>
                    <button onClick={() => setShowAddReading(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition">
                        <FiPlus size={14} /> Add Reading
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 shadow-sm">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <t.icon size={14} /> {t.label}
                    </button>
                ))}
            </div>

            {/* Meter Readings Tab */}
            {tab === 'readings' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Unit</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Utility</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Previous</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Current</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Consumption</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {readings.map(r => (
                                    <tr key={r.reading_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 text-gray-600">{r.reading_date}</td>
                                        <td className="px-4 py-3 font-semibold text-gray-700">{r.arms_units?.unit_name}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600">{r.arms_utility_types?.utility_name}</span></td>
                                        <td className="px-4 py-3 text-right text-gray-600">{r.previous_reading}</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">{r.current_reading}</td>
                                        <td className="px-4 py-3 text-right font-bold text-indigo-600">{r.consumption} {r.arms_utility_types?.unit_of_measure}</td>
                                        <td className="px-4 py-3"><span className="text-xs text-gray-500">{r.reading_type}</span></td>
                                    </tr>
                                ))}
                                {readings.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No meter readings yet. Add your first reading above.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Utility Bills Tab */}
            {tab === 'bills' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Month</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tenant</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Unit</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Utility</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Consumption</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Rate</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Total</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Balance</th>
                                    <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bills.map(b => (
                                    <tr key={b.utility_bill_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 text-gray-600">{b.billing_month}</td>
                                        <td className="px-4 py-3 font-semibold text-gray-700">{b.arms_tenants?.tenant_name}</td>
                                        <td className="px-4 py-3 text-gray-600">{b.arms_units?.unit_name}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600">{b.arms_utility_types?.utility_name}</span></td>
                                        <td className="px-4 py-3 text-right">{b.consumption} {b.arms_utility_types?.unit_of_measure}</td>
                                        <td className="px-4 py-3 text-right">{fmt(b.rate_per_unit)}/{b.arms_utility_types?.unit_of_measure}</td>
                                        <td className="px-4 py-3 text-right font-bold">{fmt(b.total_amount)}</td>
                                        <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(b.balance)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${b.status === 'Paid' ? 'bg-green-50 text-green-600' : b.status === 'Partial' ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                                                {b.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {bills.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No utility bills yet. Generate bills from meter readings.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Rates Tab */}
            {tab === 'rates' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Utility</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Location</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Rate/Unit (KES)</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Fixed Charge</th>
                                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Min Charge</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Effective</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rates.map(r => (
                                    <tr key={r.rate_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 font-semibold text-gray-700">{r.arms_utility_types?.utility_name} ({r.arms_utility_types?.unit_of_measure})</td>
                                        <td className="px-4 py-3 text-gray-600">{r.arms_locations?.location_name || 'All Locations'}</td>
                                        <td className="px-4 py-3 text-right font-bold">{fmt(r.rate_per_unit)}</td>
                                        <td className="px-4 py-3 text-right">{fmt(r.fixed_charge)}</td>
                                        <td className="px-4 py-3 text-right">{fmt(r.minimum_charge)}</td>
                                        <td className="px-4 py-3 text-gray-600">{r.effective_date}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Add Reading Modal */}
            {showAddReading && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAddReading(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">📝 Record Meter Reading</h3>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Unit</label>
                            <select value={selectedUnit} onChange={e => { setSelectedUnit(e.target.value); handleUnitSelect(e.target.value, selectedUtility); }}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                <option value="">Select unit</option>
                                {units.map((u: any) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name} - {u.arms_locations?.location_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Utility Type</label>
                            <select value={selectedUtility} onChange={e => { setSelectedUtility(e.target.value); handleUnitSelect(selectedUnit, e.target.value); }}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                <option value="">Select utility</option>
                                {utilityTypes.map((t: any) => <option key={t.utility_type_id} value={t.utility_type_id}>{t.utility_name} ({t.unit_of_measure})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Previous Reading</label>
                            <input value={prevReading} readOnly className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Current Reading</label>
                            <input type="number" value={currentReadingVal} onChange={e => setCurrentReadingVal(e.target.value)}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Enter current reading" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Reading Date</label>
                            <input type="date" value={readingDate} onChange={e => setReadingDate(e.target.value)}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleAddReading} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Save Reading</button>
                            <button onClick={() => setShowAddReading(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Bills Modal */}
            {showGenBills && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowGenBills(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">⚡ Generate Utility Bills</h3>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Billing Month</label>
                            <input type="month" value={genBillMonth} onChange={e => setGenBillMonth(e.target.value)}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Utility Type</label>
                            <select value={genBillUtility} onChange={e => setGenBillUtility(e.target.value)}
                                className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                <option value="">Select utility</option>
                                {utilityTypes.map((t: any) => <option key={t.utility_type_id} value={t.utility_type_id}>{t.utility_name}</option>)}
                            </select>
                        </div>
                        <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-100">
                            <p className="text-xs text-yellow-700">💡 Bills are generated for all occupied units with meter readings. Existing bills are skipped.</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleGenerateBills} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm">Generate</button>
                            <button onClick={() => setShowGenBills(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
