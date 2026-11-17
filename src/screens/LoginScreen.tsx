import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, Animated, StatusBar, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_VERSION } from '../lib/version';
import {
    loginTenantByPin, loginStaffByPin,
    TenantSession, StaffSession,
} from '../lib/supabase';
import {
    validatePin, isRateLimited, recordFailedAttempt,
    clearRateLimit, saveSession, saveStaffSession,
} from '../lib/security';
import { MobileLicense } from './LicenseScreen';
import { setupNotifications, registerPushToken } from '../lib/notifications';

interface Props {
    onLoginSuccess: (session: TenantSession | StaffSession) => void;
    license?: MobileLicense | null;
}

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: '#1e293b',
    primary: '#6366f1',
    primaryLight: '#a5b4fc',
    primaryDark: '#4f46e5',
    accent: '#10b981',
    neonGreen: '#00e676',
    danger: '#ef4444',
    gold: '#fbbf24',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
    keyBg: 'rgba(255,255,255,0.06)',
    keyBorder: 'rgba(255,255,255,0.1)',
};

const DOT_SIZE = 16;

export default function LoginScreen({ onLoginSuccess, license }: Props) {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [lockoutSeconds, setLockoutSeconds] = useState(0);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;
    const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Floating pulse animation for shield logo
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 2500, useNativeDriver: true }),
            ])
        ).start();
        return () => {
            if (lockoutRef.current) clearInterval(lockoutRef.current);
        };
    }, []);

    // Check rate limiting lockout on mount
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

    // Shake animation for incorrect PIN
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

    // Keypad press handler
    const handleKeyPress = useCallback((key: string) => {
        if (isLoading || lockoutSeconds > 0) return;
        setError('');

        if (key === 'BACK') {
            setPin(p => p.slice(0, -1));
            return;
        }
        if (key === 'CLEAR') {
            setPin('');
            return;
        }
        if (pin.length >= 6) return;

        const newPin = pin + key;
        setPin(newPin);

        if (newPin.length >= 4) {
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.15, duration: 100, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
            ]).start();
        }
    }, [pin, isLoading, lockoutSeconds]);

    // Perform Login
    const handleLogin = useCallback(async (pinToUse?: string) => {
        const targetPin = (pinToUse || pin).trim();
        const validation = validatePin(targetPin);
        if (!validation.valid) {
            setError(validation.error || 'Enter 4-6 digit numeric PIN');
            triggerShake();
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // 1. Staff check first (caretaker / landlord)
            const staff = await loginStaffByPin(targetPin);
            if (staff) {
                await clearRateLimit();
                await saveStaffSession(staff);
                onLoginSuccess(staff);
                return;
            }

            // 2. Tenant login
            const tenant = await loginTenantByPin(targetPin);
            if (tenant) {
                await clearRateLimit();
                await saveSession(tenant);
                // Setup push notifications
                setupNotifications()
                    .then(g => { if (g) registerPushToken(tenant.tenant_id); })
                    .catch(() => {});
                onLoginSuccess(tenant);
                return;
            }

            // Failed login
            const rate = await recordFailedAttempt();
            triggerShake();
            setPin('');

            if (rate.locked) {
                startLockoutCountdown(Math.ceil(rate.lockoutMs / 1000));
            } else {
                setError(`Incorrect PIN. ${rate.attemptsLeft} attempt(s) remaining`);
            }
        } catch (err: any) {
            setError(err?.message || 'Login failed. Please check internet connection.');
            triggerShake();
            setPin('');
        } finally {
            setIsLoading(false);
        }
    }, [pin, onLoginSuccess]);

    // Auto submit on 6 digits or allow submit on 4+
    useEffect(() => {
        if (pin.length === 6 && !isLoading && lockoutSeconds === 0) {
            handleLogin(pin);
        }
    }, [pin, isLoading, lockoutSeconds, handleLogin]);

    const KEYS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['CLEAR', '0', 'BACK'],
    ];

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            <LinearGradient
                colors={['#0a0f1d', '#0d1527', '#080d1a']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Glowing top ambient light */}
            <View style={styles.ambientGlow} />

            <View style={styles.container}>
                {/* ── Brand Logo & Header ── */}
                <View style={styles.header}>
                    <Animated.View
                        style={[
                            styles.logoWrap,
                            {
                                transform: [
                                    {
                                        translateY: floatAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, -6],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <LinearGradient
                            colors={['#4f46e5', '#7c3aed', '#059669']}
                            style={styles.logoGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.logoEmoji}>🛡️</Text>
                        </LinearGradient>
                    </Animated.View>

                    <Text style={styles.brandTitle}>ARMS Portal</Text>
                    <Text style={styles.brandSubtitle}>Alpha Rental Management System</Text>

                    <View style={styles.securityBadge}>
                        <View style={styles.securityDot} />
                        <Text style={styles.securityBadgeText}>Enterprise 256-Bit Encrypted</Text>
                    </View>
                </View>

                {/* ── PIN Display Card ── */}
                <Animated.View
                    style={[
                        styles.pinCard,
                        { transform: [{ translateX: shakeAnim }, { scale: pulseAnim }] },
                    ]}
                >
                    <Text style={styles.pinInstruction}>Enter Your 4-6 Digit Login PIN</Text>

                    {/* 6 Dots Indicator */}
                    <View style={styles.dotsRow}>
                        {[0, 1, 2, 3, 4, 5].map(idx => {
                            const isFilled = pin.length > idx;
                            const isCurrent = pin.length === idx;
                            return (
                                <View
                                    key={idx}
                                    style={[
                                        styles.dot,
                                        isFilled && styles.dotFilled,
                                        isCurrent && styles.dotCurrent,
                                    ]}
                                >
                                    {isFilled && <View style={styles.dotInner} />}
                                </View>
                            );
                        })}
                    </View>

                    {/* Error Message */}
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : (
                        <View style={styles.spacer} />
                    )}

                    {/* Submit button when 4 or 5 digits entered */}
                    {pin.length >= 4 && pin.length < 6 && (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => handleLogin()}
                            disabled={isLoading}
                            style={styles.submitBtn}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={styles.submitGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {isLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.submitText}>Continue with {pin.length} Digits →</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </Animated.View>

                {/* ── Numeric Keypad ── */}
                <View style={styles.keypad}>
                    {KEYS.map((row, rIdx) => (
                        <View key={rIdx} style={styles.keyRow}>
                            {row.map(k => {
                                const isAction = k === 'CLEAR' || k === 'BACK';
                                return (
                                    <TouchableOpacity
                                        key={k}
                                        activeOpacity={0.65}
                                        onPress={() => handleKeyPress(k)}
                                        disabled={isLoading || lockoutSeconds > 0}
                                        style={[
                                            styles.keyBtn,
                                            isAction && styles.keyBtnAction,
                                        ]}
                                    >
                                        {k === 'BACK' ? (
                                            <Text style={styles.keyBackIcon}>⌫</Text>
                                        ) : k === 'CLEAR' ? (
                                            <Text style={styles.keyClearText}>CLEAR</Text>
                                        ) : (
                                            <Text style={styles.keyDigitText}>{k}</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* ── Footer ── */}
                <View style={styles.footer}>
                    <Text style={styles.footerHelp}>
                        Forgot PIN or need help? Call <Text style={styles.footerPhone}>0720316175</Text>
                    </Text>
                    <Text style={styles.footerVersion}>ARMS Tenant App {APP_VERSION}</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    ambientGlow: {
        position: 'absolute',
        top: -100,
        left: '20%',
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(99,102,241,0.12)',
    },
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 48,
        paddingBottom: 20,
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
    },
    logoWrap: {
        marginBottom: 12,
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },
    logoGradient: {
        width: 64,
        height: 64,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    logoEmoji: {
        fontSize: 30,
    },
    brandTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: -0.5,
    },
    brandSubtitle: {
        fontSize: 12,
        color: COLORS.textSub,
        fontWeight: '600',
        marginTop: 2,
    },
    securityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(16,185,129,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.25)',
        marginTop: 10,
    },
    securityDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.neonGreen,
    },
    securityBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#a7f3d0',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // PIN Display
    pinCard: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        paddingVertical: 18,
        paddingHorizontal: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    pinInstruction: {
        fontSize: 13,
        fontWeight: '700',
        color: COLORS.textSub,
        marginBottom: 14,
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
        justifyContent: 'center',
        height: 28,
    },
    dot: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        borderWidth: 1.5,
        borderColor: '#334155',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotFilled: {
        borderColor: COLORS.neonGreen,
        backgroundColor: 'rgba(0,230,118,0.2)',
    },
    dotCurrent: {
        borderColor: COLORS.primaryLight,
        transform: [{ scale: 1.15 }],
    },
    dotInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.neonGreen,
    },
    errorBox: {
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 5,
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    errorText: {
        color: '#f87171',
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
    },
    spacer: {
        height: 18,
    },
    submitBtn: {
        marginTop: 10,
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
    },
    submitGrad: {
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '900',
    },

    // Keypad
    keypad: {
        width: '100%',
        maxWidth: 320,
        alignSelf: 'center',
        gap: 10,
    },
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    keyBtn: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        backgroundColor: COLORS.keyBg,
        borderWidth: 1,
        borderColor: COLORS.keyBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyBtnAction: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.06)',
    },
    keyDigitText: {
        fontSize: 22,
        fontWeight: '900',
        color: '#ffffff',
    },
    keyBackIcon: {
        fontSize: 20,
        color: COLORS.textSub,
        fontWeight: '900',
    },
    keyClearText: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.5,
    },

    // Footer
    footer: {
        alignItems: 'center',
        gap: 4,
    },
    footerHelp: {
        fontSize: 11,
        color: COLORS.textDim,
    },
    footerPhone: {
        color: COLORS.primaryLight,
        fontWeight: '800',
    },
    footerVersion: {
        fontSize: 10,
        color: COLORS.textDim,
        fontWeight: '600',
    },
});
