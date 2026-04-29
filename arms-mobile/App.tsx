import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { colors } from './src/theme';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import PayRentScreen from './src/screens/PayRentScreen';

// Types
import type { Tenant } from './src/lib/supabase';
import { getStoredSession, getTenantFullData } from './src/lib/supabase';

export type RootStackParamList = {
    Login: undefined;
    Dashboard: undefined;
    PayRent: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppShell({ tenant, onLogout, onTenantUpdate }: {
    tenant: Tenant;
    onLogout: () => void;
    onTenantUpdate: (t: Tenant) => void;
}) {
    const [activeScreen, setActiveScreen] = useState<'dashboard' | 'payrent'>('dashboard');

    if (activeScreen === 'payrent') {
        return (
            <PayRentScreen
                tenant={tenant}
                onBack={() => setActiveScreen('dashboard')}
                onPaymentComplete={() => {
                    // Refresh tenant data when payment is done
                    getTenantFullData(tenant.tenant_id).then(t => {
                        if (t) onTenantUpdate(t);
                    });
                }}
            />
        );
    }

    return (
        <DashboardScreen
            tenant={tenant}
            onLogout={onLogout}
            onPayRent={() => setActiveScreen('payrent')}
            onTenantUpdate={onTenantUpdate}
        />
    );
}

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [tenant, setTenant] = useState<Tenant | null>(null);

    useEffect(() => {
        checkLoginStatus();
    }, []);

    const checkLoginStatus = async () => {
        try {
            const session = await getStoredSession();
            if (session) {
                const freshTenant = await getTenantFullData(session.tenant_id);
                if (freshTenant && freshTenant.status === 'Active') {
                    setTenant(freshTenant);
                } else {
                    // Session invalid or tenant inactive
                    await AsyncStorage.removeItem('arms_tenant_session');
                }
            }
        } catch (error) {
            console.error('Error checking login status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoginSuccess = (loggedInTenant: Tenant) => {
        setTenant(loggedInTenant);
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem('arms_tenant_session');
        setTenant(null);
    };

    const handleTenantUpdate = (updatedTenant: Tenant) => {
        setTenant(updatedTenant);
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accentIndigo} />
                <Text style={styles.loadingText}>ARMS</Text>
            </View>
        );
    }

    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!tenant ? (
                    <Stack.Screen name="Login">
                        {() => <LoginScreen onLoginSuccess={handleLoginSuccess} />}
                    </Stack.Screen>
                ) : (
                    <Stack.Screen name="Dashboard">
                        {() => (
                            <AppShell
                                tenant={tenant}
                                onLogout={handleLogout}
                                onTenantUpdate={handleTenantUpdate}
                            />
                        )}
                    </Stack.Screen>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.bgPrimary,
    },
    loadingText: {
        color: colors.accentIndigo, fontSize: 20,
        fontWeight: '900', marginTop: 12, letterSpacing: 3,
    },
});
