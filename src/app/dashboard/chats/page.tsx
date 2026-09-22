'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ChatThread {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
    last_message: string;
    last_message_sender: string;
    last_message_at: string;
    unread_count: number;
}

function formatTime(dt: string) {
    const d = new Date(dt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

export default function ChatsPage() {
    const [inbox, setInbox] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const router = useRouter();

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
        // Real-time: any new chat → reload inbox
        const channel = supabase
            .channel('arms_chats_inbox')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'arms_chats' }, () => {
                loadInbox();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [loadInbox]);

    const filtered = inbox.filter(t =>
        t.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
        t.phone.includes(search) ||
        t.unit_name.toLowerCase().includes(search.toLowerCase())
    );

    const totalUnread = inbox.reduce((s, t) => s + t.unread_count, 0);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">💬</div>
                    <div>
                        <h1 className="text-xl font-extrabold text-white">Tenant Messages</h1>
                        <p className="text-indigo-200 text-sm">
                            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? 's' : ''}` : 'All caught up ✓'}
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search tenant, phone, room…"
                        className="w-full px-4 py-2.5 rounded-xl bg-white/10 text-white placeholder-indigo-200 border border-white/20 focus:outline-none focus:bg-white/20 text-sm"
                    />
                </div>
            </div>

            {/* Chat List */}
            <div className="divide-y divide-gray-100">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading messages…</div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <span className="text-5xl">💬</span>
                        <p className="text-gray-500 font-semibold">No messages yet</p>
                        <p className="text-gray-400 text-sm">Tenant messages will appear here</p>
                    </div>
                ) : (
                    filtered.map(thread => (
                        <button
                            key={thread.tenant_id}
                            onClick={() => router.push(`/dashboard/chats/${thread.tenant_id}`)}
                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-indigo-50 transition text-left"
                        >
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-extrabold text-lg">
                                    {thread.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                                </div>
                                {thread.unread_count > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                        {thread.unread_count > 9 ? '9+' : thread.unread_count}
                                    </span>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <p className={`text-sm font-bold truncate ${thread.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
                                        {thread.tenant_name}
                                    </p>
                                    <span className="text-[11px] text-gray-400 ml-2 flex-shrink-0">
                                        {formatTime(thread.last_message_at)}
                                    </span>
                                </div>
                                <p className="text-[11px] text-indigo-500 font-semibold mt-0.5">
                                    📱 {thread.phone} &nbsp;·&nbsp; 🏠 {thread.unit_name} &nbsp;·&nbsp; 📍 {thread.location_name}
                                </p>
                                <p className={`text-xs mt-1 truncate ${thread.unread_count > 0 ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>
                                    {thread.last_message_sender === 'admin' ? '✦ You: ' : ''}{thread.last_message}
                                </p>
                            </div>

                            {/* Unread dot */}
                            {thread.unread_count > 0 && (
                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0" />
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
