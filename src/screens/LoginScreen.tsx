import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, Animated, Alert,
    StatusBar, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { loginTenantByPin, checkTenantLicense, TenantSession } from '../lib/supabase';
import {
    validatePin, isRateLimited, recordFailedAttempt,
    clearRateLimit, saveSession,
} from '../lib/security';
import { MobileLicense } from './LicenseScreen';

interface Props {
    onLoginSuccess: (tenant: TenantSession) => void;
    license?: MobileLicense | null;
}

const COLORS = {
    bg1: '#0f172a', bg2: '#1e1b4b', bg3: '#0c1a2e',
    primary: '#6366f1', primaryDark: '#4f46e5', primaryLight: '#818cf8',
    accent: '#10b981', accentDark: '#059669',
    danger: '#ef4444',
    gold: '#f59e0b',
    text: '#f8fafc', textMuted: '#94a3b8', textDim: '#64748b',
    card: 'rgba(255,255,255,0.05)', cardBorder: 'rgba(255,255,255,0.1)',
    keyBg: 'rgba(255,255,255,0.07)', keyBgActive: 'rgba(99,102,241,0.3)',
};

const DOT_SIZE = 18;

export default function LoginScreen({ onLoginSuccess, license }: Props) {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const [checkingLicense, setCheckingLicense] = useState(false);
    const [licenseRevoked, setLicenseRevoked] = useState(false);
    const [revokeReason, setRevokeReason] = useState<string | undefined>(undefined);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;
    const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Floating animation ───────────────────────────────────
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 3000, useNativeDriver: true }),
            ])
        ).start();
        return () => { if (lockoutRef.current) clearInterval(lockoutRef.current); };
    }, []);

    // ── Check lockout on mount ───────────────────────────────
    useEffect(() => {
        checkLockout();
    }, []);

    const checkLockout = async () => {
        const { limited, secondsLeft } = await isRateLimited();
        if (limited) startLockoutCountdown(secondsLeft);
    };

    const startLockoutCountdown = (seconds: number) => {
        setLockoutSeconds(seconds);
        setError(`Too many attempts. Wait ${seconds}s`);
        if (lockoutRef.current) clearInterval(lockoutRef.current);
        lockoutRef.current = setInterval(() => {
            setLockoutSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(lockoutRef.current!);
                    setError('');
                    clearRateLimit();
                    return 0;
                }
                const next = prev - 1;
                setError(`Too many attempts. Wait ${next}s`);
                return next;
            });
        }, 1000);
    };

    // ── Shake animation for wrong PIN ────────────────────────
    const triggerShake = () => {
        shakeAnim.setValue(0);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    // ── PIN keypad press ─────────────────────────────────────
    const handleKeyPress = useCallback((key: string) => {
        if (isLoading || lockoutSeconds > 0) return;
        setError('');
        if (key === '⌫') {
            setPin(p => p.slice(0, -1));
            return;
        }
        if (pin.length >= 6) return;
        const newPin = pin + key;
        setPin(newPin);

        // Auto-submit when 4-6 digits entered and user presses any key at max len
        if (newPin.length >= 4) {
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.1, duration: 100, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
            ]).start();
        }
    }, [pin, isLoading, lockoutSeconds]);

    const handleDelete = useCallback(() => {
        if (isLoading || lockoutSeconds > 0) return;
        setPin(p => p.slice(0, -1));
        setError('');
    }, [isLoading, lockoutSeconds]);

    const handleLogin = useCallback(async () => {
        if (isLoading || lockoutSeconds > 0) return;

        // Check rate limit
        const { limited, secondsLeft } = await isRateLimited();
        if (limited) { startLockoutCountdown(secondsLeft); return; }

        const { valid, error: pinErr } = validatePin(pin);
        if (!valid) { setError(pinErr || 'Invalid PIN'); triggerShake(); return; }

        setIsLoading(true);
        setError('');

        try {
            const tenant = await loginTenantByPin(pin);
            if (tenant) {
                await clearRateLimit();
                await saveSession(tenant);

                // ── License check after successful PIN auth ──
                setIsLoading(false);
                setCheckingLicense(true);
                try {
                    const licenseResult = await checkTenantLicense(
                        tenant.tenant_id,
                        tenant.phone || ''
                    );
                    if (!licenseResult.licensed) {
                        setLicenseRevoked(true);
                        setRevokeReason(licenseResult.reason);
                    } else {
                        onLoginSuccess(tenant);
                    }
                } catch {
                    // Fail-open: license check error → allow login
                    onLoginSuccess(tenant);
                } finally {
                    setCheckingLicense(false);
                }
                return; // prevent finally from setting isLoading again
            } else {
                triggerShake();
                const { locked, attemptsLeft, lockoutMs } = await recordFailedAttempt();
                if (locked) {
                    startLockoutCountdown(Math.ceil(lockoutMs / 1000));
                } else {
                    setError(attemptsLeft > 0
                        ? `Incorrect PIN — ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} left`
                        : 'Incorrect PIN'
                    );
                }
                setPin('');
            }
        } catch (err: any) {
            setError('Connection error. Please try again.');
            triggerShake();
            setPin('');
        } finally {
            setIsLoading(false);
        }
    }, [pin, isLoading, lockoutSeconds]);

    const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

    const KEYS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['', '0', '⌫'],
    ];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg1} />
            <LinearGradient
                colors={[COLORS.bg1, COLORS.bg2, COLORS.bg3]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* License Gate — shown when access is revoked */}
            {licenseRevoked && (
                <View style={styles.gateContainer}>
                    <LinearGradient colors={['#1e1b4b', '#312e81', '#1e1b4b']} style={StyleSheet.absoluteFillObject} />
                    <View style={styles.gateContent}>
                        <View style={styles.gateIconWrap}>
                            <Text style={{ fontSize: 40 }}>🔒</Text>
                        </View>
                        <Text style={styles.gateTitle}>Access Revoked</Text>
                        <Text style={styles.gateMessage}>
                            Your access has been revoked.{'\n'}Please contact your landlord.
                        </Text>
                        {revokeReason ? (
                            <View style={styles.gateReasonBox}>
                                <Text style={styles.gateReasonLabel}>Reason:</Text>
                                <Text style={styles.gateReasonText}>{revokeReason}</Text>
                            </View>
                        ) : null}
                        <TouchableOpacity
                            style={styles.gateBackBtn}
                            onPress={() => { setLicenseRevoked(false); setRevokeReason(undefined); setPin(''); }}
                        >
                            <Text style={styles.gateBackText}>← Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* License checking overlay */}
            {checkingLicense && !licenseRevoked && (
                <View style={styles.gateContainer}>
                    <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />
                    <View style={{ alignItems: 'center', gap: 16 }}>
                        <ActivityIndicator color="#6366f1" size="large" />
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' }}>
                            Verifying access...
                        </Text>
                    </View>
                </View>
            )}

            {/* Decorative glows */}
            <View style={styles.glow1} />
            <View style={styles.glow2} />

            {/* Floating icons */}
            <Animated.Text style={[styles.floatIcon, styles.fi1, { transform: [{ translateY: floatY }] }]}>🏠</Animated.Text>
            <Animated.Text style={[styles.floatIcon, styles.fi2, { transform: [{ translateY: floatY }] }]}>🔐</Animated.Text>
            <Animated.Text style={[styles.floatIcon, styles.fi3, { transform: [{ translateY: floatY }] }]}>💳</Animated.Text>

            <SafeAreaView style={styles.safe}>
                {/* Logo + Title */}
                <View style={styles.header}>
                    <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatY }] }]}>
                        <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.logoGrad}>
                            <Text style={styles.logoEmoji}>🏢</Text>
                        </LinearGradient>
                        <View style={styles.logoBadge}>
                            <Text style={styles.logoBadgeText}>ARMS</Text>
                        </View>
                    </Animated.View>
                    <Text style={styles.title}>Tenant Portal</Text>
                    <Text style={styles.subtitle}>Alpha Rental Management</Text>
                    {license?.clientName ? (
                        <View style={styles.licensedBadge}>
                            <Text style={styles.licensedText}>Licensed to: </Text>
                            <Text style={styles.licensedName}>{license.clientName}</Text>
                        </View>
                    ) : null}
                    <View style={styles.secBadge}>
                        <Text style={styles.secIcon}>🔒</Text>
                        <Text style={styles.secText}>Secure PIN Login</Text>
                    </View>
                </View>

                {/* PIN Dots */}
                <Animated.View style={[styles.pinArea, { transform: [{ translateX: shakeAnim }, { scale: pulseAnim }] }]}>
                    <Text style={styles.pinLabel}>Enter Your PIN</Text>
                    <View style={styles.dotRow}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    i < pin.length ? styles.dotFilled : styles.dotEmpty,
                                    i === pin.length - 1 && styles.dotActive,
                                ]}
                            />
                        ))}
                    </View>

                    {/* Error / Lockout message */}
                    {error ? (
                        <View style={styles.errorRow}>
                            <Text style={styles.errorIcon}>⚠️</Text>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : (
                        <Text style={styles.pinHint}>
                            {pin.length === 0 ? 'Ask your landlord for your PIN' : `${pin.length} digit${pin.length !== 1 ? 's' : ''} entered`}
                        </Text>
                    )}
                </Animated.View>

                {/* Keypad */}
                <View style={styles.keypad}>
                    {KEYS.map((row, ri) => (
                        <View key={ri} style={styles.keyRow}>
                            {row.map((key, ki) => (
                                <TouchableOpacity
                                    key={ki}
                                    style={[
                                        styles.key,
                                        key === '' && styles.keyEmpty,
                                        key === '⌫' && styles.keyBack,
                                        lockoutSeconds > 0 && styles.keyDisabled,
                                    ]}
                                    onPress={() => key === '⌫' ? handleDelete() : key !== '' ? handleKeyPress(key) : undefined}
                                    disabled={key === '' || isLoading || lockoutSeconds > 0}
                                    activeOpacity={0.7}
                                >
                                    {key === '⌫' ? (
                                        <Text style={styles.keyBackText}>⌫</Text>
                                    ) : key !== '' ? (
                                        <Text style={[styles.keyText, lockoutSeconds > 0 && styles.keyTextDisabled]}>{key}</Text>
                                    ) : null}
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                </View>

                {/* Login Button */}
                <TouchableOpacity
                    style={[styles.loginBtn, (pin.length < 4 || isLoading || lockoutSeconds > 0) && styles.loginBtnDisabled]}
                    onPress={handleLogin}
                    disabled={pin.length < 4 || isLoading || lockoutSeconds > 0}
                    activeOpacity={0.85}
                >
                    <LinearGradient
                        colors={pin.length >= 4 && lockoutSeconds === 0 ? [COLORS.accent, COLORS.accentDark] : ['#374151', '#1f2937']}
                        style={styles.loginBtnGrad}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                        {isLoading ? (
                            <>
                                <ActivityIndicator color="#fff" size="small" />
                                <Text style={styles.loginBtnText}> Verifying…</Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.loginBtnEmoji}>🚀</Text>
                                <Text style={styles.loginBtnText}>Login to Portal</Text>
                                <Text style={styles.loginBtnArrow}>→</Text>
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.footerDivider}>
                        <View style={styles.divLine} />
                        <Text style={styles.divText}>Powered by</Text>
                        <View style={styles.divLine} />
                    </View>
                    <Text style={styles.footerTitle}>💎 Alpha Solutions</Text>
                    <Text style={styles.footerSub}>Developed by Jimhawkins Korir · 0720316175</Text>
                    <Text style={styles.version}>ARMS Tenant App v1.0 • {new Date().getFullYear()}</Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg1 },
    safe: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
    // License Gate styles
    gateContainer: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 100, justifyContent: 'center', alignItems: 'center',
    },
    gateContent: { alignItems: 'center', paddingHorizontal: 32 },
    gateIconWrap: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderWidth: 2, borderColor: 'rgba(239,68,68,0.3)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    gateTitle: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
    gateMessage: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
    gateReasonBox: {
        backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 14, marginBottom: 24,
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', width: '100%',
    },
    gateReasonLabel: { color: 'rgba(239,68,68,0.8)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    gateReasonText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18 },
    gateBackBtn: { paddingVertical: 12, paddingHorizontal: 24 },
    gateBackText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
    glow1: {
        position: 'absolute', top: -80, left: -80,
        width: 250, height: 250, borderRadius: 125,
        backgroundColor: 'rgba(99,102,241,0.15)',
    },
    glow2: {
        position: 'absolute', bottom: -100, right: -80,
        width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(16,185,129,0.1)',
    },
    floatIcon: { position: 'absolute', fontSize: 28, opacity: 0.12 },
    fi1: { top: 100, left: '8%' },
    fi2: { top: 180, right: '10%' },
    fi3: { bottom: 240, left: '15%' },

    // Header
    header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
    logoWrap: { alignItems: 'center', marginBottom: 14 },
    logoGrad: {
        width: 72, height: 72, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
    },
    logoEmoji: { fontSize: 34 },
    logoBadge: {
        marginTop: -10, backgroundColor: COLORS.gold,
        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
        shadowColor: COLORS.gold, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6,
    },
    logoBadgeText: { color: '#1f2937', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
    title: { fontSize: 26, fontWeight: '900', color: COLORS.text, letterSpacing: 0.5, marginBottom: 4 },
    subtitle: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500', marginBottom: 10 },
    secBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 5,
        borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    },
    secIcon: { fontSize: 12 },
    secText: { fontSize: 11, color: COLORS.accent, fontWeight: '700' },

    // PIN Area
    pinArea: { alignItems: 'center', marginBottom: 28 },
    pinLabel: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600', marginBottom: 16, letterSpacing: 1 },
    dotRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
    dot: {
        width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
        borderWidth: 2,
    },
    dotEmpty: { borderColor: COLORS.textDim, backgroundColor: 'transparent' },
    dotFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
    dotActive: {
        borderColor: COLORS.primaryLight, backgroundColor: COLORS.primaryLight,
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6,
    },
    pinHint: { fontSize: 12, color: COLORS.textDim, textAlign: 'center' },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    errorIcon: { fontSize: 14 },
    errorText: { fontSize: 12, color: COLORS.danger, fontWeight: '600', textAlign: 'center' },

    // Keypad
    keypad: { width: '100%', maxWidth: 300, gap: 12, marginBottom: 24 },
    keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
    key: {
        width: 80, height: 68, borderRadius: 20,
        backgroundColor: COLORS.keyBg,
        borderWidth: 1, borderColor: COLORS.cardBorder,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
    },
    keyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent', elevation: 0 },
    keyBack: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderColor: 'rgba(239,68,68,0.2)',
    },
    keyDisabled: { opacity: 0.3 },
    keyText: { fontSize: 24, fontWeight: '700', color: COLORS.text },
    keyTextDisabled: { color: COLORS.textDim },
    keyBackText: { fontSize: 22, color: COLORS.danger },

    // Login Button
    loginBtn: { width: '100%', maxWidth: 300, borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
    loginBtnDisabled: { opacity: 0.5 },
    loginBtnGrad: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, paddingHorizontal: 24, gap: 8,
    },
    loginBtnEmoji: { fontSize: 18 },
    loginBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    loginBtnArrow: { fontSize: 18, color: '#fff', fontWeight: '700' },

    // Footer
    footer: { alignItems: 'center', paddingBottom: 24, gap: 4 },
    footerDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    divLine: { width: 30, height: 1, backgroundColor: COLORS.textDim },
    divText: { fontSize: 10, color: COLORS.textDim, fontWeight: '500' },
    footerTitle: { fontSize: 13, color: COLORS.textMuted, fontWeight: '700' },
    footerSub: { fontSize: 10, color: COLORS.textDim },
    version: { fontSize: 10, color: COLORS.textDim, marginTop: 4 },
    licensedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 2 },
    licensedText: { fontSize: 10, color: COLORS.textDim, fontWeight: '500' },
    licensedName: { fontSize: 10, color: COLORS.gold, fontWeight: '800' },
});
