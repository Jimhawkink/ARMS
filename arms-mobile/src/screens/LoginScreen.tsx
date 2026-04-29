import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
    Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import { loginTenant, normalizePhone, formatPhoneDisplay } from '../lib/supabase';
import type { Tenant } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

interface LoginScreenProps {
    onLoginSuccess: (tenant: Tenant) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');

    // Animation
    const floatAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const updateDateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
            setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        };
        updateDateTime();
        const interval = setInterval(updateDateTime, 1000);

        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 3000, useNativeDriver: true }),
            ])
        ).start();

        return () => clearInterval(interval);
    }, []);

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -8],
    });

    const handleLogin = async () => {
        setError('');

        if (!phone.trim()) {
            setError('Please enter your phone number');
            return;
        }
        if (!pin.trim()) {
            setError('Please enter your PIN');
            return;
        }
        if (pin.trim().length < 4) {
            setError('PIN must be at least 4 digits');
            return;
        }

        setLoading(true);
        try {
            const result = await loginTenant(phone.trim(), pin.trim());
            if (result.success && result.tenant) {
                onLoginSuccess(result.tenant);
            } else {
                setError(result.error || 'Login failed');
            }
        } catch (e: any) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            {/* Background decorations */}
            <View style={styles.bgCircle1} />
            <View style={styles.bgCircle2} />
            <View style={styles.bgCircle3} />

            <View style={styles.content}>
                {/* Logo Section */}
                <Animated.View style={[styles.logoContainer, { transform: [{ translateY: floatY }] }]}>
                    <LinearGradient colors={colors.gradientPrimary} style={styles.logoCircle}>
                        <Text style={styles.logoIcon}>🏠</Text>
                    </LinearGradient>
                    <Text style={styles.appTitle}>ARMS</Text>
                    <Text style={styles.appSubtitle}>Apartment Rental Management</Text>
                    <Text style={styles.appSubSub}>Tenant Portal</Text>
                </Animated.View>

                {/* Date/Time */}
                <View style={styles.dateTimeRow}>
                    <Text style={styles.dateTimeText}>{currentDate}</Text>
                    <Text style={styles.dateTimeText}>{currentTime}</Text>
                </View>

                {/* Login Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>Welcome Back</Text>
                        <Text style={styles.cardSubtitle}>Sign in with your phone & PIN</Text>
                    </View>

                    {/* Phone Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>📱 PHONE NUMBER</Text>
                        <View style={[styles.inputWrapper, error && styles.inputWrapperError]}>
                            <Text style={styles.phonePrefix}>🇰🇪 +254</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="7XX XXX XXX"
                                placeholderTextColor={colors.textPlaceholder}
                                value={phone.startsWith('254') ? phone.slice(3) : phone.startsWith('0') ? phone.slice(1) : phone}
                                onChangeText={(text: string) => {
                                    const clean = text.replace(/\D/g, '');
                                    setPhone(clean);
                                    setError('');
                                }}
                                keyboardType="phone-pad"
                                maxLength={9}
                                editable={!loading}
                            />
                        </View>
                    </View>

                    {/* PIN Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>🔐 PIN</Text>
                        <View style={[styles.inputWrapper, error && styles.inputWrapperError]}>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your PIN"
                                placeholderTextColor={colors.textPlaceholder}
                                value={pin}
                                onChangeText={(text: string) => {
                                    setPin(text.replace(/\D/g, ''));
                                    setError('');
                                }}
                                secureTextEntry={!showPin}
                                keyboardType="numeric"
                                maxLength={6}
                                editable={!loading}
                            />
                            <TouchableOpacity
                                style={styles.eyeBtn}
                                onPress={() => setShowPin(!showPin)}
                            >
                                <Text style={styles.eyeText}>{showPin ? '🙈' : '👁️'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Error Message */}
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    {/* Login Button */}
                    <TouchableOpacity
                        style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={loading ? ['#4b5563', '#374151'] : colors.gradientButton}
                            style={styles.loginBtnGradient}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.loginBtnText}>🔓 Sign In</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <Text style={styles.helpText}>
                        Contact your landlord if you don't have your PIN
                    </Text>
                </View>

                {/* Security badge */}
                <View style={styles.securityBadge}>
                    <Text style={styles.securityText}>🔒 Secured with 256-bit encryption</Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
    },
    bgCircle1: {
        position: 'absolute', top: -120, right: -80,
        width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(79,70,229,0.12)',
    },
    bgCircle2: {
        position: 'absolute', bottom: 100, left: -100,
        width: 250, height: 250, borderRadius: 125,
        backgroundColor: 'rgba(139,92,246,0.08)',
    },
    bgCircle3: {
        position: 'absolute', top: '40%', right: -50,
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(79,70,229,0.06)',
    },
    content: {
        flex: 1, justifyContent: 'center',
        paddingHorizontal: 28, paddingVertical: 20,
    },
    logoContainer: {
        alignItems: 'center', marginBottom: 24,
    },
    logoCircle: {
        width: 72, height: 72, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
        ...shadows.lg,
    },
    logoIcon: { fontSize: 32 },
    appTitle: {
        color: colors.textPrimary, fontSize: 28,
        fontWeight: '900', marginTop: 12, letterSpacing: 3,
    },
    appSubtitle: {
        color: colors.textSecondary, fontSize: 13, marginTop: 4, letterSpacing: 0.5,
    },
    appSubSub: {
        color: colors.accentIndigo, fontSize: 12,
        fontWeight: '700', marginTop: 2, letterSpacing: 1,
    },
    dateTimeRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        marginBottom: 16, paddingHorizontal: 4,
    },
    dateTimeText: {
        color: colors.textMuted, fontSize: 10, fontWeight: '600',
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 24, padding: 28,
        borderWidth: 1, borderColor: colors.borderColor,
    },
    cardHeader: { marginBottom: 20 },
    cardTitle: {
        color: colors.textPrimary, fontSize: 22, fontWeight: '800',
    },
    cardSubtitle: {
        color: colors.textMuted, fontSize: 13, marginTop: 4,
    },
    inputGroup: { marginBottom: 16 },
    label: {
        color: colors.textMuted, fontSize: 10,
        fontWeight: '700', letterSpacing: 1.5, marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.bgInput, borderRadius: 14,
        borderWidth: 1, borderColor: colors.borderColor,
        paddingHorizontal: 16, overflow: 'hidden',
    },
    inputWrapperError: {
        borderColor: colors.accentRed, borderWidth: 1.5,
    },
    phonePrefix: {
        color: colors.textSecondary, fontSize: 14,
        fontWeight: '600', marginRight: 8,
    },
    input: {
        flex: 1, color: colors.textPrimary,
        fontSize: 15, paddingVertical: 14, fontWeight: '600',
    },
    eyeBtn: { padding: 8 },
    eyeText: { fontSize: 16 },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderRadius: 10, padding: 12, marginBottom: 12,
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    },
    errorText: {
        color: colors.accentRed, fontSize: 12, fontWeight: '600',
    },
    loginBtn: {
        borderRadius: 14, overflow: 'hidden',
        marginTop: 4,
    },
    loginBtnDisabled: { opacity: 0.6 },
    loginBtnGradient: {
        height: 52, justifyContent: 'center', alignItems: 'center',
    },
    loginBtnText: {
        color: colors.textPrimary, fontSize: 16,
        fontWeight: '800', letterSpacing: 0.5,
    },
    helpText: {
        color: colors.textMuted, fontSize: 11,
        textAlign: 'center', marginTop: 16,
    },
    securityBadge: {
        alignItems: 'center', marginTop: 20,
    },
    securityText: {
        color: 'rgba(255,255,255,0.15)', fontSize: 10,
        fontWeight: '600', letterSpacing: 0.5,
    },
});
