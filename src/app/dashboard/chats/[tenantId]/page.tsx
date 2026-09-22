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
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
    unread_count: number;
    last_message_at: string;
}

const CANNED = [
    'We have received your message and will get back to you shortly.',
    'Our maintenance team will visit within 24 hours.',
    'Please ensure your rent is paid by the 5th of every month.',
    'Thank you for reaching out. We are looking into this.',
    'The issue has been resolved. Please confirm on your end.',
    'Kindly visit the office at your earliest convenience.',
];

function formatMsgTime(dt: string) {
    const d = new Date(dt);
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}
function formatDateGroup(dt: string) {
    const d = new Date(dt);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function sameDay(a: string, b: string) {
    return new Date(a).toDateString() === new Date(b).toDateString();
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
    const [showCanned, setShowCanned] = useState(false);
    const [typingIndicator, setTypingIndicator] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }, []);

    const markRead = useCallback(async () => {
        await fetch(`/api/chats?tenantId=${tenantId}`, { method: 'PATCH' }).catch(() => {});
    }, [tenantId]);

    const loadData = useCallback(async () => {
        try {
            const [threadRes, inboxRes] = await Promise.all([
                fetch(`/api/chats?tenantId=${tenantId}`),
                fetch('/api/chats?inbox=1'),
            ]);
            const threadData = await threadRes.json();
            const inboxData = await inboxRes.json();
            setMessages(threadData.messages || []);
            const t = (inboxData.inbox || []).find((x: any) => x.tenant_id === tenantId);
            if (t) setTenantInfo(t);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [tenantId]);

    useEffect(() => {
        loadData();
        markRead();

        const channel = supabase
            .channel(`chat_thread_premium_${tenantId}`)
            .on('postgres_changes' as any, {
                event: 'INSERT', schema: 'public', table: 'arms_chats',
                filter: `tenant_id=eq.${tenantId}`,
            }, (payload: any) => {
                const newMsg = payload.new as ChatMessage;
                setMessages(prev => {
                    if (prev.find(m => m.chat_id === newMsg.chat_id)) return prev;
                    return [...prev, newMsg];
                });
                if (newMsg.sender === 'tenant') markRead();
                setTimeout(() => scrollToBottom(), 100);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tenantId, loadData, markRead, scrollToBottom]);

    useEffect(() => {
        if (!loading) setTimeout(() => scrollToBottom(false), 50);
    }, [loading, scrollToBottom]);

    const sendReply = async (msg?: string) => {
        const text = (msg || reply).trim();
        if (!text || sending) return;
        setSending(true);
        setShowCanned(false);

        // Optimistic UI
        const optimistic: ChatMessage = {
            chat_id: Date.now(),
            tenant_id: tenantId,
            sender: 'admin',
            message: text,
            is_read: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimistic]);
        setReply('');
        setTimeout(() => scrollToBottom(), 100);

        try {
            const res = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: tenantId, sender: 'admin', message: text }),
            });
            if (!res.ok) throw new Error();
            inputRef.current?.focus();
        } catch {
            setMessages(prev => prev.filter(m => m.chat_id !== optimistic.chat_id));
            setReply(text);
        }
        setSending(false);
    };

    const initials = tenantInfo?.tenant_name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    const totalMsgs = messages.length;
    const tenantMsgs = messages.filter(m => m.sender === 'tenant').length;

    return (
        <div className="flex flex-col h-screen bg-gray-50" style={{ maxHeight: '100vh' }}>

            {/* ── Header ── */}
            <div className="flex-shrink-0 shadow-md z-10"
                style={{ background: 'linear-gradient(135deg,#6366f1 0%,#7c3aed 60%,#a855f7 100%)' }}>

                {/* Top bar */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                    <button onClick={() => router.push('/dashboard/chats')}
                        className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/35 flex items-center justify-center text-white transition text-xl font-bold flex-shrink-0"
                        title="Back to inbox">
                        ←
                    </button>

                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-white/25 flex items-center justify-center text-white font-extrabold text-lg shadow-inner">
                            {initials}
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-extrabold text-base leading-tight truncate">
                            {tenantInfo?.tenant_name || `Tenant #${tenantId}`}
                        </p>
                        <p className="text-indigo-200 text-[11px] mt-0.5">
                            {totalMsgs} messages · {tenantMsgs} from tenant
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a href={`tel:${tenantInfo?.phone}`}
                            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/35 flex items-center justify-center text-white transition text-base"
                            title={`Call ${tenantInfo?.phone}`}>
                            📞
                        </a>
                        <button onClick={loadData}
                            className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/35 flex items-center justify-center text-white transition text-base"
                            title="Refresh">
                            ↺
                        </button>
                    </div>
                </div>

                {/* Tenant detail strip */}
                {tenantInfo && (
                    <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 text-white px-2.5 py-1 rounded-full font-semibold border border-white/20">
                            📱 {tenantInfo.phone}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 text-white px-2.5 py-1 rounded-full font-semibold border border-white/20">
                            🏠 {tenantInfo.unit_name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 text-white px-2.5 py-1 rounded-full font-semibold border border-white/20">
                            📍 {tenantInfo.location_name}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #e0e7ff 1px, transparent 0)', backgroundSize: '24px 24px' }}>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="w-14 h-14 rounded-3xl bg-indigo-100 flex items-center justify-center text-3xl animate-pulse">💬</div>
                        <p className="text-sm text-gray-400 font-semibold">Loading conversation…</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-4xl">💬</div>
                        <p className="text-gray-600 font-bold text-base">No messages yet</p>
                        <p className="text-gray-400 text-sm text-center max-w-xs">
                            When {tenantInfo?.tenant_name?.split(' ')[0] || 'the tenant'} sends a message from the mobile app, it will appear here instantly.
                        </p>
                        <button onClick={() => inputRef.current?.focus()}
                            className="mt-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow"
                            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                            Send First Message
                        </button>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isAdmin = msg.sender === 'admin';
                        const prev = messages[idx - 1];
                        const showDate = !prev || !sameDay(prev.created_at, msg.created_at);
                        const showSender = !prev || prev.sender !== msg.sender || showDate;

                        return (
                            <div key={msg.chat_id}>
                                {/* Date separator */}
                                {showDate && (
                                    <div className="flex items-center gap-3 my-5">
                                        <div className="flex-1 h-px bg-indigo-100" />
                                        <span className="text-[11px] text-indigo-400 font-bold bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                            {formatDateGroup(msg.created_at)}
                                        </span>
                                        <div className="flex-1 h-px bg-indigo-100" />
                                    </div>
                                )}

                                <div className={`flex items-end gap-2 mb-1 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {/* Avatar dot */}
                                    {!isAdmin && showSender && (
                                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 mb-0.5">
                                            {initials}
                                        </div>
                                    )}
                                    {!isAdmin && !showSender && <div className="w-7 flex-shrink-0" />}

                                    {/* Bubble */}
                                    <div className={`group max-w-[72%] ${isAdmin ? 'items-end' : 'items-start'} flex flex-col`}>
                                        {showSender && !isAdmin && (
                                            <p className="text-[10px] font-extrabold text-indigo-500 mb-1 ml-1">
                                                {tenantInfo?.tenant_name?.split(' ')[0] || 'Tenant'}
                                            </p>
                                        )}
                                        <div className={`relative px-4 py-2.5 shadow-sm ${
                                            isAdmin
                                                ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl rounded-br-sm'
                                                : 'bg-white text-gray-800 rounded-2xl rounded-bl-sm border border-gray-100'
                                        }`}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                            <div className={`flex items-center gap-1 mt-1 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                                                <span className={`text-[10px] ${isAdmin ? 'text-indigo-200' : 'text-gray-400'}`}>
                                                    {formatMsgTime(msg.created_at)}
                                                </span>
                                                {isAdmin && (
                                                    <span className="text-[10px] text-indigo-200">
                                                        {msg.is_read ? '✓✓' : '✓'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Admin avatar */}
                                    {isAdmin && showSender && (
                                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 mb-0.5">
                                            A
                                        </div>
                                    )}
                                    {isAdmin && !showSender && <div className="w-7 flex-shrink-0" />}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} className="h-2" />
            </div>

            {/* ── Canned Responses ── */}
            {showCanned && (
                <div className="flex-shrink-0 bg-white border-t border-indigo-100 px-4 py-3 max-h-52 overflow-y-auto">
                    <p className="text-[11px] font-extrabold text-indigo-500 uppercase tracking-wider mb-2">Quick Responses</p>
                    <div className="grid grid-cols-1 gap-1.5">
                        {CANNED.map((c, i) => (
                            <button key={i} onClick={() => { setReply(c); setShowCanned(false); inputRef.current?.focus(); }}
                                className="text-left text-xs text-gray-600 px-3 py-2 rounded-xl bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-100 hover:border-indigo-200 transition font-medium">
                                {c}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Reply Box ── */}
            <div className="flex-shrink-0 bg-white border-t border-gray-100 px-3 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                {/* Canned + typing indicator row */}
                <div className="flex items-center justify-between mb-2 px-1">
                    <button onClick={() => setShowCanned(v => !v)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${showCanned ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'}`}>
                        ⚡ Quick Replies
                    </button>
                    <span className="text-[10px] text-gray-300">Enter to send · Shift+Enter new line</span>
                </div>

                <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                        <textarea
                            ref={inputRef}
                            value={reply}
                            onChange={e => setReply(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                            rows={1}
                            placeholder={`Reply to ${tenantInfo?.tenant_name?.split(' ')[0] || 'tenant'}…`}
                            className="w-full resize-none px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition"
                            style={{ minHeight: 46, maxHeight: 140 }}
                            onInput={e => {
                                const el = e.currentTarget;
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 140) + 'px';
                            }}
                        />
                        {reply.length > 0 && (
                            <button onClick={() => setReply('')}
                                className="absolute right-3 top-3 text-gray-300 hover:text-gray-500 text-lg transition">
                                ×
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => sendReply()}
                        disabled={!reply.trim() || sending}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 shadow"
                        style={{
                            background: (!reply.trim() || sending)
                                ? '#e2e8f0'
                                : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                        }}
                        title="Send message">
                        {sending ? (
                            <svg className="w-4 h-4 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
