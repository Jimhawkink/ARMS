import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    ActivityIndicator,
    Alert,
    RefreshControl,
    Animated,
    Keyboard,
    AppState,
    StatusBar,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────
function formatTime(dt: string): string {
    try {
        return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function formatDateLabel(dt: string): string {
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

const QUICK_CHIPS = [
    { label: '💧 Water Issue', text: 'Hello management, we are experiencing water supply issues in our unit. Please advise.' },
    { label: '💡 Power / Token', text: 'Hello, there is an issue with the power supply/tokens in our unit. Kindly check.' },
    { label: '🛠️ Maintenance', text: 'Hello caretaker, I have a maintenance repair request for my unit. When can it be inspected?' },
    { label: '💳 Verify Payment', text: 'Hello, I have made a rent payment via M-Pesa. Kindly confirm and issue my receipt.' },
    { label: '🔑 Gate / Security', text: 'Hello, I need assistance regarding the gate access/keys for my unit.' },
];

export default function ChatScreen({
    session: propSession,
    refreshTrigger,
    onBack,
}: {
    session?: any;
    refreshTrigger?: number;
    onBack?: () => void;
} = {}) {
    const [session, setSession] = useState<TenantSession | null>(propSession || null);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const channelRef = useRef<any>(null);
    const sendScale = useRef(new Animated.Value(1)).current;

    // Sync session prop if provided
    useEffect(() => {
        if (propSession) {
            setSession(propSession);
        }
    }, [propSession]);

    // Load session from AsyncStorage if not passed via props
    useEffect(() => {
        if (propSession) return;
        let cancelled = false;
        (async () => {
            try {
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
    }, [propSession]);

    // Load messages when session is ready
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
            if (msg.includes('does not exist') || msg.includes('relation')) {
                setMessages([]);
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // External refresh trigger
    useEffect(() => {
        if (session && refreshTrigger !== undefined && refreshTrigger > 0) {
            loadMessages(session, true);
        }
    }, [refreshTrigger, session, loadMessages]);

    // Refresh when app returns from background
    useEffect(() => {
        const sub = AppState.addEventListener('change', nextState => {
            if (nextState === 'active' && session) {
                loadMessages(session, false);
            }
        });
        return () => sub.remove();
    }, [session, loadMessages]);

    // Subscribe to realtime updates
    useEffect(() => {
        if (!session) return;
        loadMessages(session);

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
                if (newMsg.sender === 'admin') {
                    supabase.from('arms_chats')
                        .update({ is_read: true })
                        .eq('chat_id', newMsg.chat_id)
                        .then(() => {});
                }
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            })
            .subscribe();

        channelRef.current = channel;
        return () => {
            supabase.removeChannel(channel);
        };
    }, [session, loadMessages]);

    // Scroll to bottom when messages load
    useEffect(() => {
        if (!loading && messages.length > 0) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
        }
    }, [loading]);

    // Send message
    const handleSend = async (customText?: string) => {
        const text = (customText !== undefined ? customText : message).trim();
        if (!text || !session || sending) return;

        Animated.sequence([
            Animated.timing(sendScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
            Animated.timing(sendScale, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();

        if (customText === undefined) setMessage('');
        setSending(true);
        Keyboard.dismiss();

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
        } catch (e: any) {
            setMessages(prev => prev.filter(m => m.chat_id !== tempId));
            if (customText === undefined) setMessage(text);
            Alert.alert(
                'Message Not Sent',
                'Could not send your message. Please check your internet connection and try again.',
                [{ text: 'OK' }]
            );
        } finally {
            setSending(false);
        }
    };

    const renderTicks = (isRead: boolean) => (
        <View style={styles.tickContainer}>
            <Text style={[styles.tickText, isRead ? styles.tickRead : styles.tickSent]}>✓✓</Text>
        </View>
    );

    const renderItem = ({ item, index }: { item: ChatMsg; index: number }) => {
        const prev = messages[index - 1];
        const showDate = !prev || !sameDay(prev.created_at, item.created_at);
        const prevSameSender = prev && prev.sender === item.sender && !showDate;
        const isMe = item.sender === 'tenant';

        return (
            <View>
                {showDate && (
                    <View style={styles.dateDividerRow}>
                        <View style={styles.dateDividerLine} />
                        <View style={styles.datePill}>
                            <Text style={styles.datePillText}>{formatDateLabel(item.created_at).toUpperCase()}</Text>
                        </View>
                        <View style={styles.dateDividerLine} />
                    </View>
                )}

                <View style={[
                    styles.msgRow,
                    isMe ? styles.msgRowRight : styles.msgRowLeft,
                    prevSameSender && styles.msgRowCompact,
                ]}>
                    {!isMe && !prevSameSender && (
                        <View style={styles.staffAvatar}>
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={styles.staffAvatarGrad}
                            >
                                <Text style={styles.staffAvatarIcon}>🏢</Text>
                            </LinearGradient>
                        </View>
                    )}
                    {!isMe && prevSameSender && <View style={styles.staffAvatarSpacer} />}

                    {isMe ? (
                        <LinearGradient
                            colors={['#10b981', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                                styles.bubble,
                                styles.bubbleMe,
                                prevSameSender && styles.bubbleMeGrouped,
                            ]}
                        >
                            <Text style={styles.msgTextMe}>{item.message}</Text>
                            <View style={styles.timeRowMe}>
                                <Text style={styles.timeTextMe}>{formatTime(item.created_at)}</Text>
                                {renderTicks(item.is_read)}
                            </View>
                        </LinearGradient>
                    ) : (
                        <View style={[
                            styles.bubble,
                            styles.bubbleAdmin,
                            prevSameSender && styles.bubbleAdminGrouped,
                        ]}>
                            {!prevSameSender && (
                                <View style={styles.adminHeaderRow}>
                                    <Text style={styles.adminSenderTitle}>Property Concierge</Text>
                                    <View style={styles.verifiedTag}>
                                        <Text style={styles.verifiedTagText}>STAFF</Text>
                                    </View>
                                </View>
                            )}
                            <Text style={styles.msgTextAdmin}>{item.message}</Text>
                            <View style={styles.timeRowAdmin}>
                                <Text style={styles.timeTextAdmin}>{formatTime(item.created_at)}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Top Safe Header (Outside ScrollView/FlatList) */}
            <View style={styles.pinnedHeader}>
                <View style={styles.headerTopRow}>
                    {onBack && (
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={onBack}
                            style={styles.backBtn}
                        >
                            <Text style={styles.backBtnText}>← Back</Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.headerInfoBlock}>
                        <View style={styles.headerAvatarContainer}>
                            <LinearGradient
                                colors={['#10b981', '#047857']}
                                style={styles.headerAvatarGrad}
                            >
                                <Text style={styles.headerAvatarEmoji}>🏢</Text>
                            </LinearGradient>
                            <View style={styles.onlineBadgeRing}>
                                <View style={styles.onlineBadgeCore} />
                            </View>
                        </View>

                        <View style={styles.headerTitles}>
                            <View style={styles.headerTitleRow}>
                                <Text style={styles.headerMainTitle}>Property Concierge</Text>
                                <View style={styles.verifiedBadge}>
                                    <Text style={styles.verifiedBadgeIcon}>✓</Text>
                                </View>
                            </View>
                            <Text style={styles.headerSubTitle}>
                                {session?.unit_name ? `Unit ${session.unit_name} • ` : ''}Direct Helpdesk
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => session && loadMessages(session, true)}
                        style={styles.refreshBtn}
                    >
                        {refreshing ? (
                            <ActivityIndicator size="small" color="#10b981" />
                        ) : (
                            <Text style={styles.refreshIcon}>↻</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Sub-strip with tenant location info */}
                {session && (
                    <View style={styles.unitSubStrip}>
                        <Text style={styles.unitSubStripText} numberOfLines={1}>
                            👤 <Text style={{ color: '#f8fafc', fontWeight: '800' }}>{session.tenant_name}</Text>
                            {session.unit_name ? `  •  🚪 ${session.unit_name}` : ''}
                            {session.location_name ? `  •  📍 ${session.location_name}` : ''}
                        </Text>
                    </View>
                )}
            </View>

            {/* Chat Messages List / Loading / Error */}
            <KeyboardAvoidingView
                style={styles.chatArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {loading && !session ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator size="large" color="#10b981" />
                        <Text style={styles.loadingMessage}>Connecting to management desk...</Text>
                    </View>
                ) : error && messages.length === 0 ? (
                    <View style={styles.centerBox}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorTitle}>Connection Notice</Text>
                        <Text style={styles.errorDesc}>{error}</Text>
                        {session && (
                            <TouchableOpacity
                                style={styles.retryActionBtn}
                                onPress={() => loadMessages(session)}
                            >
                                <Text style={styles.retryActionText}>Reconnect Now</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderItem}
                        keyExtractor={item => String(item.chat_id)}
                        style={styles.flatList}
                        contentContainerStyle={[
                            styles.messagesContainer,
                            messages.length === 0 && styles.messagesEmptyContainer,
                        ]}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => session && loadMessages(session, true)}
                                tintColor="#10b981"
                                colors={['#10b981']}
                            />
                        }
                        onContentSizeChange={() => {
                            if (messages.length > 0) {
                                flatListRef.current?.scrollToEnd({ animated: false });
                            }
                        }}
                        ListEmptyComponent={
                            <View style={styles.emptyHeroCard}>
                                <LinearGradient
                                    colors={['#131b2e', '#0f172a']}
                                    style={styles.emptyCardInner}
                                >
                                    <View style={styles.emptyIconCircle}>
                                        <Text style={styles.emptyHeroEmoji}>💬</Text>
                                    </View>
                                    <Text style={styles.emptyHeroTitle}>Direct Concierge & Helpdesk</Text>
                                    <Text style={styles.emptyHeroSubtitle}>
                                        Need a repair, token assistance, or payment clarification? Messages sent here go directly to your property caretaker and landlord desk.
                                    </Text>

                                    <View style={styles.quickStartBox}>
                                        <Text style={styles.quickStartLabel}>TAP A QUICK MESSAGE TO START:</Text>
                                        {QUICK_CHIPS.slice(0, 3).map((chip, idx) => (
                                            <TouchableOpacity
                                                key={idx}
                                                style={styles.quickStartBtn}
                                                onPress={() => handleSend(chip.text)}
                                                activeOpacity={0.75}
                                            >
                                                <Text style={styles.quickStartBtnText}>{chip.label}</Text>
                                                <Text style={styles.quickStartSendArrow}>→</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </LinearGradient>
                            </View>
                        }
                    />
                )}

                {/* Quick Suggestion Chips Bar */}
                <View style={styles.chipsContainer}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipsScrollContent}
                    >
                        {QUICK_CHIPS.map((chip, i) => (
                            <TouchableOpacity
                                key={i}
                                activeOpacity={0.7}
                                style={styles.chipButton}
                                onPress={() => setMessage(chip.text)}
                            >
                                <Text style={styles.chipText}>{chip.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Bottom Input Dock */}
                <View style={styles.inputDock}>
                    <View style={styles.inputCard}>
                        <TextInput
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Message concierge desk..."
                            placeholderTextColor="#64748b"
                            style={styles.textInput}
                            multiline
                            maxLength={800}
                        />
                        {message.length > 0 && (
                            <Text style={styles.charCounter}>{message.length}/800</Text>
                        )}
                    </View>

                    <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                        <TouchableOpacity
                            onPress={() => handleSend()}
                            disabled={!message.trim() || sending}
                            activeOpacity={0.8}
                            style={styles.sendButtonWrap}
                        >
                            <LinearGradient
                                colors={message.trim() && !sending ? ['#10b981', '#059669'] : ['#1e293b', '#0f172a']}
                                style={styles.sendGradient}
                            >
                                {sending ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <Text style={[styles.sendIconText, !message.trim() && styles.sendIconDisabled]}>
                                        ➤
                                    </Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Ultra-Premium Modern Styles ─────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0f1d',
    },
    pinnedHeader: {
        backgroundColor: '#0d1527',
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 46,
        paddingBottom: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 50,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
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
        letterSpacing: 0.3,
    },
    headerInfoBlock: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerAvatarContainer: {
        position: 'relative',
    },
    headerAvatarGrad: {
        width: 42,
        height: 42,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(16, 185, 129, 0.4)',
    },
    headerAvatarEmoji: {
        fontSize: 20,
    },
    onlineBadgeRing: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#0d1527',
        justifyContent: 'center',
        alignItems: 'center',
    },
    onlineBadgeCore: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10b981',
    },
    headerTitles: {
        flex: 1,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerMainTitle: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: -0.2,
    },
    verifiedBadge: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    verifiedBadgeIcon: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: '900',
    },
    headerSubTitle: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },
    refreshBtn: {
        width: 38,
        height: 38,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    refreshIcon: {
        color: '#10b981',
        fontSize: 18,
        fontWeight: '900',
    },
    unitSubStrip: {
        marginTop: 10,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.18)',
    },
    unitSubStripText: {
        color: '#a7f3d0',
        fontSize: 11,
        fontWeight: '600',
    },
    chatArea: {
        flex: 1,
        backgroundColor: '#0a0f1d',
    },
    flatList: {
        flex: 1,
    },
    messagesContainer: {
        paddingHorizontal: 14,
        paddingTop: 16,
        paddingBottom: 16,
    },
    messagesEmptyContainer: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    centerBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    loadingMessage: {
        marginTop: 14,
        fontSize: 13,
        color: '#94a3b8',
        fontWeight: '700',
    },
    errorIcon: {
        fontSize: 44,
        marginBottom: 10,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#f8fafc',
        marginBottom: 6,
    },
    errorDesc: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    retryActionBtn: {
        backgroundColor: '#10b981',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
    },
    retryActionText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
    dateDividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 16,
        gap: 10,
    },
    dateDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    datePill: {
        backgroundColor: '#131b2e',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    datePillText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#94a3b8',
        letterSpacing: 0.8,
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
    msgRowCompact: {
        marginBottom: 3,
    },
    staffAvatar: {
        marginRight: 8,
        marginBottom: 2,
    },
    staffAvatarGrad: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    staffAvatarIcon: {
        fontSize: 14,
    },
    staffAvatarSpacer: {
        width: 40,
    },
    bubble: {
        maxWidth: '78%',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleMe: {
        borderBottomRightRadius: 4,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    bubbleMeGrouped: {
        borderBottomRightRadius: 18,
        borderTopRightRadius: 4,
    },
    bubbleAdmin: {
        backgroundColor: '#131d31',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 3,
    },
    bubbleAdminGrouped: {
        borderBottomLeftRadius: 18,
        borderTopLeftRadius: 4,
    },
    adminHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    adminSenderTitle: {
        fontSize: 11,
        fontWeight: '900',
        color: '#38bdf8',
    },
    verifiedTag: {
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
    },
    verifiedTagText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#38bdf8',
    },
    msgTextMe: {
        color: '#ffffff',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '600',
    },
    msgTextAdmin: {
        color: '#e2e8f0',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '500',
    },
    timeRowMe: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        gap: 4,
    },
    timeTextMe: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.75)',
        fontWeight: '600',
    },
    tickContainer: {
        flexDirection: 'row',
    },
    tickText: {
        fontSize: 10,
        fontWeight: '900',
    },
    tickSent: {
        color: 'rgba(255, 255, 255, 0.6)',
    },
    tickRead: {
        color: '#38bdf8',
    },
    timeRowAdmin: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    timeTextAdmin: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '600',
    },
    emptyHeroCard: {
        paddingHorizontal: 10,
    },
    emptyCardInner: {
        borderRadius: 22,
        padding: 22,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    emptyIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    emptyHeroEmoji: {
        fontSize: 28,
    },
    emptyHeroTitle: {
        color: '#f8fafc',
        fontSize: 17,
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 8,
    },
    emptyHeroSubtitle: {
        color: '#94a3b8',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    quickStartBox: {
        width: '100%',
        gap: 8,
    },
    quickStartLabel: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.6,
        marginBottom: 2,
    },
    quickStartBtn: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#18233c',
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    quickStartBtnText: {
        color: '#e2e8f0',
        fontSize: 12,
        fontWeight: '700',
    },
    quickStartSendArrow: {
        color: '#10b981',
        fontSize: 15,
        fontWeight: '900',
    },
    chipsContainer: {
        paddingVertical: 8,
        backgroundColor: '#0d1527',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    chipsScrollContent: {
        paddingHorizontal: 14,
        gap: 8,
    },
    chipButton: {
        backgroundColor: '#131b2e',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.09)',
    },
    chipText: {
        color: '#cbd5e1',
        fontSize: 11,
        fontWeight: '700',
    },
    inputDock: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
        backgroundColor: '#0d1527',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.06)',
        gap: 10,
    },
    inputCard: {
        flex: 1,
        minHeight: 46,
        maxHeight: 110,
        backgroundColor: '#131b2e',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    textInput: {
        color: '#f8fafc',
        fontSize: 14,
        lineHeight: 19,
    },
    charCounter: {
        alignSelf: 'flex-end',
        color: '#64748b',
        fontSize: 9,
        fontWeight: '700',
        marginTop: 2,
    },
    sendButtonWrap: {
        borderRadius: 22,
        overflow: 'hidden',
    },
    sendGradient: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendIconText: {
        color: '#ffffff',
        fontSize: 18,
        marginLeft: 2,
    },
    sendIconDisabled: {
        color: '#475569',
    },
});
