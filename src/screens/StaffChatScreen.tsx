import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    RefreshControl,
    StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StaffSession } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4MzM2MDAsImV4cCI6MjAyNTQwOTYwMH0.t2RJaNtAFonOi_4uTpJCa1QBxDXTSoiT3G5MMJ4Imv4';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
const API = 'https://arms-opal.vercel.app/api';

const CANNED = [
    'We have received your message and will inspect shortly.',
    'Our maintenance team will visit your unit within 24 hours.',
    'Please ensure your rent is cleared by the 5th of every month.',
    'Thank you for reaching out. We are actively looking into this.',
    'The issue has been resolved. Kindly verify on your end.',
    'Please visit the property management office at your convenience.',
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

interface StaffChatScreenProps {
    staff: StaffSession;
    onBack?: () => void;
}

function formatTime(dt: string): string {
    if (!dt) return '';
    try {
        const d = new Date(dt);
        const now = new Date();
        const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
        if (diffMin < 1) return 'now';
        if (diffMin < 60) return `${diffMin}m`;
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
    } catch {
        return '';
    }
}

function formatMsgTime(dt: string): string {
    try {
        return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function formatDateGroup(dt: string): string {
    try {
        const d = new Date(dt);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return 'Today';
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return 'Yesterday';
        return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
        return '';
    }
}

function sameDay(a: string, b: string): boolean {
    try {
        return new Date(a).toDateString() === new Date(b).toDateString();
    } catch {
        return false;
    }
}

function initials(name: string): string {
    if (!name) return 'T';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── THREAD VIEW COMPONENT ─────────────────────────────────────────────
function ChatThreadView({
    tenantId,
    tenantName,
    unitName,
    locationName,
    phone,
    staffName,
    onBack,
}: {
    tenantId: number;
    tenantName: string;
    unitName: string;
    locationName: string;
    phone: string;
    staffName: string;
    onBack: () => void;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showCanned, setShowCanned] = useState(false);
    const flatRef = useRef<FlatList>(null);
    const sendingRef = useRef(false);

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
    }, [tenantId, scrollToBottom]);

    const markRead = useCallback(async () => {
        await fetch(`${API}/chats?tenantId=${tenantId}`, { method: 'PATCH' }).catch(() => {});
    }, [tenantId]);

    useEffect(() => {
        loadMessages();
        markRead();

        const channel = sb
            .channel(`staff_thread_${tenantId}`)
            .on('postgres_changes' as any, {
                event: 'INSERT',
                schema: 'public',
                table: 'arms_chats',
                filter: `tenant_id=eq.${tenantId}`,
            }, (payload: any) => {
                const msg = payload.new as ChatMessage;
                setMessages(prev => {
                    if (prev.find(m => m.chat_id === msg.chat_id)) return prev;
                    return [...prev, msg];
                });
                scrollToBottom();
            })
            .subscribe();

        return () => {
            sb.removeChannel(channel);
        };
    }, [tenantId, loadMessages, markRead, scrollToBottom]);

    const handleSend = async () => {
        const text = reply.trim();
        if (!text || sendingRef.current) return;

        sendingRef.current = true;
        setSending(true);
        setReply('');
        setShowCanned(false);

        const tempId = -Date.now();
        const optimistic: ChatMessage = {
            chat_id: tempId,
            tenant_id: tenantId,
            sender: 'admin',
            message: text,
            is_read: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimistic]);
        scrollToBottom();

        try {
            await fetch(`${API}/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: tenantId, sender: 'admin', message: text }),
            });
        } catch {
            Alert.alert('Error', 'Message failed to send. Try again.');
            setReply(text);
            setMessages(prev => prev.filter(m => m.chat_id !== tempId));
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    };

    const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isAdmin = item.sender === 'admin';
        const showDate = index === 0 || !sameDay(messages[index - 1].created_at, item.created_at);
        return (
            <View>
                {showDate && (
                    <View style={styles.dateDividerRow}>
                        <View style={styles.dateDividerLine} />
                        <View style={styles.datePill}>
                            <Text style={styles.datePillText}>{formatDateGroup(item.created_at).toUpperCase()}</Text>
                        </View>
                        <View style={styles.dateDividerLine} />
                    </View>
                )}
                <View style={[styles.msgRow, isAdmin ? styles.msgRowRight : styles.msgRowLeft]}>
                    {!isAdmin && (
                        <View style={styles.tenantMsgAvatar}>
                            <Text style={styles.tenantMsgAvatarText}>{initials(tenantName)}</Text>
                        </View>
                    )}

                    {isAdmin ? (
                        <LinearGradient
                            colors={['#10b981', '#059669']}
                            style={styles.bubbleAdmin}
                        >
                            <Text style={styles.msgTextAdmin}>{item.message}</Text>
                            <View style={styles.msgMetaRow}>
                                <Text style={styles.msgTimeAdmin}>{formatMsgTime(item.created_at)}</Text>
                                <Text style={styles.ticks}>{item.is_read ? '✓✓' : '✓'}</Text>
                            </View>
                        </LinearGradient>
                    ) : (
                        <View style={styles.bubbleTenant}>
                            <Text style={styles.msgTextTenant}>{item.message}</Text>
                            <View style={styles.msgMetaRow}>
                                <Text style={styles.msgTimeTenant}>{formatMsgTime(item.created_at)}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Thread Safe Header */}
            <View style={styles.pinnedHeader}>
                <TouchableOpacity onPress={onBack} activeOpacity={0.75} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>← Inbox</Text>
                </TouchableOpacity>

                <View style={styles.threadHeaderAvatar}>
                    <Text style={styles.threadHeaderAvatarText}>{initials(tenantName)}</Text>
                </View>

                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{tenantName}</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>
                        Unit {unitName} • {locationName}
                    </Text>
                </View>

                <TouchableOpacity onPress={loadMessages} style={styles.refreshIconBtn}>
                    <Text style={styles.refreshIconText}>↻</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {loading ? (
                    <View style={styles.centerFlex}>
                        <ActivityIndicator color="#10b981" size="large" />
                    </View>
                ) : (
                    <FlatList
                        ref={flatRef}
                        data={messages}
                        keyExtractor={m => String(m.chat_id)}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.messagesListContent}
                        onContentSizeChange={scrollToBottom}
                        ListEmptyComponent={
                            <View style={styles.emptyCenter}>
                                <Text style={styles.emptyIcon}>💬</Text>
                                <Text style={styles.emptyTitle}>No messages yet</Text>
                                <Text style={styles.emptySub}>Start the conversation with {tenantName} below.</Text>
                            </View>
                        }
                    />
                )}

                {/* Quick canned replies */}
                {showCanned && (
                    <View style={styles.cannedBox}>
                        <Text style={styles.cannedHeaderLabel}>QUICK REPLIES</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {CANNED.map((c, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={styles.cannedChip}
                                    onPress={() => { setReply(c); setShowCanned(false); }}
                                >
                                    <Text style={styles.cannedText} numberOfLines={2}>{c}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Input Dock */}
                <View style={styles.inputDock}>
                    <TouchableOpacity
                        onPress={() => setShowCanned(p => !p)}
                        style={styles.cannedToggleBtn}
                    >
                        <Text style={styles.cannedToggleEmoji}>⚡</Text>
                    </TouchableOpacity>

                    <TextInput
                        style={styles.inputBox}
                        value={reply}
                        onChangeText={setReply}
                        placeholder="Reply as management..."
                        placeholderTextColor="#64748b"
                        multiline
                    />

                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!reply.trim() || sending}
                        style={[styles.sendBtn, !reply.trim() && styles.sendBtnDisabled]}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <Text style={styles.sendIcon}>➤</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── MAIN INBOX VIEW COMPONENT ─────────────────────────────────────────
export default function StaffChatScreen({ staff, onBack }: StaffChatScreenProps) {
    const [inbox, setInbox] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [openThread, setOpenThread] = useState<ChatThread | null>(null);

    const loadInbox = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`${API}/chats?inbox=1`);
            const data = await res.json();
            setInbox(data.inbox || []);
        } catch { /* silent */ }
        finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadInbox();
        const iv = setInterval(() => loadInbox(true), 12000);
        return () => clearInterval(iv);
    }, [loadInbox]);

    if (openThread) {
        return (
            <ChatThreadView
                tenantId={openThread.tenant_id}
                tenantName={openThread.tenant_name}
                unitName={openThread.unit_name}
                locationName={openThread.location_name}
                phone={openThread.phone}
                staffName={staff.staff_name}
                onBack={() => {
                    setOpenThread(null);
                    loadInbox(true);
                }}
            />
        );
    }

    const filtered = inbox.filter(t => {
        const matchesFilter = filter === 'unread' ? t.unread_count > 0 : true;
        const q = search.toLowerCase();
        const matchesSearch = !q ||
            t.tenant_name.toLowerCase().includes(q) ||
            t.unit_name.toLowerCase().includes(q) ||
            t.location_name.toLowerCase().includes(q);
        return matchesFilter && matchesSearch;
    });

    const totalUnread = inbox.reduce((sum, t) => sum + (t.unread_count || 0), 0);

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Safe Top Header Bar */}
            <View style={styles.pinnedHeader}>
                {onBack && (
                    <TouchableOpacity onPress={onBack} activeOpacity={0.75} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>Tenant Messages</Text>
                    <Text style={styles.headerSub}>
                        {totalUnread > 0
                            ? `🔴 ${totalUnread} unread • ${inbox.length} conversations`
                            : `${inbox.length} conversations • Up to date`}
                    </Text>
                </View>
                <TouchableOpacity onPress={() => loadInbox(false)} style={styles.refreshIconBtn}>
                    <Text style={styles.refreshIconText}>↻</Text>
                </TouchableOpacity>
            </View>

            {/* Search & Filter Bar */}
            <View style={styles.searchFilterStrip}>
                <View style={styles.searchBar}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search tenant name or room..."
                        placeholderTextColor="#64748b"
                    />
                    {!!search && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Text style={styles.searchClear}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.filterTabsRow}>
                    <TouchableOpacity
                        onPress={() => setFilter('all')}
                        style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
                    >
                        <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
                            All ({inbox.length})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setFilter('unread')}
                        style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}
                    >
                        <Text style={[styles.filterChipText, filter === 'unread' && styles.filterChipTextActive]}>
                            Unread ({totalUnread})
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Inbox List */}
            {loading ? (
                <View style={styles.centerFlex}>
                    <ActivityIndicator color="#10b981" size="large" />
                    <Text style={styles.loadingText}>Syncing message threads...</Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={t => String(t.tenant_id)}
                    contentContainerStyle={styles.inboxList}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadInbox(true); }}
                            tintColor="#10b981"
                        />
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setOpenThread(item)}
                            style={[styles.threadCard, item.unread_count > 0 && styles.threadCardUnread]}
                        >
                            <View style={styles.threadAvatar}>
                                <Text style={styles.threadAvatarText}>{initials(item.tenant_name)}</Text>
                            </View>

                            <View style={styles.threadBody}>
                                <View style={styles.threadTopRow}>
                                    <Text style={styles.threadTenantName} numberOfLines={1}>
                                        {item.tenant_name}
                                    </Text>
                                    <Text style={styles.threadTime}>{formatTime(item.last_message_at)}</Text>
                                </View>

                                <Text style={styles.threadUnitLocation} numberOfLines={1}>
                                    Unit {item.unit_name} • {item.location_name}
                                </Text>

                                <Text style={styles.threadSnippet} numberOfLines={1}>
                                    {item.last_message || 'No messages yet'}
                                </Text>
                            </View>

                            {item.unread_count > 0 && (
                                <View style={styles.unreadCountBadge}>
                                    <Text style={styles.unreadCountText}>{item.unread_count}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyCenter}>
                            <Text style={styles.emptyIcon}>📬</Text>
                            <Text style={styles.emptyTitle}>No Conversations</Text>
                            <Text style={styles.emptySub}>
                                {search ? 'No conversations match your search.' : 'All tenant chats will appear here.'}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#0a0f1d',
    },
    pinnedHeader: {
        backgroundColor: '#0d1527',
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 46,
        paddingBottom: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 50,
    },
    backBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        paddingHorizontal: 13,
        paddingVertical: 7,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
    },
    backBtnText: {
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: '800',
    },
    headerTitleWrap: {
        flex: 1,
    },
    headerTitle: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: -0.2,
    },
    headerSub: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },
    refreshIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    refreshIconText: {
        color: '#10b981',
        fontSize: 18,
        fontWeight: '900',
    },
    threadHeaderAvatar: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    threadHeaderAvatarText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
    },
    searchFilterStrip: {
        backgroundColor: '#0d1527',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#131b2e',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 40,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        marginBottom: 10,
    },
    searchIcon: {
        fontSize: 13,
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: '#f8fafc',
        fontSize: 13,
    },
    searchClear: {
        color: '#64748b',
        fontSize: 14,
    },
    filterTabsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    filterChip: {
        backgroundColor: '#131b2e',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    filterChipActive: {
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    filterChipText: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '700',
    },
    filterChipTextActive: {
        color: '#10b981',
        fontWeight: '900',
    },
    inboxList: {
        padding: 14,
    },
    threadCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#131b2e',
        padding: 14,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    threadCardUnread: {
        borderColor: 'rgba(16, 185, 129, 0.35)',
        backgroundColor: '#152037',
    },
    threadAvatar: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    threadAvatarText: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '900',
    },
    threadBody: {
        flex: 1,
    },
    threadTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    threadTenantName: {
        color: '#f8fafc',
        fontSize: 14,
        fontWeight: '800',
        flex: 1,
    },
    threadTime: {
        color: '#64748b',
        fontSize: 11,
        fontWeight: '600',
        marginLeft: 8,
    },
    threadUnitLocation: {
        color: '#10b981',
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 4,
    },
    threadSnippet: {
        color: '#94a3b8',
        fontSize: 12,
    },
    unreadCountBadge: {
        backgroundColor: '#10b981',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
        marginLeft: 8,
    },
    unreadCountText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: '900',
    },
    centerFlex: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 12,
    },
    loadingText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
    },
    emptyCenter: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        fontSize: 44,
        marginBottom: 10,
    },
    emptyTitle: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '900',
        marginBottom: 4,
    },
    emptySub: {
        color: '#94a3b8',
        fontSize: 12,
        textAlign: 'center',
    },
    messagesListContent: {
        padding: 14,
    },
    dateDividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 14,
        gap: 10,
    },
    dateDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    datePill: {
        backgroundColor: '#131b2e',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 8,
    },
    datePillText: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '800',
    },
    msgRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 8,
    },
    msgRowRight: {
        justifyContent: 'flex-end',
    },
    msgRowLeft: {
        justifyContent: 'flex-start',
    },
    tenantMsgAvatar: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    tenantMsgAvatarText: {
        color: '#f8fafc',
        fontSize: 11,
        fontWeight: '900',
    },
    bubbleAdmin: {
        maxWidth: '78%',
        borderRadius: 16,
        borderBottomRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleTenant: {
        maxWidth: '78%',
        backgroundColor: '#131d31',
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    msgTextAdmin: {
        color: '#ffffff',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '600',
    },
    msgTextTenant: {
        color: '#e2e8f0',
        fontSize: 14,
        lineHeight: 20,
    },
    msgMetaRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    msgTimeAdmin: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    msgTimeTenant: {
        fontSize: 10,
        color: '#64748b',
    },
    ticks: {
        fontSize: 10,
        color: '#38bdf8',
        fontWeight: '900',
    },
    cannedBox: {
        backgroundColor: '#0d1527',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.06)',
    },
    cannedHeaderLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: '#64748b',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    cannedChip: {
        backgroundColor: '#131b2e',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        maxWidth: 240,
    },
    cannedText: {
        color: '#cbd5e1',
        fontSize: 11,
        fontWeight: '600',
    },
    inputDock: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#0d1527',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
        gap: 8,
    },
    cannedToggleBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#131b2e',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    cannedToggleEmoji: {
        fontSize: 16,
    },
    inputBox: {
        flex: 1,
        backgroundColor: '#131b2e',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        color: '#f8fafc',
        fontSize: 13,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        maxHeight: 100,
    },
    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: {
        backgroundColor: '#1e293b',
    },
    sendIcon: {
        color: '#ffffff',
        fontSize: 16,
    },
});
