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
    return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
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

// Double blue tick component for web
function Ticks({ isRead }: { isRead: boolean }) {
    return (
        <span className="inline-flex items-center ml-1" style={{ fontSize: 11, letterSpacing: -3, lineHeight: 1 }}>
            <span style={{ color: isRead ? '#60a5fa' : 'rgba(255,255,255,0.5)', fontWeight: 700 }}>✓</span>
            <span style={{ color: isRead ? '#60a5fa' : 'rgba(255,255,255,0.5)', fontWeight: 700 }}>✓</span>
        </span>
    );
}

export default function ChatThreadPage() {
    const params = useParams();
    const router = useRouter();
    const tenantId = parseInt(params.tenantId as string);

    const [messages, setMessages]     = useState<ChatMessage[]>([]);
    const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
    const [reply, setReply]           = useState('');
    const [sending, setSending]       = useState(false);
    const [loading, setLoading]       = useState(true);
    const [showCanned, setShowCanned] = useState(false);
    // Blur notification overlay — fires when a NEW tenant message arrives while thread is open
    const [newMsgAlert, setNewMsgAlert] = useState<ChatMessage | null>(null);
    const bottomRef  = useRef<HTMLDivElement>(null);
    const inputRef   = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }, []);

    const markRead = useCallback(async () => {
        await fetch(`/api/chats?tenantId=${tenantId}`, { method: 'PATCH' }).catch(() => {});
    }, [tenantId]);

    const loadData = useCallback(async () => {
        try {
            const res = await fetch(`/api/chats?tenantId=${tenantId}`);
            const data = await res.json();
            setMessages(data.messages || []);
            if (data.tenant) setTenantInfo(data.tenant);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [tenantId]);

    useEffect(() => {
        loadData();
        markRead();

        const channel = supabase
            .channel(`chat_thread_v3_${tenantId}`)
            .on('postgres_changes' as any, {
                event: 'INSERT', schema: 'public', table: 'arms_chats',
                filter: `tenant_id=eq.${tenantId}`,
            }, (payload: any) => {
                const newMsg = payload.new as ChatMessage;
                setMessages(prev => {
                    if (prev.find(m => m.chat_id === newMsg.chat_id)) return prev;
                    return [...prev, newMsg];
                });
                // Show blur overlay for NEW tenant messages
                if (newMsg.sender === 'tenant') {
                    setNewMsgAlert(newMsg);
                    // Auto-dismiss after 8s if admin doesn't click
                    setTimeout(() => setNewMsgAlert(null), 8000);
                } else {
                    markRead();
                }
                setTimeout(() => scrollToBottom(), 120);
            })
            // Also track READ updates from tenant side
            .on('postgres_changes' as any, {
                event: 'UPDATE', schema: 'public', table: 'arms_chats',
                filter: `tenant_id=eq.${tenantId}`,
            }, (payload: any) => {
                const updated = payload.new as ChatMessage;
                setMessages(prev => prev.map(m => m.chat_id === updated.chat_id ? updated : m));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tenantId, loadData, markRead, scrollToBottom]);

    useEffect(() => {
        if (!loading) setTimeout(() => scrollToBottom(false), 60);
    }, [loading, scrollToBottom]);

    const sendReply = async (msg?: string) => {
        const text = (msg || reply).trim();
        if (!text || sending) return;
        setSending(true);
        setShowCanned(false);

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
        setTimeout(() => scrollToBottom(), 80);

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

    const dismissAlert = () => {
        setNewMsgAlert(null);
        markRead();
        scrollToBottom();
        inputRef.current?.focus();
    };

    const initials = tenantInfo?.tenant_name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

    return (
        <div className="flex flex-col h-screen relative" style={{ maxHeight: '100vh', background: '#0f0a2e' }}>

            {/* ── BLUR NOTIFICATION OVERLAY ── fires on new tenant message ── */}
            {newMsgAlert && (
                <div className="absolute inset-0 z-50 flex items-center justify-center"
                    style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(15,10,46,0.75)' }}>
                    <div className="mx-4 rounded-3xl overflow-hidden shadow-2xl max-w-sm w-full"
                        style={{ border: '1.5px solid rgba(167,139,250,0.4)', background: 'linear-gradient(135deg,#1e1b4b,#2d1b69)' }}>
                        {/* Header */}
                        <div className="px-5 py-4 flex items-center gap-3"
                            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg flex-shrink-0"
                                style={{ background: 'rgba(255,255,255,0.2)' }}>
                                {initials}
                            </div>
                            <div>
                                <p className="text-white font-extrabold text-sm">{tenantInfo?.tenant_name || 'Tenant'}</p>
                                <p className="text-indigo-200 text-xs">{tenantInfo?.unit_name} · {tenantInfo?.location_name}</p>
                            </div>
                            <span className="ml-auto flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                                <span className="text-xs text-green-300 font-bold">New Message</span>
                            </span>
                        </div>
                        {/* Message */}
                        <div className="px-5 py-5">
                            <p className="text-xs font-extrabold text-indigo-300 uppercase tracking-widest mb-3">📨 Just received</p>
                            <div className="rounded-2xl px-4 py-3 mb-4"
                                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}>
                                <p className="text-white text-sm leading-relaxed">
                                    {newMsgAlert.message}
                                </p>
                                <p className="text-indigo-300 text-xs mt-2 text-right">{formatMsgTime(newMsgAlert.created_at)}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={dismissAlert}
                                    className="flex-1 py-3 rounded-2xl text-sm font-extrabold text-white transition"
                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                    💬 Reply Now
                                </button>
                                <button onClick={() => setNewMsgAlert(null)}
                                    className="px-4 py-3 rounded-2xl text-sm font-bold transition"
                                    style={{ background: 'rgba(99,102,241,0.25)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }}>
                                    Later
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="flex-shrink-0 shadow-xl z-10"
                style={{ background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 60%,#a855f7 100%)' }}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                    <button onClick={() => router.push('/dashboard/chats')}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xl font-bold transition flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.2)' }}>
                        ←
                    </button>
                    <div className="relative flex-shrink-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg"
                            style={{ background: 'rgba(255,255,255,0.25)' }}>
                            {initials}
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-extrabold text-base leading-tight truncate">
                            {tenantInfo?.tenant_name || `Tenant #${tenantId}`}
                        </p>
                        <p className="text-indigo-200 text-xs mt-0.5">
                            {messages.length} messages · {messages.filter(m => m.sender === 'tenant').length} from tenant
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a href={`tel:${tenantInfo?.phone}`}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition"
                            style={{ background: 'rgba(255,255,255,0.2)' }} title="Call tenant">
                            📞
                        </a>
                        <button onClick={loadData}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition"
                            style={{ background: 'rgba(255,255,255,0.2)' }} title="Refresh">
                            ↺
                        </button>
                    </div>
                </div>
                {tenantInfo && (
                    <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                        {[
                            { icon: '📱', label: tenantInfo.phone },
                            { icon: '🏠', label: tenantInfo.unit_name },
                            { icon: '📍', label: tenantInfo.location_name },
                        ].map(chip => (
                            <span key={chip.label} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold"
                                style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                {chip.icon} {chip.label}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Messages area with deep purple wallpaper ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 relative"
                style={{
                    background: 'linear-gradient(160deg, #0f0a2e 0%, #1a0f4e 25%, #16123a 50%, #1e1556 75%, #0f0a2e 100%)',
                }}>
                {/* Decorative wallpaper pattern */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                    {/* Glowing circles */}
                    {[
                        { top: '5%',  left: '8%',  size: 120, opacity: 0.06 },
                        { top: '22%', right: '5%', size: 80,  opacity: 0.05 },
                        { top: '42%', left: '3%',  size: 60,  opacity: 0.07 },
                        { top: '60%', right: '8%', size: 140, opacity: 0.04 },
                        { top: '78%', left: '12%', size: 90,  opacity: 0.06 },
                    ].map((c, i) => (
                        <div key={i} className="absolute rounded-full"
                            style={{
                                top: c.top, left: (c as any).left, right: (c as any).right,
                                width: c.size, height: c.size,
                                border: `1.5px solid rgba(167,139,250,${c.opacity * 4})`,
                                background: `rgba(99,102,241,${c.opacity})`,
                            }} />
                    ))}
                    {/* Dot grid */}
                    <div className="absolute inset-0" style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(167,139,250,0.15) 1px, transparent 0)',
                        backgroundSize: '28px 28px',
                    }} />
                </div>

                {/* Messages */}
                <div className="relative z-10">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-14 h-14 rounded-3xl flex items-center justify-center text-3xl animate-pulse"
                                style={{ background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(167,139,250,0.4)' }}>
                                💬
                            </div>
                            <p className="text-sm font-semibold" style={{ color: '#a5b4fc' }}>Loading conversation…</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
                                style={{ background: 'rgba(99,102,241,0.3)', border: '1.5px solid rgba(167,139,250,0.4)' }}>
                                💬
                            </div>
                            <p className="font-extrabold text-base" style={{ color: '#e2e8f0' }}>No messages yet</p>
                            <p className="text-sm text-center max-w-xs" style={{ color: '#94a3b8' }}>
                                Send the first message to {tenantInfo?.tenant_name?.split(' ')[0] || 'the tenant'}
                            </p>
                            <button onClick={() => inputRef.current?.focus()}
                                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-extrabold text-white shadow-lg"
                                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                Start Conversation ↓
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
                                    {showDate && (
                                        <div className="flex items-center gap-3 my-5">
                                            <div className="flex-1 h-px" style={{ background: 'rgba(167,139,250,0.2)' }} />
                                            <span className="text-xs font-bold px-3 py-1 rounded-full"
                                                style={{
                                                    color: '#c4b5fd',
                                                    background: 'rgba(99,102,241,0.35)',
                                                    border: '1px solid rgba(167,139,250,0.3)',
                                                }}>
                                                {formatDateGroup(msg.created_at)}
                                            </span>
                                            <div className="flex-1 h-px" style={{ background: 'rgba(167,139,250,0.2)' }} />
                                        </div>
                                    )}

                                    <div className={`flex items-end gap-2 mb-1 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {/* Avatar */}
                                        {!isAdmin && showSender && (
                                            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 mb-0.5"
                                                style={{ background: 'rgba(99,102,241,0.6)', border: '1px solid rgba(167,139,250,0.4)' }}>
                                                {initials}
                                            </div>
                                        )}
                                        {!isAdmin && !showSender && <div className="w-7 flex-shrink-0" />}

                                        {/* Bubble */}
                                        <div className={`group max-w-[72%] flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                                            {showSender && !isAdmin && (
                                                <p className="text-xs font-extrabold mb-1 ml-1" style={{ color: '#a5b4fc' }}>
                                                    {tenantInfo?.tenant_name?.split(' ')[0] || 'Tenant'}
                                                </p>
                                            )}
                                            <div className={`relative px-4 py-2.5 shadow-lg ${
                                                isAdmin
                                                    ? 'rounded-2xl rounded-br-sm text-white'
                                                    : 'rounded-2xl rounded-bl-sm'
                                            }`}
                                                style={isAdmin ? {
                                                    background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                                                    boxShadow: '0 4px 16px rgba(99,102,241,0.45)',
                                                } : {
                                                    background: 'rgba(30,27,75,0.9)',
                                                    border: '1px solid rgba(167,139,250,0.25)',
                                                    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                                                }}>
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap"
                                                    style={{ color: isAdmin ? '#fff' : '#e2e8f0' }}>
                                                    {msg.message}
                                                </p>
                                                <div className={`flex items-center gap-1 mt-1.5 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                                                    <span className="text-xs" style={{ color: isAdmin ? 'rgba(255,255,255,0.55)' : 'rgba(167,139,250,0.6)' }}>
                                                        {formatMsgTime(msg.created_at)}
                                                    </span>
                                                    {/* Double blue ticks for admin messages */}
                                                    {isAdmin && <Ticks isRead={msg.is_read} />}
                                                </div>
                                            </div>
                                        </div>

                                        {isAdmin && showSender && (
                                            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 mb-0.5"
                                                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
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
            </div>

            {/* ── Canned responses ── */}
            {showCanned && (
                <div className="flex-shrink-0 border-t px-4 py-3 max-h-52 overflow-y-auto"
                    style={{ background: 'rgba(15,10,46,0.98)', borderColor: 'rgba(99,102,241,0.35)' }}>
                    <p className="text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: '#a5b4fc' }}>⚡ Quick Responses</p>
                    <div className="grid grid-cols-1 gap-1.5">
                        {CANNED.map((c, i) => (
                            <button key={i} onClick={() => { setReply(c); setShowCanned(false); inputRef.current?.focus(); }}
                                className="text-left text-xs px-3 py-2 rounded-xl transition font-medium"
                                style={{
                                    color: '#c4b5fd',
                                    background: 'rgba(99,102,241,0.2)',
                                    border: '1px solid rgba(167,139,250,0.25)',
                                }}>
                                {c}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Reply Box ── */}
            <div className="flex-shrink-0 px-3 py-3"
                style={{
                    background: 'rgba(15,10,46,0.97)',
                    borderTop: '1px solid rgba(99,102,241,0.35)',
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
                }}>
                <div className="flex items-center justify-between mb-2 px-1">
                    <button onClick={() => setShowCanned(v => !v)}
                        className="text-xs font-bold px-2.5 py-1 rounded-lg transition"
                        style={{
                            background: showCanned ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.15)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(167,139,250,0.3)',
                        }}>
                        ⚡ Quick Replies
                    </button>
                    <span className="text-xs" style={{ color: 'rgba(167,139,250,0.5)' }}>Enter to send · Shift+Enter new line</span>
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
                            className="w-full resize-none px-4 py-3 rounded-2xl text-sm transition focus:outline-none"
                            style={{
                                minHeight: 46, maxHeight: 140,
                                background: 'rgba(30,27,75,0.95)',
                                border: '1.5px solid rgba(99,102,241,0.5)',
                                color: '#e2e8f0',
                            }}
                            onInput={e => {
                                const el = e.currentTarget;
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 140) + 'px';
                            }}
                        />
                        {reply.length > 0 && (
                            <button onClick={() => setReply('')}
                                className="absolute right-3 top-3 text-lg transition"
                                style={{ color: 'rgba(167,139,250,0.5)' }}>×</button>
                        )}
                    </div>

                    <button
                        onClick={() => sendReply()}
                        disabled={!reply.trim() || sending}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 shadow-lg"
                        style={{
                            background: (!reply.trim() || sending)
                                ? 'rgba(99,102,241,0.25)'
                                : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            boxShadow: (!reply.trim() || sending) ? 'none' : '0 4px 16px rgba(99,102,241,0.5)',
                        }}>
                        {sending ? (
                            <svg className="w-4 h-4 animate-spin" style={{ color: '#a5b4fc' }} fill="none" viewBox="0 0 24 24">
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
