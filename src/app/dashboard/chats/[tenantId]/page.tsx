'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ChatMessage {
    chat_id: number;
    tenant_id: number;
    sender: 'tenant' | 'admin';
    message: string;
    is_read: boolean;
    created_at: string;
}

interface TenantInfo {
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
}

function formatTime(dt: string) {
    const d = new Date(dt);
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) + ' ' +
        d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatThreadPage() {
    const params = useParams();
    const router = useRouter();
    const tenantId = parseInt(params.tenantId as string);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadMessages = useCallback(async () => {
        try {
            // Load tenant info
            const tRes = await fetch(`/api/chats?tenantId=${tenantId}`);
            const tData = await tRes.json();
            setMessages(tData.messages || []);

            // Also load tenant info from tenants endpoint
            const inboxRes = await fetch('/api/chats?inbox=1');
            const inboxData = await inboxRes.json();
            const t = (inboxData.inbox || []).find((x: any) => x.tenant_id === tenantId);
            if (t) setTenantInfo(t);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [tenantId]);

    const markRead = useCallback(async () => {
        await fetch(`/api/chats?tenantId=${tenantId}`, { method: 'PATCH' });
    }, [tenantId]);

    useEffect(() => {
        loadMessages();
        markRead();

        // Real-time subscription
        const channel = supabase
            .channel(`chat_thread_${tenantId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'arms_chats',
                filter: `tenant_id=eq.${tenantId}`,
            }, (payload) => {
                setMessages(prev => [...prev, payload.new as ChatMessage]);
                // Mark read if it's from tenant
                if ((payload.new as ChatMessage).sender === 'tenant') markRead();
                setTimeout(scrollToBottom, 100);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tenantId, loadMessages, markRead]);

    useEffect(() => {
        if (!loading) setTimeout(scrollToBottom, 100);
    }, [loading]);

    const sendReply = async () => {
        if (!reply.trim() || sending) return;
        setSending(true);
        try {
            await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: tenantId, sender: 'admin', message: reply.trim() }),
            });
            setReply('');
            inputRef.current?.focus();
        } catch { /* silent */ }
        setSending(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/dashboard/chats')}
                        className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition">
                        ←
                    </button>
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white font-extrabold text-lg flex-shrink-0">
                        {tenantInfo?.tenant_name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-extrabold text-sm truncate">{tenantInfo?.tenant_name || `Tenant #${tenantId}`}</p>
                        <p className="text-indigo-200 text-[11px]">
                            📱 {tenantInfo?.phone || '—'} &nbsp;·&nbsp; 🏠 {tenantInfo?.unit_name || '—'} &nbsp;·&nbsp; 📍 {tenantInfo?.location_name || '—'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                        <span className="text-4xl">💬</span>
                        <p className="text-sm">No messages yet. Wait for tenant to message.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isAdmin = msg.sender === 'admin';
                        return (
                            <div key={msg.chat_id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                                    isAdmin
                                        ? 'bg-indigo-600 text-white rounded-br-sm'
                                        : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
                                }`}>
                                    {!isAdmin && (
                                        <p className="text-[10px] font-bold text-indigo-500 mb-1">
                                            {tenantInfo?.tenant_name?.split(' ')[0] || 'Tenant'}
                                        </p>
                                    )}
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                    <p className={`text-[10px] mt-1 ${isAdmin ? 'text-indigo-200' : 'text-gray-400'} text-right`}>
                                        {formatTime(msg.created_at)}
                                        {isAdmin && <span className="ml-1">✓</span>}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Reply Box */}
            <div className="flex-shrink-0 bg-white border-t border-gray-100 px-4 py-3 flex items-end gap-3">
                <textarea
                    ref={inputRef}
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="Type a reply… (Enter to send)"
                    className="flex-1 resize-none px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition max-h-32"
                    style={{ minHeight: 44 }}
                    onInput={e => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                    }}
                />
                <button
                    onClick={sendReply}
                    disabled={!reply.trim() || sending}
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-all flex-shrink-0"
                    style={{
                        background: (!reply.trim() || sending) ? '#e2e8f0' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                        color: (!reply.trim() || sending) ? '#94a3b8' : 'white',
                    }}
                    title="Send (Enter)"
                >
                    {sending ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}
