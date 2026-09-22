'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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

type FilterTab = 'all' | 'unread' | 'admin';

function formatTime(dt: string) {
    if (!dt) return '';
    const d = new Date(dt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24 && d.toDateString() === now.toDateString())
        return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

function avatarColors(name: string) {
    const colors = [
        ['#6366f1','#8b5cf6'], ['#0ea5e9','#6366f1'], ['#10b981','#059669'],
        ['#f59e0b','#ef4444'], ['#8b5cf6','#ec4899'], ['#06b6d4','#0ea5e9'],
        ['#f97316','#ef4444'], ['#14b8a6','#10b981'],
    ];
    const idx = name.charCodeAt(0) % colors.length;
    return colors[idx];
}

export default function ChatsPage() {
    const [inbox, setInbox] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterTab>('all');
    const [quickReplyTenant, setQuickReplyTenant] = useState<number | null>(null);
    const [quickMsg, setQuickMsg] = useState('');
    const [sendingQuick, setSendingQuick] = useState(false);
    const router = useRouter();
    const searchRef = useRef<HTMLInputElement>(null);

    const loadInbox = useCallback(async () => {
        try {
            const res = await fetch('/api/chats?inbox=1');
            const data = await res.json();
            setInbox(data.inbox || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        loadInbox();
        const channel = supabase
            .channel('arms_chats_inbox_v2')
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'arms_chats' }, () => {
                loadInbox();
            })
            .subscribe();
        // Auto-refresh every 15s
        const interval = setInterval(loadInbox, 15000);
        return () => { supabase.removeChannel(channel); clearInterval(interval); };
    }, [loadInbox]);

    const filtered = inbox.filter(t => {
        const matchSearch =
            t.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
            t.phone.includes(search) ||
            t.unit_name.toLowerCase().includes(search.toLowerCase()) ||
            t.location_name.toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;
        if (filter === 'unread') return t.unread_count > 0;
        if (filter === 'admin') return t.last_message_sender === 'admin';
        return true;
    });

    const totalUnread = inbox.reduce((s, t) => s + t.unread_count, 0);
    const unreadCount = inbox.filter(t => t.unread_count > 0).length;

    const sendQuickReply = async () => {
        if (!quickMsg.trim() || !quickReplyTenant || sendingQuick) return;
        setSendingQuick(true);
        try {
            await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: quickReplyTenant, sender: 'admin', message: quickMsg.trim() }),
            });
            setQuickMsg('');
            setQuickReplyTenant(null);
            loadInbox();
        } catch { /* silent */ }
        setSendingQuick(false);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 animate-fadeIn">

            {/* ── Top Header ── */}
            <div style={{ background: 'linear-gradient(135deg,#6366f1 0%,#7c3aed 50%,#a855f7 100%)' }}
                className="px-6 py-5 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">
                            💬
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold text-white tracking-tight">Tenant Messages</h1>
                            <p className="text-indigo-200 text-xs mt-0.5">
                                {totalUnread > 0
                                    ? <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full animate-pulse inline-block" />{totalUnread} unread · {inbox.length} conversations</span>
                                    : `${inbox.length} conversations · All caught up ✓`}
                            </p>
                        </div>
                    </div>
                    <button onClick={loadInbox}
                        className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg transition"
                        title="Refresh">
                        ↺
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-300 text-sm">🔍</span>
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, phone, room, location…"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/15 text-white placeholder-indigo-300 border border-white/20 focus:outline-none focus:bg-white/25 text-sm transition"
                    />
                    {search && (
                        <button onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-white text-lg">
                            ×
                        </button>
                    )}
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 mt-3">
                    {([
                        { key: 'all', label: `All (${inbox.length})` },
                        { key: 'unread', label: `Unread (${unreadCount})` },
                        { key: 'admin', label: 'Replied' },
                    ] as { key: FilterTab; label: string }[]).map(tab => (
                        <button key={tab.key} onClick={() => setFilter(tab.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                filter === tab.key
                                    ? 'bg-white text-indigo-700 shadow'
                                    : 'bg-white/20 text-white hover:bg-white/30'
                            }`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Thread List ── */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-3xl animate-pulse">💬</div>
                        </div>
                        <p className="text-sm text-gray-400 font-semibold">Loading conversations…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <span className="text-6xl">
                            {search ? '🔍' : filter === 'unread' ? '✅' : '💬'}
                        </span>
                        <p className="text-gray-600 font-bold text-base">
                            {search ? 'No matches found' : filter === 'unread' ? 'All messages read!' : 'No messages yet'}
                        </p>
                        <p className="text-gray-400 text-sm text-center max-w-xs">
                            {search ? `No tenant matches "${search}"` : 'Tenant messages from the mobile app will appear here in real-time'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filtered.map(thread => {
                            const initials = thread.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                            const [c1, c2] = avatarColors(thread.tenant_name);
                            const isUnread = thread.unread_count > 0;
                            const isQuickOpen = quickReplyTenant === thread.tenant_id;

                            return (
                                <div key={thread.tenant_id}
                                    className={`transition ${isUnread ? 'bg-indigo-50/60' : 'bg-white hover:bg-gray-50'}`}>

                                    {/* Main row */}
                                    <div className="flex items-start gap-3 px-4 py-3.5">
                                        {/* Avatar */}
                                        <div className="relative flex-shrink-0 mt-0.5">
                                            <div className="w-13 h-13 w-[52px] h-[52px] rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shadow-sm"
                                                style={{ background: `linear-gradient(135deg,${c1},${c2})` }}>
                                                {initials}
                                            </div>
                                            {isUnread && (
                                                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center px-1 shadow">
                                                    {thread.unread_count > 99 ? '99+' : thread.unread_count}
                                                </span>
                                            )}
                                        </div>

                                        {/* Content — clickable to open thread */}
                                        <button
                                            onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                                            className="flex-1 min-w-0 text-left"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm font-extrabold truncate ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                                                    {thread.tenant_name}
                                                </p>
                                                <span className={`text-[11px] flex-shrink-0 mt-0.5 ${isUnread ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                                    {formatTime(thread.last_message_at)}
                                                </span>
                                            </div>

                                            {/* Tenant details row */}
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
                                                    📱 {thread.phone}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold border border-emerald-100">
                                                    🏠 {thread.unit_name}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold border border-amber-100">
                                                    📍 {thread.location_name}
                                                </span>
                                            </div>

                                            {/* Last message */}
                                            <p className={`text-xs mt-1.5 truncate leading-relaxed ${isUnread ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>
                                                {thread.last_message_sender === 'admin'
                                                    ? <span><span className="text-indigo-400 font-bold">You: </span>{thread.last_message}</span>
                                                    : thread.last_message || <span className="italic text-gray-300">No messages yet</span>
                                                }
                                            </p>
                                        </button>

                                        {/* Actions */}
                                        <div className="flex flex-col gap-1.5 flex-shrink-0 mt-0.5">
                                            {/* Open thread */}
                                            <button onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                                                className="w-8 h-8 rounded-xl bg-indigo-100 hover:bg-indigo-600 text-indigo-600 hover:text-white flex items-center justify-center transition text-sm font-bold"
                                                title="Open conversation">
                                                💬
                                            </button>
                                            {/* Quick reply */}
                                            <button
                                                onClick={() => {
                                                    setQuickReplyTenant(isQuickOpen ? null : thread.tenant_id);
                                                    setQuickMsg('');
                                                }}
                                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-sm font-bold ${
                                                    isQuickOpen
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-purple-100 hover:bg-purple-600 text-purple-600 hover:text-white'
                                                }`}
                                                title="Quick reply">
                                                ↩
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Quick Reply Box ── */}
                                    {isQuickOpen && (
                                        <div className="px-4 pb-3 pt-0">
                                            <div className="bg-white rounded-2xl border-2 border-purple-200 p-3 shadow-sm">
                                                <p className="text-[11px] font-extrabold text-purple-600 mb-2 uppercase tracking-wider">
                                                    Quick Reply → {thread.tenant_name}
                                                </p>
                                                <div className="flex items-end gap-2">
                                                    <textarea
                                                        value={quickMsg}
                                                        onChange={e => setQuickMsg(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuickReply(); } }}
                                                        placeholder={`Message to ${thread.tenant_name.split(' ')[0]}… (Enter to send)`}
                                                        rows={2}
                                                        autoFocus
                                                        className="flex-1 resize-none px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-50 transition"
                                                    />
                                                    <button
                                                        onClick={sendQuickReply}
                                                        disabled={!quickMsg.trim() || sendingQuick}
                                                        className="h-9 px-4 rounded-xl text-sm font-bold text-white transition flex-shrink-0 flex items-center gap-1"
                                                        style={{ background: (!quickMsg.trim() || sendingQuick) ? '#e2e8f0' : 'linear-gradient(135deg,#7c3aed,#a855f7)', color: (!quickMsg.trim() || sendingQuick) ? '#94a3b8' : 'white' }}>
                                                        {sendingQuick ? '⏳' : '➤ Send'}
                                                    </button>
                                                </div>
                                                <div className="flex justify-between items-center mt-2">
                                                    <p className="text-[10px] text-gray-400">Shift+Enter for new line · Enter to send</p>
                                                    <button onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                                                        className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold transition">
                                                        Open full chat →
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

            {/* ── Footer Stats ── */}
            {!loading && inbox.length > 0 && (
                <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 py-2.5 flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                        {filtered.length} of {inbox.length} conversations
                        {filter !== 'all' && ` · Filter: ${filter}`}
                    </p>
                    <div className="flex items-center gap-3">
                        {totalUnread > 0 && (
                            <span className="text-xs font-bold text-red-500 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                {totalUnread} unread
                            </span>
                        )}
                        <span className="text-xs text-gray-300">Live · auto-refresh</span>
                    </div>
                </div>
            )}
        </div>
    );
}
