import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
    Alert, RefreshControl, Animated, Keyboard, ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────
interface ChatMsg {
    chat_id: number;
    tenant_id: number;
    sender: 'tenant' | 'admin';
    message: string;
    is_read: boolean;
    created_at: string;
}
interface TenantSession {
    tenant_id: number;
    tenant_name: string;
    phone?: string;
    unit_name?: string;
    location_name?: string;
    pin?: string;
}

// ── Helpers ───────────────────────────────────────────────────
function formatTime(dt: string) {
    try {
        return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
}
function formatDateLabel(dt: string) {
    try {
        const d = new Date(dt);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return 'Today';
        const y = new Date(now); y.setDate(now.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return 'Yesterday';
        return d.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch { return ''; }
}
function sameDay(a: string, b: string) {
    try { return new Date(a).toDateString() === new Date(b).toDateString(); }
    catch { return false; }
}

// ── Main Screen ───────────────────────────────────────────────
export default function ChatScreen() {
    const [session, setSession]     = useState<TenantSession | null>(null);
    const [messages, setMessages]   = useState<ChatMsg[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [message, setMessage]     = useState('');
    const [sending, setSending]     = useState(false);
    const flatListRef               = useRef<FlatList>(null);
    const channelRef                = useRef<any>(null);
    const sendScale                 = useRef(new Animated.Value(1)).current;

    // ── Load session from AsyncStorage ───────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Try multiple possible storage keys
                const keys = ['tenant_session', 'arms_tenant_session', 'session'];
                let raw: string | null = null;
                for (const key of keys) {
                    raw = await AsyncStorage.getItem(key);
                    if (raw) break;
                }
                if (!cancelled && raw) {
                    const parsed = JSON.parse(raw);
                    setSession(parsed);
                } else if (!cancelled) {
                    setLoading(false);
                    setError('Not logged in. Please log in first.');
                }
            } catch (e) {
                if (!cancelled) {
                    setLoading(false);
                    setError('Could not load session. Please restart the app.');
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Load messages when session is ready ──────────────────
    const loadMessages = useCallback(async (sess: TenantSession, showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const { data, error: err } = await supabase
                .from('arms_chats')
                .select('*')
                .eq('tenant_id', sess.tenant_id)
                .order('created_at', { ascending: true });

            if (err) throw err;
            setMessages(data || []);

            // Mark admin messages as read
            await supabase
                .from('arms_chats')
                .update({ is_read: true })
                .eq('tenant_id', sess.tenant_id)
                .eq('sender', 'admin')
                .eq('is_read', false);

        } catch (e: any) {
            const msg = e?.message || 'Failed to load messages';
            // If table doesn't exist, show friendly message not error
            if (msg.includes('does not exist') || msg.includes('relation')) {
                setMessages([]); // Show empty chat, not error
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // ── Subscribe to realtime when session ready ─────────────
    useEffect(() => {
        if (!session) return;
        loadMessages(session);

        // Realtime subscription
        const channel = supabase
            .channel(`arms_chat_tenant_${session.tenant_id}`)
            .on('postgres_changes' as any, {
                event: 'INSERT',
                schema: 'public',
                table: 'arms_chats',
                filter: `tenant_id=eq.${session.tenant_id}`,
            }, (payload: any) => {
                const newMsg = payload.new as ChatMsg;
                setMessages(prev => {
                    if (prev.find(m => m.chat_id === newMsg.chat_id)) return prev;
                    return [...prev, newMsg];
                });
                // Mark admin message read instantly
                if (newMsg.sender === 'admin') {
                    supabase.from('arms_chats')
                        .update({ is_read: true })
                        .eq('chat_id', newMsg.chat_id)
                        .then(() => {});
                }
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            })
            .subscribe((status: string) => {
                // Subscribed ok
            });

        channelRef.current = channel;
        return () => {
            supabase.removeChannel(channel);
        };
    }, [session, loadMessages]);

    // ── Scroll to bottom when messages load ─────────────────
    useEffect(() => {
        if (!loading && messages.length > 0) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
        }
    }, [loading]);

    // ── Send message ─────────────────────────────────────────
    const handleSend = async () => {
        const text = message.trim();
        if (!text || !session || sending) return;

        // Animate send button
        Animated.sequence([
            Animated.timing(sendScale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
            Animated.timing(sendScale, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();

        setMessage('');
        setSending(true);
        Keyboard.dismiss();

        // Optimistic UI
        const tempId = Date.now();
        const tempMsg: ChatMsg = {
            chat_id: tempId,
            tenant_id: session.tenant_id,
            sender: 'tenant',
            message: text,
            is_read: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        try {
            const { error: err } = await supabase
                .from('arms_chats')
                .insert([{
                    tenant_id: session.tenant_id,
                    sender: 'tenant',
                    message: text,
                    is_read: false,
                    created_at: new Date().toISOString(),
                }]);

            if (err) throw err;
            // Remove optimistic, real one will arrive via realtime
            // Or just keep it — it'll deduplicate
        } catch (e: any) {
            // Remove failed optimistic message
            setMessages(prev => prev.filter(m => m.chat_id !== tempId));
            setMessage(text);
            Alert.alert(
                'Message Not Sent',
                'Could not send your message. Please check your connection and try again.',
                [{ text: 'OK' }]
            );
        } finally {
            setSending(false);
        }
    };

    // ── Tick component: ✓ grey=sent, ✓✓ grey=delivered, ✓✓ blue=read ──
    const renderTicks = (isRead: boolean) => (
        <View style={styles.tickRow}>
            <Text style={[styles.tick, isRead ? styles.tickBlue : styles.tickGrey]}>✓</Text>
            <Text style={[styles.tick, styles.tickOverlap, isRead ? styles.tickBlue : styles.tickGrey]}>✓</Text>
        </View>
    );

    // ── Render message bubble ─────────────────────────────────
    const renderItem = ({ item, index }: { item: ChatMsg; index: number }) => {
        const prev = messages[index - 1];
        const showDate = !prev || !sameDay(prev.created_at, item.created_at);
        const prevSameSender = prev && prev.sender === item.sender && !showDate;
        const isMe = item.sender === 'tenant';

        return (
            <View>
                {showDate && (
                    <View style={styles.dateSeparatorRow}>
                        <View style={styles.dateSeparatorLine} />
                        <View style={styles.dateBadge}>
                            <Text style={styles.dateBadgeText}>{formatDateLabel(item.created_at)}</Text>
                        </View>
                        <View style={styles.dateSeparatorLine} />
                    </View>
                )}

                <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft,
                    prevSameSender && styles.msgRowCompact]}>

                    {!isMe && !prevSameSender && (
                        <View style={styles.adminAvatar}>
                            <Text style={styles.adminAvatarText}>🏢</Text>
                        </View>
                    )}
                    {!isMe && prevSameSender && <View style={styles.avatarSpacer} />}

                    <View style={[
                        styles.bubble,
                        isMe ? styles.bubbleMe : styles.bubbleAdmin,
                        prevSameSender && (isMe ? styles.bubbleMeGrouped : styles.bubbleAdminGrouped),
                    ]}>
                        {!isMe && !prevSameSender && (
                            <Text style={styles.senderName}>Property Management</Text>
                        )}
                        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextAdmin]}>
                            {item.message}
                        </Text>
                        <View style={styles.timRow}>
                            <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeAdmin]}>
                                {formatTime(item.created_at)}
                            </Text>
                            {isMe && renderTicks(item.is_read)}
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    // ── Loading / Error / No Session states ──────────────────
    if (loading && !session) {
        return (
            <SafeAreaView style={styles.centerScreen}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>Loading your chat…</Text>
            </SafeAreaView>
        );
    }

    if (error && messages.length === 0) {
        return (
            <SafeAreaView style={styles.centerScreen}>
                <Text style={styles.errorEmoji}>⚠️</Text>
                <Text style={styles.errorTitle}>Something went wrong</Text>
                <Text style={styles.errorMsg}>{error}</Text>
                {session && (
                    <TouchableOpacity style={styles.retryBtn} onPress={() => loadMessages(session)}>
                        <Text style={styles.retryBtnText}>Try Again</Text>
                    </TouchableOpacity>
                )}
            </SafeAreaView>
        );
    }

    // ── Main Chat UI ─────────────────────────────────────────
    return (
        <SafeAreaView style={styles.container} edges={['top']}>

            {/* Header */}
            <LinearGradient colors={['#4f46e5', '#7c3aed', '#a855f7']} style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={styles.headerAvatar}>
                        <Text style={styles.headerAvatarEmoji}>🏢</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Property Management</Text>
                        <View style={styles.headerOnlineRow}>
                            <View style={styles.onlineDot} />
                            <Text style={styles.headerSub}>Alpha Solutions · Online</Text>
                        </View>
                    </View>
                </View>
                <TouchableOpacity
                    style={styles.headerRefreshBtn}
                    onPress={() => session && loadMessages(session, true)}>
                    <Text style={styles.headerRefreshIcon}>{refreshing ? '⏳' : '↺'}</Text>
                </TouchableOpacity>
            </LinearGradient>

            {/* Tenant Info Strip */}
            {session && (
                <View style={styles.tenantStrip}>
                    <Text style={styles.tenantStripText}>
                        👤 {session.tenant_name}
                        {session.unit_name ? `  🏠 ${session.unit_name}` : ''}
                        {session.phone ? `  📱 ${session.phone}` : ''}
                    </Text>
                </View>
            )}

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>

                {/* ── Chat area with WhatsApp-style wallpaper ── */}
                <View style={{ flex: 1 }}>
                    {/* Deep purple gradient wallpaper */}
                    <LinearGradient
                        colors={['#0f0a2e', '#1a0f4e', '#16123a', '#1e1556', '#0f0a2e']}
                        locations={[0, 0.3, 0.5, 0.75, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* Decorative pattern overlay */}
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        {/* Circles */}
                        {[
                            { top: '8%', left: '5%', size: 80, opacity: 0.06 },
                            { top: '20%', right: '3%', size: 50, opacity: 0.05 },
                            { top: '40%', left: '15%', size: 30, opacity: 0.07 },
                            { top: '55%', right: '10%', size: 90, opacity: 0.04 },
                            { top: '75%', left: '8%', size: 60, opacity: 0.06 },
                            { top: '85%', right: '20%', size: 40, opacity: 0.05 },
                        ].map((c, i) => (
                            <View key={i} style={{
                                position: 'absolute',
                                top: c.top as any, left: (c as any).left, right: (c as any).right,
                                width: c.size, height: c.size, borderRadius: c.size / 2,
                                borderWidth: 1.5, borderColor: `rgba(167,139,250,${c.opacity * 3})`,
                                backgroundColor: `rgba(99,102,241,${c.opacity})`,
                            }} />
                        ))}
                        {/* Dot grid */}
                        {Array.from({ length: 25 }).map((_, i) => (
                            <View key={`d${i}`} style={{
                                position: 'absolute',
                                top: `${(i % 5) * 22 + 5}%` as any,
                                left: `${Math.floor(i / 5) * 22 + 3}%` as any,
                                width: 3, height: 3, borderRadius: 1.5,
                                backgroundColor: 'rgba(167,139,250,0.18)',
                            }} />
                        ))}
                    </View>

                    {loading ? (
                        <View style={styles.centerFlex}>
                            <ActivityIndicator size="large" color="#a5b4fc" />
                            <Text style={[styles.loadingText, { color: '#a5b4fc' }]}>Loading messages…</Text>
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderItem}
                            keyExtractor={item => String(item.chat_id)}
                            style={{ flex: 1 }}
                            contentContainerStyle={[
                                styles.msgListContent,
                                messages.length === 0 && styles.msgListEmpty,
                            ]}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={() => session && loadMessages(session, true)}
                                    tintColor="#a5b4fc"
                                />
                            }
                            onContentSizeChange={() =>
                                messages.length > 0 && flatListRef.current?.scrollToEnd({ animated: false })
                            }
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <View style={styles.emptyIconBg}>
                                        <Text style={styles.emptyEmoji}>💬</Text>
                                    </View>
                                    <Text style={styles.emptyTitle}>No messages yet</Text>
                                    <Text style={styles.emptySub}>
                                        Send your first message to the property management team.
                                        {'\n'}We respond as soon as possible.
                                    </Text>
                                    <View style={styles.emptyHints}>
                                        {[
                                            '🔧 Report maintenance issues',
                                            '💳 Enquire about payments',
                                            '📋 Ask about your lease',
                                            '🚨 Report emergencies',
                                        ].map(hint => (
                                            <View key={hint} style={styles.emptyHintRow}>
                                                <Text style={styles.emptyHintText}>{hint}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            }
                        />
                    )}
                </View>

                {/* Input row */}
                <View style={styles.inputContainer}>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Type a message…"
                            placeholderTextColor="#94a3b8"
                            style={styles.input}
                            multiline
                            maxLength={1000}
                            textAlignVertical="top"
                        />
                        {message.length > 0 && (
                            <Text style={styles.charCount}>{message.length}/1000</Text>
                        )}
                    </View>
                    <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                        <TouchableOpacity
                            onPress={handleSend}
                            disabled={!message.trim() || sending}
                            style={[styles.sendBtn,
                                (!message.trim() || sending) && styles.sendBtnDisabled]}
                            activeOpacity={0.8}>
                            {sending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.sendIcon}>➤</Text>
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container:        { flex: 1, backgroundColor: '#0f0a2e' },
    centerScreen:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0a2e', padding: 24 },
    centerFlex:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText:      { fontSize: 14, color: '#a5b4fc', marginTop: 12, fontWeight: '600' },
    errorEmoji:       { fontSize: 48, marginBottom: 12 },
    errorTitle:       { fontSize: 18, fontWeight: '800', color: '#e2e8f0', marginBottom: 8 },
    errorMsg:         { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    retryBtn:         { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, backgroundColor: '#6366f1' },
    retryBtnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    },
    headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    headerAvatar: {
        width: 44, height: 44, borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerAvatarEmoji: { fontSize: 22 },
    headerTitle:      { color: '#fff', fontSize: 15, fontWeight: '800' },
    headerOnlineRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    onlineDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
    headerSub:        { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
    headerRefreshBtn: {
        width: 36, height: 36, borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerRefreshIcon: { color: '#fff', fontSize: 18, fontWeight: '800' },

    // Tenant strip
    tenantStrip: {
        backgroundColor: 'rgba(99,102,241,0.25)', paddingHorizontal: 16, paddingVertical: 7,
        borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.3)',
    },
    tenantStripText: { fontSize: 11, color: '#c4b5fd', fontWeight: '700' },

    // Messages
    msgListContent:   { paddingHorizontal: 12, paddingVertical: 16, paddingBottom: 8 },
    msgListEmpty:     { flexGrow: 1, justifyContent: 'center' },

    // Date separator
    dateSeparatorRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 8 },
    dateSeparatorLine: { flex: 1, height: 1, backgroundColor: 'rgba(167,139,250,0.25)' },
    dateBadge: {
        backgroundColor: 'rgba(99,102,241,0.4)', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 4,
        borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
    },
    dateBadgeText:    { fontSize: 11, color: '#c4b5fd', fontWeight: '700' },

    // Message rows
    msgRow:           { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
    msgRowLeft:       { justifyContent: 'flex-start' },
    msgRowRight:      { justifyContent: 'flex-end' },
    msgRowCompact:    { marginBottom: 2 },

    // Avatars
    adminAvatar: {
        width: 34, height: 34, borderRadius: 12,
        backgroundColor: 'rgba(99,102,241,0.4)',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 8, marginBottom: 2, flexShrink: 0,
        borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
    },
    adminAvatarText:  { fontSize: 16 },
    avatarSpacer:     { width: 42, flexShrink: 0 },

    // Bubbles
    bubble: {
        maxWidth: '78%', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 10,
    },
    bubbleMe: {
        backgroundColor: '#6366f1',
        borderBottomRightRadius: 5,
        shadowColor: '#6366f1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5,
        shadowRadius: 8, elevation: 6,
    },
    bubbleMeGrouped:     { borderBottomRightRadius: 20, borderTopRightRadius: 5 },
    bubbleAdmin: {
        backgroundColor: 'rgba(30, 27, 75, 0.92)',
        borderBottomLeftRadius: 5,
        borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3,
        shadowRadius: 6, elevation: 4,
    },
    bubbleAdminGrouped:  { borderBottomLeftRadius: 20, borderTopLeftRadius: 5 },

    senderName:       { fontSize: 10, fontWeight: '800', color: '#a5b4fc', marginBottom: 4 },
    msgText:          { fontSize: 14, lineHeight: 21 },
    msgTextMe:        { color: '#fff' },
    msgTextAdmin:     { color: '#e2e8f0' },
    timRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 5, gap: 3 },
    timeText:         { fontSize: 10, fontWeight: '500' },
    timeMe:           { color: 'rgba(255,255,255,0.6)' },
    timeAdmin:        { color: 'rgba(167,139,250,0.7)' },

    // Double tick styles — WhatsApp style
    tickRow:          { flexDirection: 'row', alignItems: 'center', marginLeft: 2 },
    tick:             { fontSize: 11, fontWeight: '700', lineHeight: 13 },
    tickOverlap:      { marginLeft: -5 },       // overlap to make double tick
    tickGrey:         { color: 'rgba(255,255,255,0.5)' },   // ✓ sent (not yet read)
    tickBlue:         { color: '#60a5fa' },                 // ✓✓ read — bright blue

    // Empty state
    emptyContainer:   { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
    emptyIconBg: {
        width: 90, height: 90, borderRadius: 28,
        backgroundColor: 'rgba(99,102,241,0.3)',
        borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.4)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    emptyEmoji:       { fontSize: 44 },
    emptyTitle:       { fontSize: 20, fontWeight: '800', color: '#e2e8f0', marginBottom: 10 },
    emptySub:         { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    emptyHints:       { width: '100%', gap: 8 },
    emptyHintRow: {
        backgroundColor: 'rgba(30,27,75,0.7)', borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 10,
        borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    },
    emptyHintText:    { fontSize: 13, color: '#c4b5fd', fontWeight: '600' },

    // Input
    inputContainer: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 10 : 12,
        backgroundColor: 'rgba(15,10,46,0.97)',
        borderTopWidth: 1, borderTopColor: 'rgba(99,102,241,0.35)',
    },
    inputWrapper:     { flex: 1, position: 'relative' },
    input: {
        minHeight: 46, maxHeight: 130,
        borderRadius: 24, backgroundColor: 'rgba(30,27,75,0.95)',
        borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.5)',
        paddingHorizontal: 18, paddingVertical: 12,
        fontSize: 14, color: '#e2e8f0', lineHeight: 20,
    },
    charCount: {
        position: 'absolute', bottom: 6, right: 12,
        fontSize: 9, color: '#6366f1', fontWeight: '600',
    },
    sendBtn: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: '#6366f1',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#6366f1', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
    },
    sendBtnDisabled:  { backgroundColor: 'rgba(99,102,241,0.3)', shadowOpacity: 0 },
    sendIcon:         { color: '#fff', fontSize: 18, marginLeft: 2 },
});

