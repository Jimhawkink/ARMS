/**
 * StaffChatScreen.tsx
 * Caretaker / Landlord chat management — mirrors the web dashboard exactly:
 *   - Inbox: all tenant threads, unread badges, filter tabs (All/Unread/Replied)
 *   - Thread: purple wallpaper, blue double ticks, canned replies, send message
 *   - Realtime: polls every 15s + Supabase subscription
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
    Platform, ScrollView, RefreshControl, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StaffSession } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4MzM2MDAsImV4cCI6MjAyNTQwOTYwMH0.t2RJaNtAFonOi_4uTpJCa1QBxDXTSoiT3G5MMJ4Imv4';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
const API = 'https://arms-opal.vercel.app/api';
const { width: SW, height: SH } = Dimensions.get('window');

const CANNED = [
    'We have received your message and will get back to you shortly.',
    'Our maintenance team will visit within 24 hours.',
    'Please ensure your rent is paid by the 5th of every month.',
    'Thank you for reaching out. We are looking into this.',
    'The issue has been resolved. Please confirm on your end.',
    'Kindly visit the office at your earliest convenience.',
];

interface ChatThread {
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
    last_message: string;
    last_message_sender: 'tenant' | 'admin' | '';
    last_message_at: string;
    unread_count: number;
}
interface ChatMessage {
    chat_id: number;
    tenant_id: number;
    sender: 'tenant' | 'admin';
    message: string;
    is_read: boolean;
    created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────
function formatTime(dt: string) {
    if (!dt) return '';
    const d = new Date(dt), now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}
function formatMsgTime(dt: string) {
    return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}
function formatDateGroup(dt: string) {
    const d = new Date(dt), now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function sameDay(a: string, b: string) {
    return new Date(a).toDateString() === new Date(b).toDateString();
}
const AVATAR_COLORS = [
    ['#6366f1','#8b5cf6'], ['#0ea5e9','#6366f1'], ['#10b981','#059669'],
    ['#f59e0b','#ef4444'], ['#8b5cf6','#ec4899'], ['#06b6d4','#0ea5e9'],
];
function avatarColor(name: string) {
    return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}
function initials(name: string) {
    return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

// ── Double Tick ───────────────────────────────────────────────
function Ticks({ isRead }: { isRead: boolean }) {
    const col = isRead ? '#60a5fa' : 'rgba(255,255,255,0.5)';
    return (
        <View style={{ flexDirection: 'row', marginLeft: 4 }}>
            <Text style={{ color: col, fontSize: 11, fontWeight: '800', marginRight: -5 }}>✓</Text>
            <Text style={{ color: col, fontSize: 11, fontWeight: '800' }}>✓</Text>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════
// THREAD VIEW
// ══════════════════════════════════════════════════════════════
function ChatThread({
    tenantId, tenantName, unitName, locationName, phone,
    staffName, onBack,
}: {
    tenantId: number; tenantName: string; unitName: string;
    locationName: string; phone: string; staffName: string; onBack: () => void;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [reply, setReply]       = useState('');
    const [sending, setSending]   = useState(false);
    const [loading, setLoading]   = useState(true);
    const [showCanned, setShowCanned] = useState(false);
    const flatRef = useRef<FlatList>(null);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 150);
    }, []);

    const loadMessages = useCallback(async () => {
        try {
            const res = await fetch(`${API}/chats?tenantId=${tenantId}`);
            const data = await res.json();
            setMessages(data.messages || []);
            scrollToBottom();
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [tenantId]);

    const markRead = useCallback(async () => {
        await fetch(`${API}/chats?tenantId=${tenantId}`, { method: 'PATCH' }).catch(() => {});
    }, [tenantId]);

    useEffect(() => {
        loadMessages();
        markRead();

        // Realtime subscription
        const channel = sb
            .channel(`staff_thread_${tenantId}`)
            .on('postgres_changes' as any, {
                event: 'INSERT', schema: 'public', table: 'arms_chats',
                filter: `tenant_id=eq.${tenantId}`,
            }, (payload: any) => {
                const msg = payload.new as ChatMessage;
                setMessages(prev => {
                    if (prev.find(m => m.chat_id === msg.chat_id)) return prev;
                    return [...prev, msg];
                });
                if (msg.sender === 'admin') markRead();
                scrollToBottom();
            })
            .subscribe();

        // Poll every 15s fallback
        const iv = setInterval(() => { loadMessages(); markRead(); }, 15000);
        return () => { sb.removeChannel(channel); clearInterval(iv); };
    }, [tenantId]);

    const sendMessage = async () => {
        if (!reply.trim() || sending) return;
        setSending(true);
        const text = reply.trim();
        setReply('');
        setShowCanned(false);
        try {
            await fetch(`${API}/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: tenantId, sender: 'admin', message: text }),
            });
            loadMessages();
        } catch {
            Alert.alert('Error', 'Message failed to send. Try again.');
            setReply(text);
        }
        setSending(false);
        scrollToBottom();
    };

    const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isAdmin = item.sender === 'admin';
        const showDate = index === 0 || !sameDay(messages[index - 1].created_at, item.created_at);
        return (
            <View>
                {showDate && (
                    <View style={th.dateSep}>
                        <View style={th.dateLine} />
                        <Text style={th.dateLabel}>{formatDateGroup(item.created_at)}</Text>
                        <View style={th.dateLine} />
                    </View>
                )}
                <View style={[th.msgRow, isAdmin ? th.msgRowAdmin : th.msgRowTenant]}>
                    {!isAdmin && (
                        <View style={[th.msgAvatar, { backgroundColor: avatarColor(tenantName)[0] }]}>
                            <Text style={th.msgAvatarText}>{initials(tenantName)}</Text>
                        </View>
                    )}
                    <View style={[th.bubble, isAdmin ? th.bubbleAdmin : th.bubbleTenant]}>
                        <Text style={isAdmin ? th.bubbleTextAdmin : th.bubbleTextTenant}>
                            {item.message}
                        </Text>
                        <View style={th.bubbleMeta}>
                            <Text style={th.bubbleTime}>{formatMsgTime(item.created_at)}</Text>
                            {isAdmin && <Ticks isRead={item.is_read} />}
                        </View>
                    </View>
                    {isAdmin && (
                        <View style={[th.msgAvatar, { backgroundColor: '#6366f1' }]}>
                            <Text style={th.msgAvatarText}>
                                {initials(staffName || 'Admin')}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1e1b4b' }}>
            {/* Header */}
            <LinearGradient colors={['#1e1b4b','#3730a3','#6366f1']} style={th.header}>
                <TouchableOpacity onPress={onBack} style={th.backBtn}>
                    <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
                </TouchableOpacity>
                <View style={[th.avatarLg, { backgroundColor: avatarColor(tenantName)[0] }]}>
                    <Text style={th.avatarLgText}>{initials(tenantName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={th.headerName} numberOfLines={1}>{tenantName}</Text>
                    <Text style={th.headerSub} numberOfLines={1}>
                        🏠 {unitName}  📍 {locationName}
                    </Text>
                </View>
                <TouchableOpacity onPress={loadMessages} style={th.refreshBtn}>
                    <Text style={{ color: '#fff', fontSize: 16 }}>↺</Text>
                </TouchableOpacity>
            </LinearGradient>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                {/* Messages wallpaper */}
                <View style={{ flex: 1 }}>
                    {/* Purple dot-grid wallpaper */}
                    <LinearGradient
                        colors={['#0f0a2e','#1a1040','#0f0a2e']}
                        style={StyleSheet.absoluteFillObject}
                    />
                    {/* Glow circles */}
                    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                        <View style={[th.glow, { top: 40, left: -40, backgroundColor: 'rgba(99,102,241,0.12)', width: 220, height: 220, borderRadius: 110 }]} />
                        <View style={[th.glow, { bottom: 80, right: -50, backgroundColor: 'rgba(139,92,246,0.1)', width: 280, height: 280, borderRadius: 140 }]} />
                    </View>

                    {loading ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator color="#6366f1" size="large" />
                        </View>
                    ) : (
                        <FlatList
                            ref={flatRef}
                            data={messages}
                            keyExtractor={m => String(m.chat_id)}
                            renderItem={renderMessage}
                            contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
                            onContentSizeChange={scrollToBottom}
                            ListEmptyComponent={
                                <View style={{ alignItems: 'center', marginTop: 60 }}>
                                    <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' }}>
                                        No messages yet
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 4 }}>
                                        Start the conversation below
                                    </Text>
                                </View>
                            }
                        />
                    )}
                </View>

                {/* Canned replies */}
                {showCanned && (
                    <View style={th.cannedBox}>
                        <Text style={th.cannedTitle}>Quick Replies</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {CANNED.map((c, i) => (
                                <TouchableOpacity key={i} style={th.cannedChip}
                                    onPress={() => { setReply(c); setShowCanned(false); }}>
                                    <Text style={th.cannedText} numberOfLines={2}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Input bar */}
                <View style={th.inputBar}>
                    <TouchableOpacity
                        style={[th.cannedToggle, showCanned && { backgroundColor: '#6366f1' }]}
                        onPress={() => setShowCanned(v => !v)}>
                        <Text style={{ fontSize: 16 }}>⚡</Text>
                    </TouchableOpacity>
                    <TextInput
                        style={th.input}
                        value={reply}
                        onChangeText={setReply}
                        placeholder={`Reply to ${tenantName.split(' ')[0]}…`}
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        multiline
                        maxLength={1000}
                    />
                    <TouchableOpacity
                        style={[th.sendBtn, (!reply.trim() || sending) && { opacity: 0.4 }]}
                        onPress={sendMessage}
                        disabled={!reply.trim() || sending}
                    >
                        {sending
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>
                        }
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ══════════════════════════════════════════════════════════════
// INBOX VIEW
// ══════════════════════════════════════════════════════════════
type FilterTab = 'all' | 'unread' | 'replied';

interface StaffChatScreenProps {
    staff: StaffSession;
}

export default function StaffChatScreen({ staff }: StaffChatScreenProps) {
    const [inbox, setInbox]         = useState<ChatThread[]>([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch]       = useState('');
    const [filter, setFilter]       = useState<FilterTab>('all');
    const [openThread, setOpenThread] = useState<ChatThread | null>(null);
    const [quickReply, setQuickReply] = useState<number | null>(null);
    const [quickMsg, setQuickMsg]   = useState('');
    const [sendingQuick, setSendingQuick] = useState(false);

    const loadInbox = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`${API}/chats?inbox=1`);
            const data = await res.json();
            setInbox(data.inbox || []);
        } catch { /* silent */ }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useEffect(() => {
        loadInbox();
        // Realtime updates
        const channel = sb
            .channel('staff_chat_inbox')
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'arms_chats' },
                () => loadInbox(true))
            .subscribe();
        // Poll every 15s
        const iv = setInterval(() => loadInbox(true), 15000);
        return () => { sb.removeChannel(channel); clearInterval(iv); };
    }, []);

    const filtered = inbox.filter(t => {
        const q = search.toLowerCase();
        const match = t.tenant_name.toLowerCase().includes(q)
            || t.phone.includes(q)
            || t.unit_name.toLowerCase().includes(q)
            || t.location_name.toLowerCase().includes(q);
        if (!match) return false;
        if (filter === 'unread') return t.unread_count > 0;
        if (filter === 'replied') return t.last_message_sender === 'admin';
        return true;
    });

    const totalUnread = inbox.reduce((s, t) => s + t.unread_count, 0);
    const unreadCount = inbox.filter(t => t.unread_count > 0).length;

    const sendQuick = async () => {
        if (!quickMsg.trim() || !quickReply || sendingQuick) return;
        setSendingQuick(true);
        try {
            await fetch(`${API}/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: quickReply, sender: 'admin', message: quickMsg.trim() }),
            });
            setQuickMsg(''); setQuickReply(null);
            loadInbox(true);
        } catch { Alert.alert('Error', 'Send failed. Try again.'); }
        setSendingQuick(false);
    };

    // If a thread is open, show thread view
    if (openThread) {
        return (
            <ChatThread
                tenantId={openThread.tenant_id}
                tenantName={openThread.tenant_name}
                unitName={openThread.unit_name}
                locationName={openThread.location_name}
                phone={openThread.phone}
                staffName={staff.name}
                onBack={() => { setOpenThread(null); loadInbox(true); }}
            />
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            {/* Header */}
            <LinearGradient colors={['#6366f1','#7c3aed','#a855f7']} style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <View style={styles.headerIcon}>
                        <Text style={{ fontSize: 22 }}>💬</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Tenant Messages</Text>
                        <Text style={styles.headerSub}>
                            {totalUnread > 0
                                ? `🔴 ${totalUnread} unread · ${inbox.length} conversations`
                                : `${inbox.length} conversations · All caught up ✓`}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => loadInbox()} style={styles.refreshBtn}>
                        <Text style={{ color: '#fff', fontSize: 18 }}>↺</Text>
                    </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchBox}>
                    <Text style={{ color: 'rgba(196,181,253,0.8)', fontSize: 14, marginRight: 8 }}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search name, room, location…"
                        placeholderTextColor="rgba(196,181,253,0.6)"
                    />
                    {!!search && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Text style={{ color: 'rgba(196,181,253,0.8)', fontSize: 18 }}>×</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filter tabs */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {([
                        { key: 'all', label: `All (${inbox.length})` },
                        { key: 'unread', label: `Unread (${unreadCount})` },
                        { key: 'replied', label: 'Replied' },
                    ] as { key: FilterTab; label: string }[]).map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
                            onPress={() => setFilter(tab.key)}
                        >
                            <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </LinearGradient>

            {/* Thread list */}
            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 40 }}>💬</Text>
                    <ActivityIndicator color="#6366f1" />
                    <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>Loading conversations…</Text>
                </View>
            ) : filtered.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 56 }}>{search ? '🔍' : filter === 'unread' ? '✅' : '💬'}</Text>
                    <Text style={{ color: '#475569', fontWeight: '800', fontSize: 16 }}>
                        {search ? 'No matches' : filter === 'unread' ? 'All messages read!' : 'No messages yet'}
                    </Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', paddingHorizontal: 40 }}>
                        {search ? `No tenant matches "${search}"` : 'Tenant messages will appear here in real-time'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={t => String(t.tenant_id)}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadInbox(); }} colors={['#6366f1']} />}
                    renderItem={({ item: t }) => {
                        const isUnread = t.unread_count > 0;
                        const isQuickOpen = quickReply === t.tenant_id;
                        const [c1, c2] = avatarColor(t.tenant_name);
                        return (
                            <View style={[styles.threadCard, isUnread && styles.threadCardUnread]}>
                                {/* Main row */}
                                <TouchableOpacity
                                    style={styles.threadRow}
                                    onPress={() => setOpenThread(t)}
                                    activeOpacity={0.75}
                                >
                                    {/* Avatar */}
                                    <View style={{ position: 'relative', marginRight: 12 }}>
                                        <LinearGradient colors={[c1, c2]} style={styles.avatar}>
                                            <Text style={styles.avatarText}>{initials(t.tenant_name)}</Text>
                                        </LinearGradient>
                                        {isUnread && (
                                            <View style={styles.unreadBadge}>
                                                <Text style={styles.unreadBadgeText}>
                                                    {t.unread_count > 99 ? '99+' : t.unread_count}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Content */}
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Text style={[styles.tenantName, isUnread && { color: '#1e293b' }]} numberOfLines={1}>
                                                {t.tenant_name}
                                            </Text>
                                            <Text style={[styles.timeText, isUnread && { color: '#ef4444', fontWeight: '800' }]}>
                                                {formatTime(t.last_message_at)}
                                            </Text>
                                        </View>

                                        {/* Chips */}
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                            <View style={[styles.chip, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
                                                <Text style={[styles.chipText, { color: '#6366f1' }]}>📱 {t.phone}</Text>
                                            </View>
                                            <View style={[styles.chip, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                                                <Text style={[styles.chipText, { color: '#16a34a' }]}>🏠 {t.unit_name}</Text>
                                            </View>
                                            <View style={[styles.chip, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                                                <Text style={[styles.chipText, { color: '#d97706' }]}>📍 {t.location_name}</Text>
                                            </View>
                                        </View>

                                        {/* Last message */}
                                        <Text style={[styles.lastMsg, isUnread && { color: '#374151', fontWeight: '700' }]} numberOfLines={1}>
                                            {t.last_message_sender === 'admin'
                                                ? `You: ${t.last_message}`
                                                : t.last_message || 'No messages yet'}
                                        </Text>
                                    </View>

                                    {/* Actions */}
                                    <View style={{ gap: 6, marginLeft: 8 }}>
                                        <TouchableOpacity
                                            style={styles.actionBtn}
                                            onPress={() => setOpenThread(t)}>
                                            <Text style={{ fontSize: 14 }}>💬</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionBtn, isQuickOpen && { backgroundColor: '#7c3aed' }]}
                                            onPress={() => { setQuickReply(isQuickOpen ? null : t.tenant_id); setQuickMsg(''); }}>
                                            <Text style={{ fontSize: 14 }}>↩</Text>
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>

                                {/* Quick reply box */}
                                {isQuickOpen && (
                                    <View style={styles.quickBox}>
                                        <Text style={styles.quickLabel}>Quick Reply → {t.tenant_name.split(' ')[0]}</Text>
                                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                                            <TextInput
                                                style={styles.quickInput}
                                                value={quickMsg}
                                                onChangeText={setQuickMsg}
                                                placeholder={`Message to ${t.tenant_name.split(' ')[0]}…`}
                                                placeholderTextColor="#94a3b8"
                                                multiline
                                                autoFocus
                                            />
                                            <TouchableOpacity
                                                style={[styles.quickSend, (!quickMsg.trim() || sendingQuick) && { opacity: 0.4 }]}
                                                onPress={sendQuick}
                                                disabled={!quickMsg.trim() || sendingQuick}
                                            >
                                                {sendingQuick
                                                    ? <ActivityIndicator color="#fff" size="small" />
                                                    : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Send</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                        <TouchableOpacity onPress={() => setOpenThread(t)} style={{ marginTop: 6 }}>
                                            <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '700' }}>
                                                Open full chat →
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );
                    }}
                    ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />}
                    ListFooterComponent={
                        !loading && inbox.length > 0 ? (
                            <View style={styles.footer}>
                                <Text style={styles.footerText}>
                                    {filtered.length} of {inbox.length} conversations
                                </Text>
                                {totalUnread > 0 && (
                                    <Text style={styles.footerUnread}>🔴 {totalUnread} unread</Text>
                                )}
                            </View>
                        ) : null
                    }
                />
            )}
        </SafeAreaView>
    );
}

// ── Thread styles ─────────────────────────────────────────────
const th = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
    backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    avatarLg: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    avatarLgText: { color: '#fff', fontSize: 15, fontWeight: '900' },
    headerName: { color: '#fff', fontSize: 15, fontWeight: '900' },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
    refreshBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

    glow: { position: 'absolute' },

    dateSep: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 8 },
    dateLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    dateLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', marginHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },

    msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end', gap: 6 },
    msgRowAdmin: { justifyContent: 'flex-end' },
    msgRowTenant: { justifyContent: 'flex-start' },
    msgAvatar: { width: 28, height: 28, borderRadius: 9, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    msgAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    bubble: { maxWidth: SW * 0.72, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
    bubbleAdmin: { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
    bubbleTenant: { backgroundColor: 'rgba(255,255,255,0.12)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    bubbleTextAdmin: { color: '#fff', fontSize: 14, lineHeight: 20 },
    bubbleTextTenant: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
    bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
    bubbleTime: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },

    cannedBox: { backgroundColor: '#1e1b4b', borderTopWidth: 1, borderTopColor: 'rgba(99,102,241,0.3)', padding: 12 },
    cannedTitle: { color: '#a5b4fc', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    cannedChip: { backgroundColor: 'rgba(99,102,241,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, maxWidth: 200, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
    cannedText: { color: '#c4b5fd', fontSize: 12, lineHeight: 16 },

    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: 12, backgroundColor: 'rgba(15,10,46,0.95)', borderTopWidth: 1, borderTopColor: 'rgba(99,102,241,0.2)' },
    cannedToggle: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(99,102,241,0.25)', justifyContent: 'center', alignItems: 'center' },
    input: { flex: 1, backgroundColor: 'rgba(99,102,241,0.18)', borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.35)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: '#fff', fontSize: 14, maxHeight: 100 },
    sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
});

// ── Inbox styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
    headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
    headerSub: { color: 'rgba(196,181,253,0.85)', fontSize: 11, marginTop: 2 },
    refreshBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    searchInput: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 0 },
    filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
    filterTabActive: { backgroundColor: '#fff' },
    filterTabText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    filterTabTextActive: { color: '#6366f1' },

    threadCard: { backgroundColor: '#fff', paddingTop: 2 },
    threadCardUnread: { backgroundColor: '#eef2ff' },
    threadRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12 },
    avatar: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    unreadBadge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, backgroundColor: '#ef4444', borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
    unreadBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
    tenantName: { fontSize: 14, fontWeight: '800', color: '#334155', flex: 1 },
    timeText: { fontSize: 11, color: '#94a3b8', flexShrink: 0, marginLeft: 4 },
    chip: { flexDirection: 'row', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 10, fontWeight: '700' },
    lastMsg: { fontSize: 12, color: '#94a3b8', marginTop: 5 },
    actionBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center' },

    quickBox: { backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e2e8f0', marginHorizontal: 14, marginBottom: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e0e7ff' },
    quickLabel: { fontSize: 10, fontWeight: '900', color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    quickInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#c7d2fe', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#1e293b', maxHeight: 80 },
    quickSend: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' },

    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    footerText: { fontSize: 11, color: '#94a3b8' },
    footerUnread: { fontSize: 11, color: '#ef4444', fontWeight: '800' },
});
