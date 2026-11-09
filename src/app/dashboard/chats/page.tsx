'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
    FiMessageSquare, FiSearch, FiX, FiPlus, FiRefreshCw, FiSend,
    FiCheck, FiPhone, FiHome, FiMapPin, FiClock, FiCornerDownRight,
    FiUserCheck, FiFilter, FiCheckCircle, FiChevronRight, FiAlertCircle,
    FiRadio, FiUsers, FiZap,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ChatThread {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
    last_message: string;
    last_message_sender: 'tenant' | 'admin';
    last_message_at: string;
    unread_count: number;
}

interface AllTenant {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
}

interface Location {
    location_id: number;
    location_name: string;
}

type FilterTab = 'all' | 'unread' | 'admin';
type BroadcastMode = 'all' | 'location' | 'select';

// ── BROADCAST MODAL ──────────────────────────────────────────────────────────
function BroadcastModal({ onClose, inbox }: { onClose: () => void; inbox: ChatThread[] }) {
    const [mode, setMode] = useState<BroadcastMode>('all');
    const [message, setMessage] = useState('');
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
    const [selectedTenants, setSelectedTenants] = useState<Set<number>>(new Set());
    const [tenantSearch, setTenantSearch] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);

    // All tenants from inbox (every tenant that has ever chatted or exists)
    const allTenants: AllTenant[] = useMemo(() =>
        inbox.map(t => ({
            tenant_id: t.tenant_id,
            tenant_name: t.tenant_name,
            phone: t.phone,
            unit_name: t.unit_name,
            location_name: t.location_name,
        })), [inbox]);

    // Unique locations from inbox
    const locationList = useMemo(() => {
        const seen = new Map<string, Location>();
        inbox.forEach(t => {
            if (t.location_name && !seen.has(t.location_name)) {
                // Use location_name as key — we pass it to filter on server
                seen.set(t.location_name, { location_id: 0, location_name: t.location_name });
            }
        });
        return Array.from(seen.values());
    }, [inbox]);

    const filteredTenants = useMemo(() => {
        const q = tenantSearch.toLowerCase();
        return allTenants.filter(t =>
            !q ||
            t.tenant_name.toLowerCase().includes(q) ||
            t.unit_name.toLowerCase().includes(q) ||
            t.location_name.toLowerCase().includes(q)
        );
    }, [allTenants, tenantSearch]);

    const toggleTenant = (id: number) => {
        setSelectedTenants(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedTenants.size === filteredTenants.length) {
            setSelectedTenants(new Set());
        } else {
            setSelectedTenants(new Set(filteredTenants.map(t => t.tenant_id)));
        }
    };

    const targetCount = useMemo(() => {
        if (mode === 'all') return inbox.length;
        if (mode === 'location') {
            const loc = locationList.find(l => l.location_id === selectedLocation || l.location_name === locationList.find(x => x.location_id === selectedLocation)?.location_name);
            return inbox.filter(t => t.location_name === loc?.location_name).length;
        }
        return selectedTenants.size;
    }, [mode, inbox, locationList, selectedLocation, selectedTenants]);

    const canSend = message.trim().length > 0 && (
        mode === 'all' ||
        (mode === 'location' && selectedLocation !== null) ||
        (mode === 'select' && selectedTenants.size > 0)
    );

    const send = async () => {
        if (!canSend || sending) return;
        setSending(true);
        setResult(null);
        try {
            let body: any = { message: message.trim() };
            if (mode === 'all') {
                body.all = true;
            } else if (mode === 'location') {
                // Pass tenant_ids for the selected location (derived from inbox)
                const locName = locationList.find(l => l.location_id === selectedLocation)?.location_name;
                const ids = inbox.filter(t => t.location_name === locName).map(t => t.tenant_id);
                body.tenant_ids = ids;
            } else {
                body.tenant_ids = Array.from(selectedTenants);
            }

            const res = await fetch('/api/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Broadcast failed');
            setResult(data);
            toast.success(`📣 Sent to ${data.sent} tenant${data.sent !== 1 ? 's' : ''}!`);
        } catch (e: any) {
            toast.error(e.message || 'Broadcast failed');
        } finally {
            setSending(false);
        }
    };

    // Assign numeric IDs to location entries for selection
    const locationsWithId = useMemo(() =>
        locationList.map((l, i) => ({ ...l, location_id: i + 1 })),
        [locationList]
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(12px)', background: 'rgba(15,23,42,0.6)' }}>
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                            <FiRadio className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-extrabold text-lg leading-tight">Broadcast Message</h2>
                            <p className="text-white/70 text-xs font-medium">Send to multiple tenants at once · FCM push included</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition text-lg font-bold">×</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Mode Selector */}
                    <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Send To</p>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { key: 'all', icon: '👥', label: 'All Tenants', sub: `${inbox.length} total` },
                                { key: 'location', icon: '📍', label: 'By Property', sub: `${locationsWithId.length} locations` },
                                { key: 'select', icon: '☑️', label: 'Pick Tenants', sub: 'Choose manually' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => { setMode(opt.key); setSelectedLocation(null); setSelectedTenants(new Set()); }}
                                    className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all text-center ${
                                        mode === opt.key
                                            ? 'border-violet-500 bg-violet-50 shadow-sm shadow-violet-100'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <span className="text-2xl">{opt.icon}</span>
                                    <span className={`text-xs font-extrabold ${mode === opt.key ? 'text-violet-700' : 'text-slate-700'}`}>{opt.label}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">{opt.sub}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Location Picker */}
                    {mode === 'location' && (
                        <div>
                            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">Select Property / Location</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {locationsWithId.map(loc => (
                                    <button
                                        key={loc.location_id}
                                        onClick={() => setSelectedLocation(loc.location_id)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                            selectedLocation === loc.location_id
                                                ? 'border-violet-500 bg-violet-50'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }`}
                                    >
                                        <span className="text-lg">🏢</span>
                                        <div>
                                            <p className={`text-sm font-bold ${selectedLocation === loc.location_id ? 'text-violet-700' : 'text-slate-800'}`}>{loc.location_name}</p>
                                            <p className="text-[11px] text-slate-400">{inbox.filter(t => t.location_name === loc.location_name).length} tenants</p>
                                        </div>
                                        {selectedLocation === loc.location_id && (
                                            <FiCheckCircle className="ml-auto w-4 h-4 text-violet-600 flex-shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tenant Picker */}
                    {mode === 'select' && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Select Tenants</p>
                                <button onClick={toggleAll} className="text-xs font-bold text-violet-600 hover:text-violet-800 transition">
                                    {selectedTenants.size === filteredTenants.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="relative mb-2">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                                <input
                                    type="text"
                                    value={tenantSearch}
                                    onChange={e => setTenantSearch(e.target.value)}
                                    placeholder="Search tenant, room, location..."
                                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 bg-slate-50"
                                />
                            </div>
                            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-52 overflow-y-auto">
                                {filteredTenants.map((t, i) => (
                                    <label
                                        key={t.tenant_id}
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition hover:bg-violet-50 ${i > 0 ? 'border-t border-slate-100' : ''} ${selectedTenants.has(t.tenant_id) ? 'bg-violet-50/60' : 'bg-white'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedTenants.has(t.tenant_id)}
                                            onChange={() => toggleTenant(t.tenant_id)}
                                            className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{t.tenant_name}</p>
                                            <p className="text-[11px] text-slate-400 font-medium">{t.unit_name} · {t.location_name}</p>
                                        </div>
                                        {selectedTenants.has(t.tenant_id) && <FiCheck className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />}
                                    </label>
                                ))}
                                {filteredTenants.length === 0 && (
                                    <div className="py-8 text-center text-sm text-slate-400">No tenants found</div>
                                )}
                            </div>
                            {selectedTenants.size > 0 && (
                                <p className="text-xs text-violet-700 font-bold mt-2 flex items-center gap-1">
                                    <FiCheckCircle className="w-3 h-3" /> {selectedTenants.size} tenant{selectedTenants.size !== 1 ? 's' : ''} selected
                                </p>
                            )}
                        </div>
                    )}

                    {/* Message Box */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Message</p>
                            <span className="text-[11px] text-slate-400">{message.length}/500</span>
                        </div>
                        <textarea
                            ref={textRef}
                            value={message}
                            onChange={e => setMessage(e.target.value.slice(0, 500))}
                            placeholder="Type your broadcast message here... (e.g. Rent reminder, maintenance notice, event announcement)"
                            rows={4}
                            className="w-full p-4 rounded-2xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 transition resize-none bg-slate-50 focus:bg-white"
                        />

                        {/* Quick templates */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                                'Reminder: Rent is due on the 1st of every month.',
                                'Maintenance work scheduled tomorrow 9AM–5PM. Expect brief water disruption.',
                                'Please ensure your room is kept clean. Inspection on Friday.',
                                'WiFi will be down for maintenance tonight 10PM–12AM.',
                            ].map((tpl, i) => (
                                <button
                                    key={i}
                                    onClick={() => setMessage(tpl)}
                                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-600 border border-slate-200 hover:border-violet-300 transition font-medium"
                                >
                                    {tpl.slice(0, 30)}…
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Result */}
                    {result && (
                        <div className={`rounded-2xl p-4 flex items-center gap-3 ${result.failed === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                            <span className="text-2xl">{result.failed === 0 ? '✅' : '⚠️'}</span>
                            <div>
                                <p className={`text-sm font-extrabold ${result.failed === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    Sent to {result.sent} of {result.total} tenants
                                </p>
                                {result.failed > 0 && (
                                    <p className="text-xs text-amber-600">{result.failed} failed (no FCM token or network error)</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 font-medium">
                        {canSend ? (
                            <span className="text-violet-700 font-bold flex items-center gap-1.5">
                                <FiUsers className="w-3.5 h-3.5" />
                                Will send to {targetCount} tenant{targetCount !== 1 ? 's' : ''}
                            </span>
                        ) : (
                            <span className="text-slate-400">Fill in the message {mode !== 'all' ? '& select recipients' : ''}</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition">
                            {result ? 'Close' : 'Cancel'}
                        </button>
                        <button
                            onClick={send}
                            disabled={!canSend || sending}
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold text-white transition-all shadow-md ${
                                canSend && !sending
                                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-violet-500/25 hover:scale-[1.02] active:scale-95'
                                    : 'bg-slate-300 cursor-not-allowed shadow-none'
                            }`}
                        >
                            {sending ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span>Sending...</span>
                                </>
                            ) : (
                                <>
                                    <FiRadio className="w-4 h-4" />
                                    <span>Broadcast Now</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatTime(dt: string) {
    if (!dt) return '';
    try {
        const d = new Date(dt);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHrs < 24 && d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
        }
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    } catch {
        return '';
    }
}

function avatarGradient(name: string) {
    const gradients = [
        'from-indigo-500 via-indigo-600 to-violet-700',
        'from-blue-500 via-indigo-600 to-indigo-700',
        'from-emerald-500 via-teal-600 to-cyan-700',
        'from-amber-500 via-orange-600 to-rose-600',
        'from-purple-500 via-fuchsia-600 to-pink-600',
        'from-cyan-500 via-blue-600 to-indigo-700',
    ];
    const idx = (name || 'T').charCodeAt(0) % gradients.length;
    return gradients[idx];
}

// ── NEW CHAT MODAL (LIGHT SUPER PREMIUM THEME) ───────────────────
function NewChatModal({ onClose, onSelect }: { onClose: () => void; onSelect: (t: AllTenant) => void }) {
    const [q, setQ] = useState('');
    const [all, setAll] = useState<AllTenant[]>([]);
    const [loading, setLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/chats?inbox=1')
            .then(r => r.json())
            .then(d => setAll(d.inbox || []))
            .finally(() => setLoading(false));
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    const results = useMemo(() => {
        if (!q.trim()) return all.slice(0, 50);
        const query = q.toLowerCase().replace(/[\s\-]/g, '');
        return all
            .filter(t => {
                return (
                    (t.tenant_name || '').toLowerCase().includes(q.toLowerCase()) ||
                    (t.phone || '').replace(/[\s\-]/g, '').includes(query) ||
                    (t.unit_name || '').toLowerCase().includes(q.toLowerCase()) ||
                    (t.location_name || '').toLowerCase().includes(q.toLowerCase()) ||
                    String(t.tenant_id).includes(query)
                );
            })
            .slice(0, 60);
    }, [all, q]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 animate-fadeIn"
            style={{
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
            onClick={e => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] animate-scaleUp">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 flex items-center justify-between text-white flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl shadow-inner">
                            ✉️
                        </div>
                        <div>
                            <h2 className="text-white font-extrabold text-base leading-tight">Start New Chat</h2>
                            <p className="text-indigo-200 text-xs mt-0.5">Choose any student tenant to message directly</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition text-lg"
                        title="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex-shrink-0">
                    <div className="relative">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            ref={inputRef}
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search by student name, phone, room or hostel location..."
                            className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition shadow-2xs"
                        />
                        {q && (
                            <button
                                onClick={() => setQ('')}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
                            >
                                <FiX />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-[11px] text-slate-500 font-semibold">
                            {loading ? 'Fetching tenant directory...' : `${results.length} tenants available`}
                        </span>
                        <span className="text-[11px] text-indigo-600 font-bold">Fast Tenant Picker</span>
                    </div>
                </div>

                {/* Directory List */}
                <div className="overflow-y-auto p-3 space-y-1.5 flex-1 divide-y divide-slate-100">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 animate-spin">
                                <FiRefreshCw className="w-5 h-5" />
                            </div>
                            <p className="text-xs text-slate-500 font-semibold">Loading tenant directory...</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
                            <span className="text-4xl">🔍</span>
                            <p className="text-sm font-bold text-slate-700">No matching tenants found</p>
                            <p className="text-xs text-slate-400 max-w-xs">
                                Try searching by room number or partial phone digits.
                            </p>
                        </div>
                    ) : (
                        results.map(t => {
                            const initials = (t.tenant_name || '?')
                                .split(' ')
                                .slice(0, 2)
                                .map((w: string) => w[0])
                                .join('')
                                .toUpperCase();
                            const bg = avatarGradient(t.tenant_name || 'T');

                            return (
                                <button
                                    key={t.tenant_id}
                                    onClick={() => onSelect(t)}
                                    className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-indigo-50/70 border border-transparent hover:border-indigo-100 text-left transition-all group"
                                >
                                    <div
                                        className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${bg} text-white font-extrabold text-sm flex items-center justify-center shadow-xs flex-shrink-0`}
                                    >
                                        {initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                                                {t.tenant_name}
                                            </p>
                                            <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                                Message <FiChevronRight />
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                📱 {t.phone || 'No phone'}
                                            </span>
                                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                🏠 {t.unit_name || 'Room N/A'}
                                            </span>
                                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                📍 {t.location_name || 'Location N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

// ── MAIN CHATS INBOX PAGE (LIGHT SUPER PREMIUM THEME) ────────────
export default function ChatsPage() {
    const [inbox, setInbox] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterTab>('all');
    const [quickReplyTenant, setQuickReplyTenant] = useState<number | null>(null);
    const [quickMsg, setQuickMsg] = useState('');
    const [sendingQuick, setSendingQuick] = useState(false);
    const [showNewChat, setShowNewChat] = useState(false);
    const [showBroadcast, setShowBroadcast] = useState(false);
    const router = useRouter();
    const searchRef = useRef<HTMLInputElement>(null);

    const loadInbox = useCallback(async () => {
        try {
            const res = await fetch('/api/chats?inbox=1');
            const data = await res.json();
            setInbox(data.inbox || []);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInbox();
        const channel = supabase
            .channel('arms_chats_inbox_v4')
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'arms_chats' }, () => {
                loadInbox();
            })
            .subscribe();

        // Auto-refresh every 15s
        const interval = setInterval(loadInbox, 15000);
        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [loadInbox]);

    const filtered = useMemo(() => {
        return inbox.filter(t => {
            const q = search.toLowerCase().replace(/[\s\-]/g, '');
            const matchSearch =
                !search ||
                t.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
                (t.phone || '').replace(/[\s\-]/g, '').includes(q) ||
                t.unit_name.toLowerCase().includes(search.toLowerCase()) ||
                t.location_name.toLowerCase().includes(search.toLowerCase()) ||
                String(t.tenant_id).includes(q);
            if (!matchSearch) return false;
            if (filter === 'unread') return t.unread_count > 0;
            if (filter === 'admin') return t.last_message_sender === 'admin';
            return true;
        });
    }, [inbox, search, filter]);

    const totalUnread = useMemo(() => inbox.reduce((s, t) => s + t.unread_count, 0), [inbox]);
    const unreadCount = useMemo(() => inbox.filter(t => t.unread_count > 0).length, [inbox]);

    const sendQuickReply = async () => {
        if (!quickMsg.trim() || !quickReplyTenant || sendingQuick) return;
        setSendingQuick(true);
        try {
            const res = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: quickReplyTenant, sender: 'admin', message: quickMsg.trim() }),
            });
            if (!res.ok) throw new Error('Send failed');
            setQuickMsg('');
            setQuickReplyTenant(null);
            toast.success('Reply sent & push notification delivered!');
            loadInbox();
        } catch {
            toast.error('Failed to send quick reply.');
        } finally {
            setSendingQuick(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-screen bg-slate-50 font-sans animate-fadeIn">
            {/* Broadcast Modal */}
            {showBroadcast && (
                <BroadcastModal onClose={() => setShowBroadcast(false)} inbox={inbox} />
            )}

            {/* New Chat Modal */}
            {showNewChat && (
                <NewChatModal
                    onClose={() => setShowNewChat(false)}
                    onSelect={t => {
                        setShowNewChat(false);
                        router.push(`/dashboard/chats/${t.tenant_id}`);
                    }}
                />
            )}

            {/* ── HEADER BANNER (LIGHT SUPER PREMIUM THEME) ── */}
            <div className="bg-white border-b border-slate-200/90 shadow-2xs flex-shrink-0 z-10">
                {/* Luminous Top Accent Stripe */}
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div className="px-6 py-5">
                    {/* Top Row: Title & Actions */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center text-2xl shadow-md shadow-indigo-500/20">
                                💬
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                                        Tenant Messages & Direct Chat
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Live Sync
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2">
                                    <span>{inbox.length} tenant conversations</span>
                                    <span className="text-slate-300">•</span>
                                    {totalUnread > 0 ? (
                                        <span className="text-rose-600 font-bold flex items-center gap-1">
                                            <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                                            {totalUnread} unread messages requiring attention
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                            <FiCheck className="w-3.5 h-3.5" /> All caught up
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-2.5">
                            <button
                                onClick={() => setShowBroadcast(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-xs font-extrabold shadow-md shadow-violet-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                <FiRadio className="w-4 h-4" />
                                <span>Broadcast</span>
                            </button>
                            <button
                                onClick={() => setShowNewChat(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-extrabold shadow-md shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                <FiPlus className="w-4 h-4" />
                                <span>New Chat</span>
                            </button>

                            <button
                                onClick={loadInbox}
                                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 flex items-center justify-center transition shadow-2xs"
                                title="Refresh conversations"
                            >
                                <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Search & Filter Row */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                        {/* Search Input */}
                        <div className="md:col-span-8 relative">
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search conversations by student name, phone digits, room # or location..."
                                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition shadow-2xs"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
                                >
                                    <FiX />
                                </button>
                            )}
                        </div>

                        {/* Filter Pills */}
                        <div className="md:col-span-4 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                            {[
                                { key: 'all', label: 'All', count: inbox.length },
                                { key: 'unread', label: 'Unread', count: unreadCount, badgeColor: 'bg-rose-500' },
                                { key: 'admin', label: 'Replied' },
                            ].map(tab => {
                                const isActive = filter === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setFilter(tab.key as FilterTab)}
                                        className={`flex-1 min-w-[70px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                            isActive
                                                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                                                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 border border-slate-200/80'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        {tab.count !== undefined && (
                                            <span
                                                className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                                                    isActive
                                                        ? 'bg-white/20 text-white'
                                                        : tab.badgeColor
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}
                                            >
                                                {tab.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── THREAD LIST (LIGHT SUPER PREMIUM CARDS) ── */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
                <div className="max-w-6xl mx-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-28 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl animate-pulse shadow-sm">
                                💬
                            </div>
                            <p className="text-sm font-semibold text-slate-500">Loading tenant messages...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center max-w-md mx-auto shadow-xs">
                            <span className="text-5xl">
                                {search ? '🔍' : filter === 'unread' ? '🎉' : '💬'}
                            </span>
                            <h2 className="text-base font-extrabold text-slate-800 mt-2">
                                {search
                                    ? 'No conversations found'
                                    : filter === 'unread'
                                    ? 'All messages answered!'
                                    : 'No conversations yet'}
                            </h2>
                            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                                {search
                                    ? `No tenant matched "${search}". Try searching by room number or name.`
                                    : filter === 'unread'
                                    ? 'You have responded to all incoming tenant messages. Great job!'
                                    : 'Tenant messages sent from the mobile app will automatically appear here.'}
                            </p>
                            <button
                                onClick={() => setShowNewChat(true)}
                                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
                            >
                                <FiPlus /> Start New Chat
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {filtered.map(thread => {
                                const initials = (thread.tenant_name || '?')
                                    .split(' ')
                                    .slice(0, 2)
                                    .map(w => w[0])
                                    .join('')
                                    .toUpperCase();
                                const bg = avatarGradient(thread.tenant_name || 'T');
                                const isUnread = thread.unread_count > 0;
                                const isQuickOpen = quickReplyTenant === thread.tenant_id;

                                return (
                                    <div
                                        key={thread.tenant_id}
                                        className={`rounded-2xl transition-all duration-200 border ${
                                            isUnread
                                                ? 'bg-indigo-50/40 border-indigo-200 shadow-sm shadow-indigo-100'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                                        }`}
                                    >
                                        {/* Main Card Content */}
                                        <div className="flex items-center gap-4 p-4">
                                            {/* Avatar with unread indicator */}
                                            <div className="relative flex-shrink-0">
                                                <div
                                                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${bg} text-white font-extrabold text-base flex items-center justify-center shadow-xs ring-2 ring-white`}
                                                >
                                                    {initials}
                                                </div>
                                                {isUnread && (
                                                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 bg-rose-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center px-1 shadow-md shadow-rose-500/30 ring-2 ring-white">
                                                        {thread.unread_count > 99 ? '99+' : thread.unread_count}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Tenant Information & Last Message */}
                                            <div
                                                onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                                                className="flex-1 min-w-0 cursor-pointer"
                                            >
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3
                                                            className={`text-sm font-extrabold truncate ${
                                                                isUnread ? 'text-slate-900' : 'text-slate-800'
                                                            }`}
                                                        >
                                                            {thread.tenant_name}
                                                        </h3>
                                                        {isUnread && (
                                                            <span className="hidden sm:inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                                        )}
                                                    </div>
                                                    <span
                                                        className={`text-[11px] font-semibold flex-shrink-0 ${
                                                            isUnread ? 'text-rose-600' : 'text-slate-400'
                                                        }`}
                                                    >
                                                        {formatTime(thread.last_message_at)}
                                                    </span>
                                                </div>

                                                {/* Meta Pills */}
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                                        📱 {thread.phone || 'No phone'}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                                                        🏠 {thread.unit_name || 'Room N/A'}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                                                        📍 {thread.location_name || 'Location N/A'}
                                                    </span>
                                                </div>

                                                {/* Last Message Preview */}
                                                <p
                                                    className={`text-xs truncate leading-relaxed ${
                                                        isUnread
                                                            ? 'text-slate-900 font-bold'
                                                            : 'text-slate-500 font-normal'
                                                    }`}
                                                >
                                                    {thread.last_message_sender === 'admin' ? (
                                                        <span>
                                                            <span className="text-indigo-600 font-bold">You: </span>
                                                            {thread.last_message}
                                                        </span>
                                                    ) : thread.last_message ? (
                                                        thread.last_message
                                                    ) : (
                                                        <span className="italic text-slate-400">No messages yet</span>
                                                    )}
                                                </p>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {/* Quick Reply Button */}
                                                <button
                                                    onClick={() => {
                                                        setQuickReplyTenant(isQuickOpen ? null : thread.tenant_id);
                                                        setQuickMsg('');
                                                    }}
                                                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all text-xs font-bold ${
                                                        isQuickOpen
                                                            ? 'bg-purple-600 text-white shadow-sm'
                                                            : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                                    }`}
                                                    title="Quick inline reply"
                                                >
                                                    ↩
                                                </button>

                                                {/* Open Thread Full Button */}
                                                <button
                                                    onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                                                    className="w-9 h-9 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-200 hover:border-indigo-600 flex items-center justify-center transition-all text-xs font-bold shadow-2xs group"
                                                    title="Open full conversation"
                                                >
                                                    <FiChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Inline Quick Reply Drawer */}
                                        {isQuickOpen && (
                                            <div className="p-4 pt-1 border-t border-purple-100 bg-purple-50/30 rounded-b-2xl animate-fadeIn">
                                                <div className="bg-white rounded-2xl border border-purple-200 p-3 shadow-sm">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                                                            <span>⚡</span> Quick Reply to {thread.tenant_name}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">
                                                            Enter to send · Shift+Enter new line
                                                        </span>
                                                    </div>

                                                    <div className="flex items-end gap-2">
                                                        <textarea
                                                            value={quickMsg}
                                                            onChange={e => setQuickMsg(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                                    e.preventDefault();
                                                                    sendQuickReply();
                                                                }
                                                            }}
                                                            placeholder={`Type message to ${thread.tenant_name.split(' ')[0]}...`}
                                                            rows={2}
                                                            autoFocus
                                                            className="flex-1 resize-none p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-100 transition"
                                                        />
                                                        <button
                                                            onClick={sendQuickReply}
                                                            disabled={!quickMsg.trim() || sendingQuick}
                                                            className={`h-10 px-4 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 flex-shrink-0 shadow-sm ${
                                                                !quickMsg.trim() || sendingQuick
                                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                                                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/20 active:scale-95'
                                                            }`}
                                                        >
                                                            {sendingQuick ? (
                                                                <span className="inline-block animate-spin">⏳</span>
                                                            ) : (
                                                                <FiSend className="w-3.5 h-3.5" />
                                                            )}
                                                            <span>Send</span>
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
                                                        <button
                                                            onClick={() => setQuickReplyTenant(null)}
                                                            className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                                                        >
                                                            Open full chat history →
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── FOOTER BAR ── */}
            {!loading && inbox.length > 0 && (
                <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between text-xs text-slate-500">
                    <p className="font-medium">
                        Showing <span className="font-bold text-slate-800">{filtered.length}</span> of{' '}
                        <span className="font-bold text-slate-800">{inbox.length}</span> tenant conversations
                        {filter !== 'all' && ` (${filter})`}
                    </p>
                    <div className="flex items-center gap-4">
                        {totalUnread > 0 && (
                            <span className="font-bold text-rose-600 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                                {totalUnread} unread
                            </span>
                        )}
                        <span className="text-slate-400 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Auto-syncing
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
