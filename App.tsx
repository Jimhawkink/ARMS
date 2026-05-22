import React, { useState, useEffect, Component, ErrorInfo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, StyleSheet, ScrollView, LogBox } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

// ─── CRASH DEBUGGER ──────────────────────────────────────────
// This will catch ANY error and show it on screen
class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: string, stack: string}> {
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
                <View style={{flex:1, backgroundColor:'#1a1a2e', padding:20, paddingTop:60}}>
                    <Text style={{color:'#ff4444', fontSize:22, fontWeight:'900', marginBottom:16}}>⚠️ APP CRASH DEBUG</Text>
                    <Text style={{color:'#ff8888', fontSize:14, fontWeight:'700', marginBottom:8}}>Error:</Text>
                    <ScrollView style={{flex:1}}>
                        <Text style={{color:'#ffaaaa', fontSize:13, marginBottom:16}} selectable>{this.state.error}</Text>
                        <Text style={{color:'#ff8888', fontSize:14, fontWeight:'700', marginBottom:8}}>Stack Trace:</Text>
                        <Text style={{color:'#888', fontSize:11}} selectable>{this.state.stack}</Text>
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
import { TenantSession } from './src/lib/supabase';
import { getSession, clearSession, updateSessionActivity } from './src/lib/security';

const ARMS_API_BASE = 'https://arms-opal.vercel.app';
const LICENSE_STORAGE_KEY = 'arms_mobile_license';

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
function AppInner() {
    const [isLoading, setIsLoading] = useState(true);
    const [session, setSession] = useState<TenantSession | null>(null);
    const [license, setLicense] = useState<MobileLicense | null>(null);
    const [licenseError, setLicenseError] = useState('');

    useEffect(() => {
        initApp();
    }, []);

    const initApp = async () => {
        try {
            // 1. Check license first
            const rawLicense = await AsyncStorage.getItem(LICENSE_STORAGE_KEY);
            if (rawLicense) {
                const storedLicense: MobileLicense = JSON.parse(rawLicense);
                // Check local expiry first — don't hit network if expired
                const expiry = new Date(storedLicense.expiryDate);
                if (expiry <= new Date()) {
                    await AsyncStorage.removeItem(LICENSE_STORAGE_KEY);
                    setLicenseError('License expired. Please re-activate.');
                } else {
                    // Trust cached license — skip online re-validation to avoid crashes
                    setLicense(storedLicense);
                    // 2. Check session only if licensed
                    const saved = await getSession();
                    if (saved) setSession(saved);
                    // Try background re-validation (non-blocking)
                    validateLicense(storedLicense).catch(() => {/* silent */});
                }
            }
            // If no license stored, license state stays null → show LicenseScreen
        } catch (err) {
            console.error('App init error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const validateLicense = async (lic: MobileLicense): Promise<boolean> => {
        try {
            // @ts-ignore - androidId works at runtime despite TS warning
            const deviceId = Application.androidId || Application.applicationId || 'unknown';
            const deviceHash = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                deviceId + lic.licenseKey.slice(0, 8)
            );
            const res = await fetch(`${ARMS_API_BASE}/api/license/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: lic.licenseKey, machineId: deviceHash }),
            });
            const result = await res.json();
            if (result.valid) {
                // Update stored license with fresh data
                const updated = { ...lic, clientName: result.clientName, daysUntilExpiry: result.daysUntilExpiry, isValid: true };
                await AsyncStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(updated));
                setLicense(updated);
                return true;
            }
            return false;
        } catch {
            // Network error — allow cached license if not expired
            const expiry = new Date(lic.expiryDate);
            return expiry > new Date();
        }
    };

    const handleLicenseActivated = (lic: MobileLicense) => {
        setLicense(lic);
        setLicenseError('');
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

    // No license → show activation screen
    if (!license) {
        return (
            <View style={{ flex: 1 }}>
                <StatusBar style="light" />
                <LicenseScreen onActivated={handleLicenseActivated} errorMessage={licenseError} />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!session ? (
                    <Stack.Screen name="Login">
                        {() => <LoginScreen onLoginSuccess={handleLoginSuccess} license={license} />}
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

// ─── Exported App with Error Boundary ────────────────────────
export default function App() {
    return (
        <ErrorBoundary>
            <AppInner />
        </ErrorBoundary>
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
