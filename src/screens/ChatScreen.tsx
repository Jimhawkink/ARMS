import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView,
    Platform, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getTenantChats, sendChatMessage, subscribeToChats,
    markAdminChatsRead, ChatMessage, TenantSession,
} from '../lib/supabase';

function formatTime(dt: string) {
    const d = new Date(dt);
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dt: string) {
    const d = new Date(dt);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

export default function ChatScreen() {
    const [session, setSession] = useState<TenantSession | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const unsubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        (async () => {
            const raw = await AsyncStorage.getItem('tenant_session');
            if (raw) setSession(JSON.parse(raw));
        })();
    }, []);

    const loadMessages = useCallback(async () => {
        if (!session) return;
        try {
            const msgs = await getTenantChats(session.tenant_id);
            setMessages(msgs);
            await markAdminChatsRead(session.tenant_id);
        } catch { /* silent */ }
        setLoading(false);
    }, [session]);

    useEffect(() => {
        if (!session) return;
        loadMessages();
        // Subscribe to real-time updates
        unsubRef.current = subscribeToChats(session.tenant_id, (newMsg) => {
            setMessages(prev => [...prev, newMsg]);
            if (newMsg.sender === 'admin') markAdminChatsRead(session.tenant_id);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });
        return () => { if (unsubRef.current) unsubRef.current(); };
    }, [session, loadMessages]);

    const handleSend = async () => {
        if (!message.trim() || !session || sending) return;
        const text = message.trim();
        setMessage('');
        setSending(true);
        // Optimistic UI
        const tempMsg: ChatMessage = {
            chat_id: Date.now(),
            tenant_id: session.tenant_id,
            sender: 'tenant',
            message: text,
            is_read: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        try {
            await sendChatMessage(session.tenant_id, text);
        } catch {
            Alert.alert('Error', 'Failed to send message. Please try again.');
            setMessages(prev => prev.filter(m => m.chat_id !== tempMsg.chat_id));
        }
        setSending(false);
    };

    // Group messages by date
    const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
        const prev = messages[index - 1];
        const showDate = !prev || formatDate(prev.created_at) !== formatDate(item.created_at);
        const isMe = item.sender === 'tenant';

        return (
            <>
                {showDate && (
                    <View style={styles.dateBadgeRow}>
                        <View style={styles.dateBadge}>
                            <Text style={styles.dateBadgeText}>{formatDate(item.created_at)}</Text>
                        </View>
                    </View>
                )}
                <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
                    {!isMe && (
                        <View style={styles.adminAvatar}>
                            <Text style={styles.adminAvatarText}>A</Text>
                        </View>
                    )}
                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleAdmin]}>
                        {!isMe && <Text style={styles.senderLabel}>Admin</Text>}
                        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextAdmin]}>
                            {item.message}
                        </Text>
                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeAdmin]}>
                            {formatTime(item.created_at)}
                            {isMe && <Text> ✓</Text>}
                        </Text>
                    </View>
                </View>
            </>
        );
    };

    if (!session) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <LinearGradient colors={['#6366f1', '#8b5cf6']} style={styles.header}>
                <View style={styles.headerAvatar}>
                    <Text style={styles.headerAvatarText}>🏢</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Property Management</Text>
                    <Text style={styles.headerSub}>Alpha Solutions · Always available</Text>
                </View>
            </LinearGradient>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                {/* Messages */}
                {loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#6366f1" />
                        <Text style={styles.loadingText}>Loading messages…</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderItem}
                        keyExtractor={item => String(item.chat_id)}
                        contentContainerStyle={[styles.msgList, messages.length === 0 && styles.msgListEmpty]}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyEmoji}>💬</Text>
                                <Text style={styles.emptyTitle}>No messages yet</Text>
                                <Text style={styles.emptySub}>
                                    Send a message to your landlord.{'\n'}We'll reply as soon as possible.
                                </Text>
                            </View>
                        }
                    />
                )}

                {/* Input */}
                <View style={styles.inputRow}>
                    <TextInput
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Type a message…"
                        placeholderTextColor="#94a3b8"
                        style={styles.input}
                        multiline
                        maxLength={500}
                        returnKeyType="send"
                        onSubmitEditing={handleSend}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!message.trim() || sending}
                        style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
                        activeOpacity={0.8}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.sendIcon}>➤</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: '#94a3b8', marginTop: 8 },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
    },
    headerAvatar: {
        width: 42, height: 42, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerAvatarText: { fontSize: 20 },
    headerTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
    msgList: { padding: 16, paddingBottom: 8 },
    msgListEmpty: { flex: 1, justifyContent: 'center' },
    dateBadgeRow: { alignItems: 'center', marginVertical: 10 },
    dateBadge: { backgroundColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
    dateBadgeText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 },
    msgRowLeft: { justifyContent: 'flex-start' },
    msgRowRight: { justifyContent: 'flex-end' },
    adminAvatar: {
        width: 30, height: 30, borderRadius: 10, backgroundColor: '#e0e7ff',
        alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 2,
    },
    adminAvatarText: { fontSize: 13, fontWeight: '800', color: '#6366f1' },
    bubble: {
        maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    },
    bubbleMe: {
        backgroundColor: '#6366f1', borderBottomRightRadius: 4,
    },
    bubbleAdmin: {
        backgroundColor: '#fff', borderBottomLeftRadius: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
        shadowRadius: 4, elevation: 2,
    },
    senderLabel: { fontSize: 10, fontWeight: '800', color: '#6366f1', marginBottom: 3 },
    msgText: { fontSize: 14, lineHeight: 20 },
    msgTextMe: { color: '#fff' },
    msgTextAdmin: { color: '#1e293b' },
    timeText: { fontSize: 10, marginTop: 4 },
    timeMe: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
    timeAdmin: { color: '#94a3b8', textAlign: 'left' },
    emptyContainer: { alignItems: 'center', paddingVertical: 40 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: '#334155', marginBottom: 8 },
    emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9',
    },
    input: {
        flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22,
        backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
        paddingHorizontal: 16, paddingVertical: 10,
        fontSize: 14, color: '#1e293b',
    },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#6366f1',
        alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: '#e2e8f0' },
    sendIcon: { color: '#fff', fontSize: 18, marginLeft: 2 },
});
