'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
    FiArrowLeft, FiPhone, FiRefreshCw, FiSend, FiCheck, FiCheckCircle,
    FiMessageSquare, FiClock, FiSearch, FiX, FiZap, FiCopy, FiExternalLink,
    FiUser, FiHome, FiMapPin, FiSmile, FiCornerDownRight
} from 'react-icons/fi';
import toast from 'react-hot-toast';

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

interface CannedCategory {
    name: string;
    icon: string;
    items: string[];
}

const CANNED_CATEGORIES: CannedCategory[] = [
    {
        name: 'Rent & Payments',
        icon: '💰',
        items: [
            'Please ensure your rent is paid by the 5th of every month to avoid penalties.',
            'We have received and confirmed your payment. Thank you!',
            'Kindly share your M-Pesa confirmation code so we can verify and reconcile your account.',
            'A payment reminder has been issued. Please check your rent balance in the ARMS app.',
        ],
    },
    {
        name: 'Maintenance',
        icon: '🔧',
        items: [
            'Our maintenance technician will inspect your room within 24 hours.',
            'The reported issue has been forwarded to property caretakers for immediate action.',
            'Repairs have been marked resolved. Kindly confirm if everything is working fine.',
        ],
    },
    {
        name: 'General & Support',
        icon: '🤝',
        items: [
            'We have received your message and our team will get back to you shortly.',
            'Thank you for reaching out to ARMS management.',
            'Kindly visit the property management office during office hours (8 AM - 5 PM).',
            'Your request has been noted and updated in our system.',
        ],
    },
];

function formatMsgTime(dt: string) {
    if (!dt) return '';
    try {
        return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function formatDateGroup(dt: string) {
    if (!dt) return '';
    const d = new Date(dt);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function sameDay(a: string, b: string) {
    if (!a || !b) return false;
    return new Date(a).toDateString() === new Date(b).toDateString();
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

// Double Blue Ticks component (Light Super Premium style)
function MessageReceipt({ isRead, isSending }: { isRead: boolean; isSending?: boolean }) {
    if (isSending) {
        return (
            <span className="inline-flex items-center text-indigo-200/70" title="Sending...">
                <FiClock className="w-2.5 h-2.5 animate-spin" />
            </span>
        );
    }
    return (
        <span
            className="inline-flex items-center tracking-tighter ml-1 transition-colors"
            title={isRead ? 'Seen by tenant' : 'Delivered'}
        >
            <span className={`text-[12px] font-bold leading-none ${isRead ? 'text-sky-300' : 'text-white/60'}`}>✓</span>
            <span className={`text-[12px] font-bold leading-none -ml-1 ${isRead ? 'text-sky-300' : 'text-white/60'}`}>✓</span>
        </span>
    );
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
    const [cannedCategory, setCannedCategory] = useState<string>(CANNED_CATEGORIES[0].name);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    // Blur notification overlay — fires when a NEW tenant message arrives while thread is open
    const [newMsgAlert, setNewMsgAlert] = useState<ChatMessage | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

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
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        loadData();
        markRead();

        const channel = supabase
            .channel(`chat_thread_v4_${tenantId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'arms_chats',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                (payload: any) => {
                    const newMsg = payload.new as ChatMessage;

                    if (newMsg.sender === 'admin') {
                        // Replace the optimistic bubble (tempId > 1e12) with the real DB record
                        setMessages(prev => {
                            const hasReal = prev.find(m => m.chat_id === newMsg.chat_id);
                            if (hasReal) return prev;
                            // Swap out the pending optimistic entry for this message text
                            const optimisticIdx = prev.findIndex(
                                m => m.chat_id > 1_000_000_000_000 && m.message === newMsg.message && m.sender === 'admin'
                            );
                            if (optimisticIdx !== -1) {
                                const next = [...prev];
                                next[optimisticIdx] = newMsg;
                                return next;
                            }
                            return [...prev, newMsg];
                        });
                    } else {
                        // Tenant message — always add if not already present
                        setMessages(prev => {
                            if (prev.find(m => m.chat_id === newMsg.chat_id)) return prev;
                            return [...prev, newMsg];
                        });
                        setNewMsgAlert(newMsg);
                        setTimeout(() => setNewMsgAlert(null), 8000);
                    }
                    setTimeout(() => scrollToBottom(), 120);
                }
            )
            .on(
                'postgres_changes' as any,
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'arms_chats',
                    filter: `tenant_id=eq.${tenantId}`,
                },
                (payload: any) => {
                    const updated = payload.new as ChatMessage;
                    setMessages(prev => prev.map(m => (m.chat_id === updated.chat_id ? updated : m)));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tenantId, loadData, markRead, scrollToBottom]);

    useEffect(() => {
        if (!loading) setTimeout(() => scrollToBottom(false), 80);
    }, [loading, scrollToBottom]);

    const sendReply = async (msg?: string) => {
        const text = (msg || reply).trim();
        if (!text || sending) return;
        setSending(true);
        setShowCanned(false);

        const tempId = Date.now();
        const optimistic: ChatMessage = {
            chat_id: tempId,
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
            if (!res.ok) throw new Error('Failed to send');
            inputRef.current?.focus();
        } catch {
            setMessages(prev => prev.filter(m => m.chat_id !== tempId));
            setReply(text);
            toast.error('Could not send message. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const copyToClipboard = (text: string, id: number) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success('Copied to clipboard', { duration: 1500, position: 'bottom-center' });
        setTimeout(() => setCopiedId(null), 2000);
    };

    const copyPhone = () => {
        if (tenantInfo?.phone) {
            navigator.clipboard.writeText(tenantInfo.phone);
            toast.success('Phone copied: ' + tenantInfo.phone);
        }
    };

    const dismissAlert = () => {
        setNewMsgAlert(null);
        markRead();
        scrollToBottom();
        inputRef.current?.focus();
    };

    const filteredMessages = useMemo(() => {
        if (!searchTerm.trim()) return messages;
        const q = searchTerm.toLowerCase();
        return messages.filter(m => m.message.toLowerCase().includes(q));
    }, [messages, searchTerm]);

    const initials =
        tenantInfo?.tenant_name
            ?.split(' ')
            .slice(0, 2)
            .map(w => w[0])
            .join('')
            .toUpperCase() || '?';

    const avatarBg = avatarGradient(tenantInfo?.tenant_name || 'T');

    return (
        <div className="flex flex-col h-screen w-full bg-slate-50 font-sans overflow-hidden select-none">
            {/* ── SUPER PREMIUM BLUR NOTIFICATION MODAL ── */}
            {newMsgAlert && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 animate-fadeIn"
                    style={{
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        background: 'rgba(15, 23, 42, 0.45)',
                    }}
                >
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-scaleUp">
                        {/* Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 flex items-center justify-between text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-white font-extrabold text-base shadow-inner">
                                    {initials}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-base leading-snug">
                                        {tenantInfo?.tenant_name || 'Tenant'}
                                    </h3>
                                    <p className="text-xs text-indigo-200 font-medium">
                                        {tenantInfo?.unit_name} · {tenantInfo?.location_name}
                                    </p>
                                </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-300/30 text-emerald-100 text-xs font-bold">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                Live Message
                            </span>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 mb-2 flex items-center gap-1.5">
                                <FiMessageSquare className="w-3.5 h-3.5" /> Just Received on ARMS Mobile
                            </p>
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-5">
                                <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap select-text">
                                    {newMsgAlert.message}
                                </p>
                                <p className="text-[11px] text-slate-400 text-right mt-2 flex items-center justify-end gap-1">
                                    <FiClock className="w-3 h-3" />
                                    {formatMsgTime(newMsgAlert.created_at)}
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={dismissAlert}
                                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm shadow-md shadow-indigo-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <FiSend className="w-4 h-4" /> Reply Now
                                </button>
                                <button
                                    onClick={() => setNewMsgAlert(null)}
                                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-all"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TOP HEADER (LIGHT SUPER PREMIUM THEME) ── */}
            <header className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 z-20 shadow-xs">
                {/* Luminous Top Accent Line */}
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400" />

                <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                    {/* Left: Back & Avatar & Info */}
                    <div className="flex items-center gap-3.5 min-w-0">
                        <button
                            onClick={() => router.push('/dashboard/chats')}
                            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200/80 flex items-center justify-center transition-all shadow-2xs group flex-shrink-0"
                            title="Back to all conversations"
                        >
                            <FiArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
                        </button>

                        <div className="relative flex-shrink-0">
                            <div
                                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarBg} text-white flex items-center justify-center font-extrabold text-base shadow-sm ring-2 ring-white`}
                            >
                                {initials}
                            </div>
                            <span
                                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white ring-1 ring-emerald-400/40 shadow-xs"
                                title="Tenant online / active"
                            />
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-extrabold text-slate-900 truncate tracking-tight">
                                    {tenantInfo?.tenant_name || `Tenant #${tenantId}`}
                                </h1>
                                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Mobile App Active
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                                <span>{messages.length} messages</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-indigo-600 font-semibold">
                                    {messages.filter(m => m.sender === 'tenant').length} from tenant
                                </span>
                            </p>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Search toggle */}
                        <button
                            onClick={() => setShowSearch(prev => !prev)}
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all text-sm ${
                                showSearch
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                            title="Search in messages"
                        >
                            <FiSearch className="w-4 h-4" />
                        </button>

                        {/* Call tenant */}
                        {tenantInfo?.phone && (
                            <a
                                href={`tel:${tenantInfo.phone}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs transition-all shadow-2xs"
                                title="Call tenant"
                            >
                                <FiPhone className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Call</span>
                            </a>
                        )}

                        {/* WhatsApp link */}
                        {tenantInfo?.phone && (
                            <a
                                href={`https://wa.me/${tenantInfo.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 font-bold text-xs transition-all shadow-2xs"
                                title="Open WhatsApp chat"
                            >
                                <span className="text-sm">💬</span>
                                <span className="hidden lg:inline">WhatsApp</span>
                            </a>
                        )}

                        {/* Refresh */}
                        <button
                            onClick={loadData}
                            className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center transition-all shadow-2xs"
                            title="Reload conversation"
                        >
                            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Sub-header Tenant Metadata Pills */}
                {tenantInfo && (
                    <div className="px-5 pb-3 pt-1 flex items-center gap-2 flex-wrap border-t border-slate-100 bg-slate-50/60">
                        {/* Phone with copy */}
                        <button
                            onClick={copyPhone}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold bg-white text-slate-700 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-2xs group"
                            title="Click to copy phone number"
                        >
                            <span className="text-indigo-500">📱</span>
                            <span>{tenantInfo.phone || 'No phone'}</span>
                            <FiCopy className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
                        </button>

                        {/* Unit / Room */}
                        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold bg-white text-emerald-800 border border-emerald-200 shadow-2xs">
                            <FiHome className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{tenantInfo.unit_name || 'Room N/A'}</span>
                        </span>

                        {/* Location */}
                        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold bg-white text-amber-800 border border-amber-200 shadow-2xs">
                            <FiMapPin className="w-3.5 h-3.5 text-amber-600" />
                            <span>{tenantInfo.location_name || 'Location N/A'}</span>
                        </span>

                        {/* View in Tenants */}
                        <button
                            onClick={() => router.push(`/dashboard/tenants?search=${encodeURIComponent(tenantInfo.tenant_name)}`)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline ml-auto"
                        >
                            <FiExternalLink className="w-3 h-3" /> Tenant Profile
                        </button>
                    </div>
                )}

                {/* Search Bar (Collapsible) */}
                {showSearch && (
                    <div className="px-5 py-2.5 bg-indigo-50/70 border-t border-indigo-100 flex items-center gap-3 animate-fadeIn">
                        <FiSearch className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Type to filter messages in this conversation..."
                            className="flex-1 bg-transparent text-sm text-slate-800 placeholder-indigo-400 focus:outline-none"
                            autoFocus
                        />
                        {searchTerm && (
                            <span className="text-xs text-indigo-600 font-bold">
                                {filteredMessages.length} found
                            </span>
                        )}
                        <button
                            onClick={() => {
                                setSearchTerm('');
                                setShowSearch(false);
                            }}
                            className="w-6 h-6 rounded-md hover:bg-indigo-100 flex items-center justify-center text-slate-500 hover:text-slate-800 text-sm"
                        >
                            <FiX />
                        </button>
                    </div>
                )}
            </header>

            {/* ── CHAT MESSAGES CANVAS (BRIGHT SUPER-PREMIUM LIGHT THEME) ── */}
            <main
                className="flex-1 overflow-y-auto px-4 md:px-8 py-6 relative"
                style={{
                    backgroundColor: '#f8fafc',
                    backgroundImage: `
                        radial-gradient(circle at 100% 0%, rgba(99, 102, 241, 0.04) 0%, transparent 40%),
                        radial-gradient(circle at 0% 100%, rgba(16, 185, 129, 0.04) 0%, transparent 40%),
                        radial-gradient(#e2e8f0 0.75px, transparent 0.75px)
                    `,
                    backgroundSize: '100% 100%, 100% 100%, 24px 24px',
                }}
            >
                <div className="max-w-4xl mx-auto space-y-3">
                    {/* Security & End-to-End Banner */}
                    <div className="flex justify-center my-3">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100/90 border border-slate-200/80 shadow-2xs text-[11px] font-semibold text-slate-600">
                            <span>🔒</span>
                            <span>Direct Secure Messaging · Synchronized with ARMS Tenant Mobile App</span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl animate-pulse shadow-sm">
                                💬
                            </div>
                            <p className="text-sm font-semibold text-slate-500">Loading conversation history...</p>
                        </div>
                    ) : filteredMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white/70 backdrop-blur-sm rounded-3xl border border-dashed border-slate-200 p-8 shadow-xs max-w-md mx-auto text-center">
                            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center text-3xl shadow-sm text-indigo-600">
                                ✉️
                            </div>
                            <h2 className="font-extrabold text-base text-slate-800">
                                {searchTerm ? 'No matching messages found' : 'Start the conversation'}
                            </h2>
                            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                                {searchTerm
                                    ? `No messages matched "${searchTerm}". Clear search to view all.`
                                    : `Send a direct message to ${tenantInfo?.tenant_name?.split(' ')[0] || 'tenant'}. It appears instantly on their phone notification bar.`}
                            </p>
                            {!searchTerm && (
                                <button
                                    onClick={() => inputRef.current?.focus()}
                                    className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                                >
                                    Write a message ↓
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredMessages.map((msg, idx) => {
                            const isAdmin = msg.sender === 'admin';
                            const prev = filteredMessages[idx - 1];
                            const showDate = !prev || !sameDay(prev.created_at, msg.created_at);
                            const showSender = !prev || prev.sender !== msg.sender || showDate;
                            const isSendingOptimistic = msg.chat_id > 1000000000000 && sending;

                            return (
                                <div key={msg.chat_id} className="transition-all">
                                    {/* Date Divider */}
                                    {showDate && (
                                        <div className="flex items-center justify-center my-6">
                                            <div className="flex-1 h-px bg-slate-200/80" />
                                            <span className="mx-4 px-3.5 py-1 rounded-full bg-white/95 border border-slate-200 text-[11px] font-bold text-slate-600 shadow-2xs uppercase tracking-wider">
                                                {formatDateGroup(msg.created_at)}
                                            </span>
                                            <div className="flex-1 h-px bg-slate-200/80" />
                                        </div>
                                    )}

                                    {/* Message Row */}
                                    <div
                                        className={`flex items-end gap-2.5 mb-1.5 group ${
                                            isAdmin ? 'justify-end' : 'justify-start'
                                        }`}
                                    >
                                        {/* Tenant Avatar (Left side) */}
                                        {!isAdmin && (
                                            <div className="w-8 flex-shrink-0 flex items-center justify-center">
                                                {showSender ? (
                                                    <div
                                                        className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarBg} text-white text-xs font-extrabold flex items-center justify-center shadow-xs ring-1 ring-white`}
                                                        title={tenantInfo?.tenant_name}
                                                    >
                                                        {initials}
                                                    </div>
                                                ) : (
                                                    <div className="w-8" />
                                                )}
                                            </div>
                                        )}

                                        {/* Copy button on hover (Admin side - appears to the left) */}
                                        {isAdmin && (
                                            <button
                                                onClick={() => copyToClipboard(msg.message, msg.chat_id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 text-xs flex-shrink-0"
                                                title="Copy message"
                                            >
                                                {copiedId === msg.chat_id ? (
                                                    <FiCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <FiCopy className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        )}

                                        {/* Bubble Container */}
                                        <div
                                            className={`max-w-[75%] md:max-w-[65%] flex flex-col ${
                                                isAdmin ? 'items-end' : 'items-start'
                                            }`}
                                        >
                                            {/* Sender label */}
                                            {showSender && !isAdmin && (
                                                <span className="text-[11px] font-bold text-slate-600 ml-1 mb-1">
                                                    {tenantInfo?.tenant_name || 'Tenant'}
                                                </span>
                                            )}

                                            {/* Actual Bubble */}
                                            <div
                                                className={`relative px-4 py-2.5 transition-all select-text ${
                                                    isAdmin
                                                        ? 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 text-white rounded-2xl rounded-tr-xs shadow-md shadow-indigo-500/15'
                                                        : 'bg-white text-slate-800 rounded-2xl rounded-tl-xs border border-slate-200/90 shadow-sm shadow-slate-900/5 hover:border-slate-300'
                                                }`}
                                            >
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-normal">
                                                    {msg.message}
                                                </p>

                                                {/* Bubble Footer: Time & Status */}
                                                <div
                                                    className={`flex items-center gap-1.5 mt-1 select-none ${
                                                        isAdmin ? 'justify-end text-indigo-100/80' : 'justify-end text-slate-400'
                                                    }`}
                                                >
                                                    <span className="text-[10px] font-medium tracking-tight">
                                                        {formatMsgTime(msg.created_at)}
                                                    </span>
                                                    {isAdmin && (
                                                        <MessageReceipt
                                                            isRead={msg.is_read}
                                                            isSending={isSendingOptimistic}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Copy button on hover (Tenant side - appears to the right) */}
                                        {!isAdmin && (
                                            <button
                                                onClick={() => copyToClipboard(msg.message, msg.chat_id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 text-xs flex-shrink-0"
                                                title="Copy message"
                                            >
                                                {copiedId === msg.chat_id ? (
                                                    <FiCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <FiCopy className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        )}

                                        {/* Admin Avatar (Right side) */}
                                        {isAdmin && (
                                            <div className="w-8 flex-shrink-0 flex items-center justify-center">
                                                {showSender ? (
                                                    <div
                                                        className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white text-xs font-extrabold flex items-center justify-center shadow-xs ring-1 ring-white"
                                                        title="ARMS Admin"
                                                    >
                                                        A
                                                    </div>
                                                ) : (
                                                    <div className="w-8" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={bottomRef} className="h-4" />
                </div>
            </main>

            {/* ── CANNED RESPONSES DRAWER (LIGHT SUPER PREMIUM) ── */}
            {showCanned && (
                <div className="flex-shrink-0 bg-white border-t border-slate-200 shadow-xl max-h-72 overflow-hidden flex flex-col z-20 animate-slideUp">
                    {/* Canned Drawer Header */}
                    <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs">⚡</span>
                            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                                Quick Canned Responses
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            {CANNED_CATEGORIES.map(cat => (
                                <button
                                    key={cat.name}
                                    onClick={() => setCannedCategory(cat.name)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                        cannedCategory === cat.name
                                            ? 'bg-indigo-600 text-white shadow-2xs'
                                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                    }`}
                                >
                                    {cat.icon} {cat.name}
                                </button>
                            ))}
                            <button
                                onClick={() => setShowCanned(false)}
                                className="w-7 h-7 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 ml-2 text-sm"
                            >
                                <FiX />
                            </button>
                        </div>
                    </div>

                    {/* Canned Items List */}
                    <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-50/50">
                        {CANNED_CATEGORIES.find(c => c.name === cannedCategory)?.items.map((item, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setReply(item);
                                    setShowCanned(false);
                                    inputRef.current?.focus();
                                }}
                                className="text-left p-3 rounded-xl bg-white hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 text-xs text-slate-700 font-medium transition-all shadow-2xs flex items-start gap-2 group"
                            >
                                <FiCornerDownRight className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                                <span className="flex-1 leading-relaxed">{item}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── INPUT & REPLY DOCKED BAR (LIGHT SUPER PREMIUM) ── */}
            <footer className="flex-shrink-0 bg-white border-t border-slate-200/90 px-4 md:px-6 py-3.5 shadow-[0_-4px_25px_rgba(0,0,0,0.03)] z-10">
                <div className="max-w-4xl mx-auto">
                    {/* Top Controls: Quick pill triggers */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                            <button
                                onClick={() => setShowCanned(v => !v)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                                    showCanned
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                                }`}
                            >
                                <FiZap className="w-3 h-3" />
                                <span>Quick Templates</span>
                            </button>

                            {/* Shortcut chips */}
                            {[
                                { label: 'Payment confirmed ✓', text: 'We have received and confirmed your payment. Thank you!' },
                                { label: 'Technician on way 🔧', text: 'Our maintenance technician will inspect your room within 24 hours.' },
                                { label: 'Kindly clear balance 💰', text: 'Please ensure your outstanding rent balance is settled to avoid penalties.' },
                            ].map((chip, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setReply(chip.text);
                                        inputRef.current?.focus();
                                    }}
                                    className="hidden md:inline-flex items-center px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium transition-all border border-slate-200/70 whitespace-nowrap"
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>

                        <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-600">Enter ↵</kbd> to send · <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-600">Shift+Enter</kbd> new line
                        </span>
                    </div>

                    {/* Textarea and Send Button */}
                    <div className="flex items-end gap-2.5">
                        <div className="flex-1 relative rounded-2xl bg-slate-50 border border-slate-200/90 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 transition-all shadow-2xs">
                            <textarea
                                ref={inputRef}
                                value={reply}
                                onChange={e => setReply(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendReply();
                                    }
                                }}
                                rows={1}
                                placeholder={`Reply to ${tenantInfo?.tenant_name?.split(' ')[0] || 'tenant'}... (pops up on their phone screen)`}
                                className="w-full resize-none px-4 py-3 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none max-h-36 min-h-[48px]"
                                onInput={e => {
                                    const el = e.currentTarget;
                                    el.style.height = 'auto';
                                    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
                                }}
                            />
                            {reply.length > 0 && (
                                <button
                                    onClick={() => setReply('')}
                                    className="absolute right-3.5 top-3.5 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-xs transition"
                                    title="Clear message"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => sendReply()}
                            disabled={!reply.trim() || sending}
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 shadow-md ${
                                !reply.trim() || sending
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-indigo-500/25 hover:scale-[1.03] active:scale-95'
                            }`}
                            title="Send message (Enter)"
                        >
                            {sending ? (
                                <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <FiSend className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
