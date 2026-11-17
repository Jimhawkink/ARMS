import React, { useState, useEffect, useRef, Component, ErrorInfo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
    ActivityIndicator,
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
    AppState,
    AppStateStatus,
    BackHandler,
    Alert,
    Dimensions,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { setupNotifications, pushNotification } from './src/lib/notifications';
import messaging from '@react-native-firebase/messaging';
import { APP_VERSION } from './src/lib/version';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string; stack: string }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: '', stack: '' };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error: error.message, stack: error.stack || '' };
    }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('APP CRASH:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <View style={{ flex: 1, backgroundColor: '#0a0f1d', padding: 20, paddingTop: 60 }}>
                    <Text style={{ color: '#ef4444', fontSize: 20, fontWeight: '900', marginBottom: 12 }}>⚠️ APP CRASH DEBUG</Text>
                    <ScrollView style={{ flex: 1 }}>
                        <Text style={{ color: '#fca5a5', fontSize: 13, marginBottom: 16 }} selectable>{this.state.error}</Text>
                        <Text style={{ color: '#64748b', fontSize: 11 }} selectable>{this.state.stack}</Text>
                    </ScrollView>
                </View>
            );
        }
        return this.props.children;
    }
}

import LoginScreen from './src/screens/LoginScreen';
import LicenseScreen, { MobileLicense } from './src/screens/LicenseScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import PayRentScreen from './src/screens/PayRentScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TenantSearchScreen from './src/screens/TenantSearchScreen';
import LandlordPayScreen from './src/screens/LandlordPayScreen';
import StaffProfileScreen from './src/screens/StaffProfileScreen';
import ForceUpdateScreen from './src/screens/ForceUpdateScreen';
import ChatScreen from './src/screens/ChatScreen';
import AgreementScreen from './src/screens/AgreementScreen';
import StaffChatScreen from './src/screens/StaffChatScreen';
import {
    TenantSession,
    StaffSession,
    TenantSearchResult,
    TenantAgreement,
    AgreementTemplate,
    getPendingAgreement,
    getAgreementTemplate,
} from './src/lib/supabase';
import {
    clearSession,
    updateSessionActivity,
    clearStaffSession,
    updateStaffSessionActivity,
} from './src/lib/security';

const ARMS_API_BASE = 'https://arms-opal.vercel.app';
const LICENSE_STORAGE_KEY = 'arms_mobile_license';
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes Inactivity Auto-Logout

type RootStackParamList = {
    Login: undefined;
    Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ── Staff Shell — Caretaker or Landlord ─────────────────────────────
function StaffShell({ staff, onLogout }: { staff: StaffSession; onLogout: () => void }) {
    type StaffTab = 'search' | 'chat' | 'profile';
    const [activeTab, setActiveTab] = useState<StaffTab>('search');
    const [collectTenant, setCollectTenant] = useState<TenantSearchResult | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [staffNotif, setStaffNotif] = useState<{
        tenant_name: string;
        message: string;
        created_at: string;
        tenant_id: number;
    } | null>(null);
    const lastSeenMsgRef = useRef<number>(0);
    const lastActiveRef = useRef<number>(Date.now());

    const resetInactivity = () => {
        lastActiveRef.current = Date.now();
    };

    // Hardware Back Button handler
    useEffect(() => {
        const handleBackPress = () => {
            if (collectTenant) {
                setCollectTenant(null);
                return true;
            }
            if (activeTab !== 'search') {
                setActiveTab('search');
                return true;
            }
            return false;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
        return () => sub.remove();
    }, [activeTab, collectTenant]);

    // 15-Minute Inactivity Auto-Logout Check
    useEffect(() => {
        const interval = setInterval(() => {
            const idle = Date.now() - lastActiveRef.current;
            if (idle >= INACTIVITY_TIMEOUT_MS) {
                Alert.alert(
                    'Session Timeout',
                    'You have been logged out after 15 minutes of inactivity for security. Please sign in again.',
                    [{ text: 'OK' }]
                );
                onLogout();
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [onLogout]);

    useEffect(() => {
        const appSub = AppState.addEventListener('change', nextState => {
            if (nextState === 'active') {
                const idle = Date.now() - lastActiveRef.current;
                if (idle >= INACTIVITY_TIMEOUT_MS) {
                    Alert.alert(
                        'Session Timeout',
                        'You have been logged out after 15 minutes of inactivity for security. Please sign in again.',
                        [{ text: 'OK' }]
                    );
                    onLogout();
                } else {
                    lastActiveRef.current = Date.now();
                }
            }
        });
        return () => appSub.remove();
    }, [onLogout]);

    useEffect(() => {
        updateStaffSessionActivity();
    }, [activeTab]);

    // Caretaker inbox polling
    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch('https://arms-opal.vercel.app/api/chats?inbox=1');
                const data = await res.json();
                const inbox = data.inbox || [];
                const total = inbox.reduce((s: number, t: any) => s + (t.unread_count || 0), 0);
                setUnreadCount(total);

                const unreadThreads = inbox.filter((t: any) => t.unread_count > 0 && t.last_message_sender === 'tenant');
                if (unreadThreads.length > 0) {
                    const newest = unreadThreads[0];
                    const msgKey = newest.tenant_id * 1000 + (newest.last_message?.length || 0);
                    if (msgKey !== lastSeenMsgRef.current) {
                        lastSeenMsgRef.current = msgKey;
                        if (activeTab !== 'chat') {
                            pushNotification(
                                `💬 ${newest.tenant_name}`,
                                newest.last_message || 'New message',
                                'arms_messages',
                                { tenantId: newest.tenant_id, screen: 'staff_chat' }
                            );
                            setStaffNotif({
                                tenant_name: newest.tenant_name,
                                message: newest.last_message || 'New message',
                                created_at: newest.last_message_at,
                                tenant_id: newest.tenant_id,
                            });
                            setTimeout(() => setStaffNotif(null), 10000);
                        }
                    }
                }
            } catch { /* silent */ }
        };
        check();
        const iv = setInterval(check, 10000);
        return () => clearInterval(iv);
    }, [activeTab]);

    const isLandlord = staff.role === 'landlord';

    if (collectTenant) {
        return (
            <LandlordPayScreen
                staff={staff}
                tenant={collectTenant}
                onBack={() => setCollectTenant(null)}
                onPaymentComplete={() => setCollectTenant(null)}
            />
        );
    }

    const renderTab = () => {
        switch (activeTab) {
            case 'search':
                return (
                    <TenantSearchScreen
                        staff={staff}
                        onCollectRent={isLandlord ? t => setCollectTenant(t) : undefined}
                    />
                );
            case 'chat':
                return <StaffChatScreen staff={staff} onBack={() => setActiveTab('search')} />;
            case 'profile':
                return <StaffProfileScreen staff={staff} onLogout={onLogout} onBack={() => setActiveTab('search')} />;
        }
    };

    const tabs: { key: StaffTab; emoji: string; label: string; badge?: number }[] = [
        { key: 'search', emoji: '🔍', label: 'Tenants' },
        { key: 'chat', emoji: '💬', label: 'Messages', badge: unreadCount },
        { key: 'profile', emoji: '👤', label: 'Profile' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: '#0a0f1d' }} onTouchStart={resetInactivity}>
            {renderTab()}

            {/* In-App Staff Notification Overlay */}
            <Modal
                visible={!!staffNotif}
                transparent
                animationType="fade"
                onRequestClose={() => setStaffNotif(null)}
            >
                <View style={notifStyles.backdrop}>
                    <View style={notifStyles.card}>
                        <LinearGradient
                            colors={['#065f46', '#059669', '#10b981']}
                            style={notifStyles.cardHeader}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <View style={notifStyles.avatarRing}>
                                <View style={notifStyles.avatar}>
                                    <Text style={notifStyles.avatarText}>👤</Text>
                                </View>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={notifStyles.headerTitle}>{staffNotif?.tenant_name || 'Tenant'}</Text>
                                <Text style={notifStyles.headerSub}>
                                    {staffNotif?.created_at
                                        ? new Date(staffNotif.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                                        : 'Just now'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setStaffNotif(null)} style={notifStyles.closeBtn}>
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>✕</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                        <View style={notifStyles.cardBody}>
                            <Text style={notifStyles.msgLabel}>📨 TENANT MESSAGE</Text>
                            <View style={notifStyles.msgBox}>
                                <Text style={notifStyles.msgText} numberOfLines={6}>
                                    {staffNotif?.message || ''}
                                </Text>
                            </View>
                            <View style={notifStyles.btnRow}>
                                <TouchableOpacity
                                    style={notifStyles.btnReply}
                                    onPress={() => { setStaffNotif(null); setActiveTab('chat'); }}
                                >
                                    <Text style={notifStyles.btnReplyText}>💬 Reply Now</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={notifStyles.btnLater}
                                    onPress={() => setStaffNotif(null)}
                                >
                                    <Text style={notifStyles.btnLaterText}>Later</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Bottom Tab Bar */}
            <View style={styles.bottomBar}>
                {tabs.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={styles.tabWrap}
                            activeOpacity={0.7}
                            onPress={() => {
                                setActiveTab(tab.key);
                                if (tab.key === 'chat') setUnreadCount(0);
                            }}
                        >
                            <View style={[styles.tab, isActive && styles.tabActive]}>
                                <View style={{ position: 'relative' }}>
                                    <Text style={[styles.tabEmoji, isActive && styles.tabEmojiActive]}>
                                        {tab.emoji}
                                    </Text>
                                    {(tab.badge || 0) > 0 && (
                                        <View style={styles.tabBadge}>
                                            <Text style={styles.tabBadgeText}>
                                                {(tab.badge || 0) > 9 ? '9+' : tab.badge}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                    {tab.label}
                                </Text>
                                {isActive && <View style={styles.tabDot} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ── Main App Shell with Bottom Tabs ────────────────────────────────
function AppShell({
    session,
    onLogout,
    pendingChat,
    onChatHandled,
}: {
    session: TenantSession;
    onLogout: () => void;
    pendingChat: boolean;
    onChatHandled: () => void;
}) {
    const [activeTab, setActiveTab] = useState<'home' | 'pay' | 'history' | 'chat' | 'profile'>('home');
    const [currentSession, setCurrentSession] = useState(session);
    const [unreadAdmin, setUnreadAdmin] = useState(0);
    const [chatRefreshCount, setChatRefreshCount] = useState(0);
    const [pendingAgreement, setPendingAgreement] = useState<TenantAgreement | null>(null);
    const [agreementTemplate, setAgreementTemplate] = useState<AgreementTemplate | null>(null);
    const [checkingAgreement, setCheckingAgreement] = useState(true);

    const [chatNotif, setChatNotif] = useState<{
        message: string;
        sender_name: string;
        created_at: string;
    } | null>(null);
    const lastMsgIdRef = useRef<number>(0);
    const lastActiveRef = useRef<number>(Date.now());

    const resetInactivity = () => {
        lastActiveRef.current = Date.now();
    };

    // Hardware Back Button: returns to Dashboard ('home')
    useEffect(() => {
        const handleBackPress = () => {
            if (activeTab !== 'home') {
                setActiveTab('home');
                return true;
            }
            return false;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
        return () => sub.remove();
    }, [activeTab]);

    // 15-Minute Inactivity Auto-Logout
    useEffect(() => {
        const interval = setInterval(() => {
            const idle = Date.now() - lastActiveRef.current;
            if (idle >= INACTIVITY_TIMEOUT_MS) {
                Alert.alert(
                    'Session Timeout',
                    'You have been logged out after 15 minutes of inactivity for your security. Please enter your PIN to continue.',
                    [{ text: 'OK' }]
                );
                onLogout();
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [onLogout]);

    useEffect(() => {
        const appSub = AppState.addEventListener('change', nextState => {
            if (nextState === 'active') {
                const idle = Date.now() - lastActiveRef.current;
                if (idle >= INACTIVITY_TIMEOUT_MS) {
                    Alert.alert(
                        'Session Timeout',
                        'You have been logged out after 15 minutes of inactivity for your security. Please enter your PIN to continue.',
                        [{ text: 'OK' }]
                    );
                    onLogout();
                } else {
                    lastActiveRef.current = Date.now();
                }
            }
        });
        return () => appSub.remove();
    }, [onLogout]);

    useEffect(() => {
        if (pendingChat) {
            setActiveTab('chat');
            setChatRefreshCount(c => c + 1);
            setChatNotif(null);
            onChatHandled();
        }
    }, [pendingChat, onChatHandled]);

    useEffect(() => {
        (async () => {
            try {
                const pending = await getPendingAgreement(session.tenant_id);
                if (pending) {
                    const tmpl = await getAgreementTemplate(session.location_id);
                    setPendingAgreement(pending);
                    setAgreementTemplate(tmpl);
                }
            } catch { /* silent */ }
            setCheckingAgreement(false);
        })();
    }, [session.tenant_id, session.location_id]);

    useEffect(() => {
        let isMounted = true;
        let realtimeChannel: any = null;

        const checkNewMessages = async () => {
            try {
                const { supabase } = await import('./src/lib/supabase');
                const { data } = await supabase
                    .from('arms_chats')
                    .select('chat_id, message, created_at')
                    .eq('tenant_id', session.tenant_id)
                    .eq('sender', 'admin')
                    .eq('is_read', false)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (!isMounted) return;
                setUnreadAdmin(data?.length || 0);

                if (data && data.length > 0) {
                    const newest = data[0];
                    if (newest.chat_id !== lastMsgIdRef.current) {
                        lastMsgIdRef.current = newest.chat_id;
                        if (activeTab !== 'chat') {
                            setChatNotif({
                                message: newest.message,
                                sender_name: 'Management',
                                created_at: newest.created_at,
                            });
                            setTimeout(() => {
                                if (isMounted) setChatNotif(null);
                            }, 12000);
                        }
                    }
                }
            } catch { /* silent */ }
        };

        checkNewMessages();
        const interval = setInterval(checkNewMessages, 8000);

        // Immediate Realtime Notification for Tenant
        import('./src/lib/supabase').then(({ supabase }) => {
            if (!isMounted) return;
            realtimeChannel = supabase
                .channel(`tenant_app_notif_${session.tenant_id}_${Date.now()}`)
                .on(
                    'postgres_changes' as any,
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'arms_chats',
                        filter: `tenant_id=eq.${session.tenant_id}`,
                    },
                    (payload: any) => {
                        const newMsg = payload.new;
                        if (newMsg && newMsg.sender === 'admin') {
                            setUnreadAdmin(c => c + 1);
                            if (activeTab !== 'chat') {
                                lastMsgIdRef.current = newMsg.chat_id;
                                setChatNotif({
                                    message: newMsg.message,
                                    sender_name: 'Management',
                                    created_at: newMsg.created_at,
                                });
                                setTimeout(() => {
                                    if (isMounted) setChatNotif(null);
                                }, 12000);
                            }
                        }
                    }
                )
                .subscribe();
        });

        return () => {
            isMounted = false;
            clearInterval(interval);
            if (realtimeChannel) {
                import('./src/lib/supabase').then(({ supabase }) => {
                    supabase.removeChannel(realtimeChannel);
                });
            }
        };
    }, [session.tenant_id, activeTab]);

    useEffect(() => {
        updateSessionActivity();
    }, [activeTab]);

    const handlePayComplete = () => {
        setActiveTab('home');
    };

    const handleSessionUpdate = (updated: TenantSession) => {
        setCurrentSession(updated);
    };

    if (checkingAgreement) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0f1d' }}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={{ color: '#94a3b8', marginTop: 12, fontSize: 13 }}>Verifying account details...</Text>
            </View>
        );
    }

    if (pendingAgreement) {
        return (
            <AgreementScreen
                agreement={pendingAgreement}
                template={agreementTemplate}
                tenantName={currentSession.tenant_name}
                locationName={currentSession.location_name}
                onAccepted={() => setPendingAgreement(null)}
                onBack={() => setPendingAgreement(null)}
            />
        );
    }

    const renderScreen = () => {
        switch (activeTab) {
            case 'pay':
                return (
                    <PayRentScreen
                        session={currentSession}
                        onBack={() => setActiveTab('home')}
                        onPaymentComplete={handlePayComplete}
                    />
                );
            case 'history':
                return (
                    <HistoryScreen
                        session={currentSession}
                        onBack={() => setActiveTab('home')}
                    />
                );
            case 'chat':
                return (
                    <ChatScreen
                        session={currentSession}
                        refreshTrigger={chatRefreshCount}
                        onBack={() => setActiveTab('home')}
                    />
                );
            case 'profile':
                return (
                    <ProfileScreen
                        session={currentSession}
                        onLogout={onLogout}
                        onBack={() => setActiveTab('home')}
                    />
                );
            default:
                return (
                    <DashboardScreen
                        session={currentSession}
                        onPayRent={() => setActiveTab('pay')}
                        onNavigate={tab => setActiveTab(tab as any)}
                        onSessionUpdate={handleSessionUpdate}
                    />
                );
        }
    };

    const tabs = [
        { key: 'home' as const, emoji: '🏠', label: 'Home' },
        { key: 'pay' as const, emoji: '💳', label: 'Pay Rent' },
        { key: 'history' as const, emoji: '📜', label: 'History' },
        { key: 'chat' as const, emoji: '💬', label: 'Messages', badge: unreadAdmin },
        { key: 'profile' as const, emoji: '👤', label: 'Profile' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: '#0a0f1d' }} onTouchStart={resetInactivity}>
            {renderScreen()}

            {/* In-App Management Notification Overlay */}
            <Modal
                visible={!!chatNotif}
                transparent
                animationType="fade"
                onRequestClose={() => setChatNotif(null)}
            >
                <View style={notifStyles.backdrop}>
                    <View style={notifStyles.card}>
                        <LinearGradient
                            colors={['#10b981', '#059669', '#047857']}
                            style={notifStyles.cardHeader}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <View style={notifStyles.avatarRing}>
                                <View style={notifStyles.avatar}>
                                    <Text style={notifStyles.avatarText}>🏢</Text>
                                </View>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={notifStyles.headerTitle}>Management Notice</Text>
                                <Text style={notifStyles.headerSub}>
                                    {chatNotif?.created_at
                                        ? new Date(chatNotif.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                                        : 'Just now'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setChatNotif(null)} style={notifStyles.closeBtn}>
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>✕</Text>
                            </TouchableOpacity>
                        </LinearGradient>

                        <View style={notifStyles.cardBody}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                    setChatNotif(null);
                                    setActiveTab('chat');
                                    setChatRefreshCount(c => c + 1);
                                }}
                            >
                                <Text style={notifStyles.msgLabel}>📨 NEW MESSAGE (TAP TO OPEN)</Text>
                                <View style={notifStyles.msgBox}>
                                    <Text style={notifStyles.msgText} numberOfLines={6}>
                                        {chatNotif?.message || ''}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <View style={notifStyles.btnRow}>
                                <TouchableOpacity
                                    style={notifStyles.btnReply}
                                    onPress={() => {
                                        setChatNotif(null);
                                        setActiveTab('chat');
                                        setChatRefreshCount(c => c + 1);
                                    }}
                                >
                                    <Text style={notifStyles.btnReplyText}>💬 Reply Now</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={notifStyles.btnLater}
                                    onPress={() => setChatNotif(null)}
                                >
                                    <Text style={notifStyles.btnLaterText}>Dismiss</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Ultra-Premium Dark Bottom Tab Bar */}
            <View style={styles.bottomBar}>
                {tabs.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={styles.tabWrap}
                            activeOpacity={0.7}
                            onPress={() => {
                                setActiveTab(tab.key);
                                if (tab.key === 'chat') {
                                    setChatRefreshCount(c => c + 1);
                                    setUnreadAdmin(0);
                                }
                            }}
                        >
                            <View style={[styles.tab, isActive && styles.tabActive]}>
                                <View style={{ position: 'relative' }}>
                                    <Text style={[styles.tabEmoji, isActive && styles.tabEmojiActive]}>
                                        {tab.emoji}
                                    </Text>
                                    {(tab as any).badge > 0 && (
                                        <View style={styles.tabBadge}>
                                            <Text style={styles.tabBadgeText}>
                                                {(tab as any).badge > 9 ? '9+' : (tab as any).badge}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                    {tab.label}
                                </Text>
                                {isActive && <View style={styles.tabDot} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ── Root App Component ──────────────────────────────────────────────
function AppInner() {
    const [isLoading, setIsLoading] = useState(true);
    const [session, setSession] = useState<TenantSession | null>(null);
    const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
    const [license, setLicense] = useState<MobileLicense | null>(null);
    const [licenseError, setLicenseError] = useState('');
    const [forceUpdate, setForceUpdate] = useState<{ required: boolean; latestVersion: string }>({
        required: false,
        latestVersion: APP_VERSION,
    });
    const [pendingChat, setPendingChat] = useState(false);

    useEffect(() => {
        const unsubBg = messaging().onNotificationOpenedApp(remoteMessage => {
            const screen = remoteMessage?.data?.screen;
            if (screen === 'Chat' || screen === 'chat') {
                setPendingChat(true);
            }
        });
        messaging().getInitialNotification().then(remoteMessage => {
            if (remoteMessage) {
                const screen = remoteMessage?.data?.screen;
                if (screen === 'Chat' || screen === 'chat') {
                    setPendingChat(true);
                }
            }
        });
        return () => { unsubBg(); };
    }, []);

    useEffect(() => {
        initApp();
    }, []);

    const lastVersionCheckRef = useRef<number>(0);

    const performVersionCheck = async () => {
        try {
            const now = Date.now();
            if (now - lastVersionCheckRef.current < 15_000) return;
            lastVersionCheckRef.current = now;

            const vRes = await fetch(
                `${ARMS_API_BASE}/api/app-version?version=${encodeURIComponent(APP_VERSION)}`,
                { signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(6000) : undefined }
            );
            if (vRes.ok) {
                const vData = await vRes.json();
                if (vData.forceUpdate) {
                    try {
                        const { clearSession, clearStaffSession } = await import('./src/lib/security');
                        await clearSession();
                        await clearStaffSession();
                    } catch {}
                    setSession(null);
                    setStaffSession(null);
                    setForceUpdate({ required: true, latestVersion: vData.latestVersion || 'v5.3' });
                }
            }
        } catch { /* silent */ }
    };

    useEffect(() => {
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                performVersionCheck();
            }
        });
        const periodicTimer = setInterval(() => {
            performVersionCheck();
        }, 25_000);

        return () => {
            sub.remove();
            clearInterval(periodicTimer);
        };
    }, []);

    const initApp = async () => {
        try {
            await setupNotifications();

            // Version check
            try {
                const vRes = await fetch(
                    `${ARMS_API_BASE}/api/app-version?version=${encodeURIComponent(APP_VERSION)}`,
                    { signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined }
                );
                if (vRes.ok) {
                    const vData = await vRes.json();
                    if (vData.forceUpdate) {
                        try {
                            const { clearSession, clearStaffSession } = await import('./src/lib/security');
                            await clearSession();
                            await clearStaffSession();
                        } catch {}
                        setSession(null);
                        setStaffSession(null);
                        setForceUpdate({ required: true, latestVersion: vData.latestVersion || 'v5.3' });
                        setIsLoading(false);
                        return;
                    }
                }
            } catch { /* proceed offline */ }

            // Restore staff session
            try {
                const { getStaffSession } = await import('./src/lib/security');
                const staff = await getStaffSession();
                if (staff) {
                    setStaffSession(staff);
                    setIsLoading(false);
                    return;
                }
            } catch { /* silent */ }

            // Restore tenant session
            try {
                const { getSession } = await import('./src/lib/security');
                const saved = await getSession();
                if (saved) {
                    setSession(saved);
                    setIsLoading(false);
                    return;
                }
            } catch { /* silent */ }

            // License check
            const rawLic = await AsyncStorage.getItem(LICENSE_STORAGE_KEY);
            if (rawLic) {
                const lic: MobileLicense = JSON.parse(rawLic);
                const isValid = await verifyLicenseWithServer(lic);
                if (isValid) {
                    setLicense(lic);
                } else {
                    setLicense(null);
                    setLicenseError('License expired or deactivated.');
                }
            }
        } catch (err: any) {
            console.error('initApp error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const verifyLicenseWithServer = async (lic: MobileLicense): Promise<boolean> => {
        try {
            const rawId = (Application as any).androidId || Application.applicationId || 'unknown_device';
            const deviceHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawId);

            const res = await fetch(`${ARMS_API_BASE}/api/mobile-license/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Version': APP_VERSION,
                },
                body: JSON.stringify({ licenseKey: lic.licenseKey, machineId: deviceHash }),
            });
            const result = await res.json();
            if (result.valid) {
                const updated = { ...lic, clientName: result.clientName, daysUntilExpiry: result.daysUntilExpiry, isValid: true };
                await AsyncStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(updated));
                setLicense(updated);
                return true;
            }
            return false;
        } catch {
            const expiry = new Date(lic.expiryDate);
            return expiry > new Date();
        }
    };

    const handleLoginSuccess = (incoming: TenantSession | StaffSession) => {
        if ('role' in incoming) {
            setStaffSession(incoming as StaffSession);
        } else {
            setSession(incoming as TenantSession);
        }
    };

    const handleLogout = async () => {
        await clearSession();
        await clearStaffSession();
        setSession(null);
        setStaffSession(null);
        setIsLoading(true);
        await initApp();
    };

    if (isLoading) {
        return (
            <View style={styles.splash}>
                <LinearGradient
                    colors={['#0a0f1d', '#131b2e', '#0a0f1d']}
                    style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.splashLogo}>
                    <Text style={styles.splashEmoji}>🏢</Text>
                </View>
                <Text style={styles.splashTitle}>ARMS</Text>
                <Text style={styles.splashSub}>Tenant Portal</Text>
                <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 24 }} />
            </View>
        );
    }

    if (forceUpdate.required) {
        return (
            <ForceUpdateScreen
                currentVersion={APP_VERSION}
                latestVersion={forceUpdate.latestVersion}
            />
        );
    }

    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!session && !staffSession ? (
                    <Stack.Screen name="Login">
                        {() => <LoginScreen onLoginSuccess={handleLoginSuccess} license={license} />}
                    </Stack.Screen>
                ) : (
                    <Stack.Screen name="Main">
                        {() => staffSession
                            ? <StaffShell staff={staffSession} onLogout={handleLogout} />
                            : (
                                <AppShell
                                    session={session!}
                                    onLogout={handleLogout}
                                    pendingChat={pendingChat}
                                    onChatHandled={() => setPendingChat(false)}
                                />
                            )
                        }
                    </Stack.Screen>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <AppInner />
        </ErrorBoundary>
    );
}

const { width: SW } = Dimensions.get('window');

const notifStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(5, 8, 16, 0.86)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    card: {
        width: SW - 40,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#131b2e',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    avatarRing: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: { fontSize: 18 },
    headerTitle: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
    headerSub: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 11, marginTop: 2 },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardBody: { padding: 18 },
    msgLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: '#10b981',
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    msgBox: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
    },
    msgText: { color: '#f8fafc', fontSize: 13, lineHeight: 20, fontWeight: '600' },
    btnRow: { flexDirection: 'row', gap: 10 },
    btnReply: {
        flex: 1,
        backgroundColor: '#10b981',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    btnReplyText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
    btnLater: {
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
    },
    btnLaterText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
    splash: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0f1d',
    },
    splashLogo: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 1.5,
        borderColor: 'rgba(16, 185, 129, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    splashEmoji: { fontSize: 38 },
    splashTitle: { fontSize: 32, fontWeight: '900', color: '#f8fafc', letterSpacing: 2 },
    splashSub: { fontSize: 13, color: '#94a3b8', fontWeight: '600', marginTop: 4 },

    bottomBar: {
        flexDirection: 'row',
        backgroundColor: '#0d1527',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
        paddingBottom: Platform.OS === 'ios' ? 24 : 10,
        paddingTop: 8,
        paddingHorizontal: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 12,
    },
    tabWrap: { flex: 1 },
    tab: {
        alignItems: 'center',
        paddingVertical: 6,
        borderRadius: 14,
        marginHorizontal: 2,
    },
    tabActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    tabEmoji: {
        fontSize: 18,
        opacity: 0.5,
    },
    tabEmojiActive: {
        opacity: 1,
    },
    tabLabel: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '700',
        marginTop: 3,
    },
    tabLabelActive: {
        color: '#10b981',
        fontWeight: '900',
    },
    tabDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#10b981',
        marginTop: 3,
    },
    tabBadge: {
        position: 'absolute',
        top: -4,
        right: -8,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#ef4444',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    tabBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
});
