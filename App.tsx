import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import PayRentScreen from './src/screens/PayRentScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { TenantSession } from './src/lib/supabase';
import { getSession, clearSession, updateSessionActivity } from './src/lib/security';

type RootStackParamList = {
    Login: undefined;
    Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Main App Shell with bottom tabs ─────────────────────────
function AppShell({ session, onLogout }: { session: TenantSession; onLogout: () => void }) {
    const [activeTab, setActiveTab] = useState<'home' | 'pay' | 'history' | 'profile'>('home');
    const [currentSession, setCurrentSession] = useState(session);

    // Update activity timestamp on tab switches
    useEffect(() => { updateSessionActivity(); }, [activeTab]);

    const handlePayComplete = () => {
        setActiveTab('home');
    };

    const handleSessionUpdate = (updated: TenantSession) => {
        setCurrentSession(updated);
    };

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
                return <HistoryScreen session={currentSession} />;
            case 'profile':
                return <ProfileScreen session={currentSession} onLogout={onLogout} />;
            default:
                return (
                    <DashboardScreen
                        session={currentSession}
                        onPayRent={() => setActiveTab('pay')}
                        onSessionUpdate={handleSessionUpdate}
                    />
                );
        }
    };

    const tabs = [
        { key: 'home' as const, emoji: '🏠', label: 'Home' },
        { key: 'pay' as const, emoji: '💳', label: 'Pay Rent' },
        { key: 'history' as const, emoji: '📜', label: 'History' },
        { key: 'profile' as const, emoji: '👤', label: 'Profile' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
            {renderScreen()}

            {/* Bottom Tab Bar */}
            <View style={styles.bottomBar}>
                {tabs.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <View key={tab.key} style={styles.tabWrap}>
                            <View
                                style={[styles.tab, isActive && styles.tabActive]}
                                onTouchEnd={() => setActiveTab(tab.key)}
                            >
                                <Text style={[styles.tabEmoji, isActive && styles.tabEmojiActive]}>
                                    {tab.emoji}
                                </Text>
                                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                    {tab.label}
                                </Text>
                                {isActive && <View style={styles.tabDot} />}
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Root App ────────────────────────────────────────────────
export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [session, setSession] = useState<TenantSession | null>(null);

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const saved = await getSession();
            if (saved) setSession(saved);
        } catch (err) {
            console.error('Session check error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoginSuccess = (tenant: TenantSession) => {
        setSession(tenant);
    };

    const handleLogout = async () => {
        await clearSession();
        setSession(null);
    };

    if (isLoading) {
        return (
            <View style={styles.splash}>
                <LinearGradient
                    colors={['#0f172a', '#1e1b4b', '#0c1a2e']}
                    style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.splashLogo}>
                    <Text style={styles.splashEmoji}>🏢</Text>
                </View>
                <Text style={styles.splashTitle}>ARMS</Text>
                <Text style={styles.splashSub}>Tenant Portal</Text>
                <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 24 }} />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!session ? (
                    <Stack.Screen name="Login">
                        {() => <LoginScreen onLoginSuccess={handleLoginSuccess} />}
                    </Stack.Screen>
                ) : (
                    <Stack.Screen name="Main">
                        {() => <AppShell session={session} onLogout={handleLogout} />}
                    </Stack.Screen>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    splash: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#0f172a',
    },
    splashLogo: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: 'rgba(99,102,241,0.2)',
        borderWidth: 2, borderColor: 'rgba(99,102,241,0.3)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    splashEmoji: { fontSize: 40 },
    splashTitle: { fontSize: 32, fontWeight: '900', color: '#f8fafc', letterSpacing: 3 },
    splashSub: { fontSize: 14, color: '#94a3b8', fontWeight: '500', marginTop: 4 },

    // Bottom Tab Bar
    bottomBar: {
        flexDirection: 'row',
        backgroundColor: '#1e293b',
        borderTopWidth: 1,
        borderTopColor: '#334155',
        paddingBottom: 8,
        paddingTop: 6,
        paddingHorizontal: 4,
    },
    tabWrap: { flex: 1 },
    tab: {
        alignItems: 'center', paddingVertical: 6, borderRadius: 12,
        marginHorizontal: 2,
    },
    tabActive: { backgroundColor: 'rgba(99,102,241,0.15)' },
    tabEmoji: { fontSize: 18, opacity: 0.5 },
    tabEmojiActive: { opacity: 1 },
    tabLabel: { fontSize: 9, color: '#64748b', fontWeight: '600', marginTop: 3 },
    tabLabelActive: { color: '#a5b4fc', fontWeight: '800' },
    tabDot: {
        width: 4, height: 4, borderRadius: 2,
        backgroundColor: '#6366f1', marginTop: 3,
    },
});
