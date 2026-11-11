import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, Animated, Alert,
    StatusBar, Image, Dimensions, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    loginTenantByPin, loginStaffByPin, checkTenantLicense,
    getPendingAgreement, TenantSession, StaffSession,
} from '../lib/supabase';
import {
    validatePin, isRateLimited, recordFailedAttempt,
    clearRateLimit, saveSession, saveStaffSession,
} from '../lib/security';
import { MobileLicense } from './LicenseScreen';
import { setupNotifications, registerPushToken } from '../lib/notifications';
import { APP_VERSION } from '../lib/version';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    onLoginSuccess: (session: TenantSession | StaffSession) => void;
    license?: MobileLicense | null;
}

const ASSETS = {
    bgFull: require('../../assets/login/login_bg_full.png'),
    shieldBadge: require('../../assets/login/shield_lock_badge.png'),
    keyFingerprint: require('../../assets/login/key_fingerprint.png'),
    keyBackspace: require('../../assets/login/key_backspace.png'),
    btnArrow: require('../../assets/login/btn_arrow.png'),
};

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
    const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Check lockout on mount ─────────────────────────────
    useEffect(() => {
        checkLockout();
        return () => {
            if (lockoutRef.current) clearInterval(lockoutRef.current);
        };
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

    // ── Shake animation on error ───────────────────────────
    const triggerShake = () => {
        shakeAnim.setValue(0);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    // ── Keypad press handler ───────────────────────────────
    const handleKeyPress = useCallback((key: string) => {
        if (isLoading || lockoutSeconds > 0) return;
        setError('');

        if (key === 'delete') {
            setPin(p => p.slice(0, -1));
            return;
        }

        if (key === 'fingerprint') {
            Alert.alert(
                'Biometric PIN',
                'Please enter your 4-6 digit assigned PIN to log into your account securely.',
                [{ text: 'OK' }]
            );
            return;
        }

        if (pin.length >= 6) return;
        const newPin = pin + key;
        setPin(newPin);

        Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 80, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();
    }, [pin, isLoading, lockoutSeconds]);

    const handleDelete = useCallback(() => {
        if (isLoading || lockoutSeconds > 0) return;
        setPin(p => p.slice(0, -1));
        setError('');
    }, [isLoading, lockoutSeconds]);

    // ── Login authentication ───────────────────────────────
    const handleLogin = useCallback(async () => {
        if (isLoading || lockoutSeconds > 0) return;

        const { limited, secondsLeft } = await isRateLimited();
        if (limited) {
            startLockoutCountdown(secondsLeft);
            return;
        }

        const { valid, error: pinErr } = validatePin(pin);
        if (!valid) {
            setError(pinErr || 'Enter a valid PIN');
            triggerShake();
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Step 1: Try tenant login
            const tenant = await loginTenantByPin(pin);
            if (tenant) {
                await clearRateLimit();
                await saveSession(tenant);

                // Register push notification token
                setupNotifications()
                    .then(() => registerPushToken(tenant.tenant_id))
                    .catch(() => {});

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
                        // Check pending agreement in background
                        getPendingAgreement(tenant.tenant_id).then(pending => {
                            if (pending) {
                                import('@react-native-async-storage/async-storage').then(({ default: AS }) => {
                                    AS.setItem('pending_agreement', JSON.stringify(pending));
                                });
                            }
                        }).catch(() => {});
                    }
                } catch {
                    onLoginSuccess(tenant); // fail-open
                } finally {
                    setCheckingLicense(false);
                }
                return;
            }

            // Step 2: Try staff login (caretaker / landlord)
            const staff = await loginStaffByPin(pin);
            if (staff) {
                await clearRateLimit();
                await saveStaffSession(staff);
                setIsLoading(false);
                onLoginSuccess(staff);
                return;
            }

            // Step 3: No match
            triggerShake();
            const { locked, attemptsLeft, lockoutMs } = await recordFailedAttempt();
            if (locked) {
                startLockoutCountdown(Math.ceil(lockoutMs / 1000));
            } else {
                setError(
                    attemptsLeft > 0
                        ? `Incorrect PIN — ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} left`
                        : 'Incorrect PIN'
                );
            }
            setPin('');
        } catch (err: any) {
            setError('Connection error. Please try again.');
            triggerShake();
            setPin('');
        } finally {
            setIsLoading(false);
        }
    }, [pin, isLoading, lockoutSeconds, onLoginSuccess]);

    const KEYS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['fingerprint', '0', 'delete'],
    ];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* ════ Full Screen Luxury Villa & Silk Wave Backdrop ════ */}
            <Image
                source={ASSETS.bgFull}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
            />

            {/* ════ License Gate Modal (If Revoked) ════ */}
            {licenseRevoked && (
                <View style={styles.gateContainer}>
                    <LinearGradient colors={['#1e1b4b', '#312e81', '#1e1b4b']} style={StyleSheet.absoluteFillObject} />
                    <View style={styles.gateContent}>
                        <Text style={{ fontSize: 44, marginBottom: 12 }}>🔒</Text>
                        <Text style={styles.gateTitle}>Access Revoked</Text>
                        <Text style={styles.gateMessage}>
                            Your account access has been revoked.{'\n'}Please contact property management.
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

            {/* ════ Verifying Access Overlay ════ */}
            {checkingLicense && !licenseRevoked && (
                <View style={styles.gateContainer}>
                    <LinearGradient colors={['rgba(2,44,34,0.95)', 'rgba(4,120,87,0.95)']} style={StyleSheet.absoluteFillObject} />
                    <View style={{ alignItems: 'center', gap: 16 }}>
                        <ActivityIndicator color="#00E676" size="large" />
                        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
                            Verifying secure account access…
                        </Text>
                    </View>
                </View>
            )}

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
                {/* Top spacer to align nicely over the background header */}
                <View style={{ height: (StatusBar.currentHeight || 36) + 160 }} />

                {/* ══════════════════════════════════════════════════════
                    CENTRAL FLOATING FROSTED GLASS LOGIN CARD
                ══════════════════════════════════════════════════════ */}
                <Animated.View
                    style={[
                        styles.glassCard,
                        {
                            transform: [
                                { translateX: shakeAnim },
                                { scale: pulseAnim },
                            ],
                        },
                    ]}
                >
                    {/* Glowing Shield Padlock Badge on Top Rim */}
                    <Image
                        source={ASSETS.shieldBadge}
                        style={styles.shieldBadge}
                        resizeMode="contain"
                    />

                    {/* Card Title & Subtitle */}
                    <Text style={styles.cardTitle}>Secure Login</Text>
                    <Text style={styles.cardSubtitle}>Enter your PIN to access your account</Text>

                    {/* PIN Indicator Dots (6 Circles) */}
                    <View style={styles.pinDotsRow}>
                        {Array.from({ length: 6 }).map((_, i) => {
                            const isFilled = i < pin.length;
                            const isLatest = i === pin.length - 1;
                            return (
                                <View
                                    key={i}
                                    style={[
                                        styles.dot,
                                        isFilled ? styles.dotFilled : styles.dotEmpty,
                                        isLatest && styles.dotLatest,
                                    ]}
                                >
                                    {isFilled && <View style={styles.dotInnerGlow} />}
                                </View>
                            );
                        })}
                    </View>

                    {/* Error message */}
                    {error ? (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    {/* Keypad Grid (4 Rows x 3 Columns) */}
                    <View style={styles.keypadGrid}>
                        {KEYS.map((row, ri) => (
                            <View key={ri} style={styles.keyRow}>
                                {row.map((key, ki) => {
                                    if (key === 'fingerprint') {
                                        return (
                                            <TouchableOpacity
                                                key={ki}
                                                style={styles.keyBtn}
                                                activeOpacity={0.7}
                                                onPress={() => handleKeyPress('fingerprint')}
                                                disabled={isLoading || lockoutSeconds > 0}
                                            >
                                                <Image
                                                    source={ASSETS.keyFingerprint}
                                                    style={styles.keyIconImg}
                                                    resizeMode="contain"
                                                />
                                            </TouchableOpacity>
                                        );
                                    }

                                    if (key === 'delete') {
                                        return (
                                            <TouchableOpacity
                                                key={ki}
                                                style={styles.keyBtn}
                                                activeOpacity={0.7}
                                                onPress={handleDelete}
                                                disabled={isLoading || lockoutSeconds > 0}
                                            >
                                                <Image
                                                    source={ASSETS.keyBackspace}
                                                    style={styles.keyIconImg}
                                                    resizeMode="contain"
                                                />
                                            </TouchableOpacity>
                                        );
                                    }

                                    return (
                                        <TouchableOpacity
                                            key={ki}
                                            style={styles.keyBtn}
                                            activeOpacity={0.75}
                                            onPress={() => handleKeyPress(key)}
                                            disabled={isLoading || lockoutSeconds > 0}
                                        >
                                            <Text style={styles.keyNumberText}>{key}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}
                    </View>

                    {/* "Login to Portal" Glowing Action Button */}
                    <TouchableOpacity
                        style={[
                            styles.loginPortalBtn,
                            (pin.length < 4 || isLoading || lockoutSeconds > 0) && styles.loginBtnDisabled,
                        ]}
                        activeOpacity={0.85}
                        onPress={handleLogin}
                        disabled={pin.length < 4 || isLoading || lockoutSeconds > 0}
                    >
                        <LinearGradient
                            colors={
                                pin.length >= 4 && lockoutSeconds === 0
                                    ? ['#00C853', '#00E676', '#047857']
                                    : ['#64748b', '#475569']
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.loginBtnGrad}
                        >
                            {isLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <ActivityIndicator color="#fff" size="small" />
                                    <Text style={styles.loginBtnText}>Verifying…</Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.loginPortalIcon}>➔]</Text>
                                    <Text style={styles.loginBtnText}>Login to Portal</Text>
                                    <Image
                                        source={ASSETS.btnArrow}
                                        style={styles.btnArrowImg}
                                        resizeMode="contain"
                                    />
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Trust & Support Strip */}
                    <View style={styles.trustStrip}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Text style={{ fontSize: 12 }}>🛡️</Text>
                            <Text style={styles.trustText}>Secure & Encrypted</Text>
                        </View>
                        <Text style={styles.trustDivider}>|</Text>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                Alert.alert(
                                    'ARMS Support',
                                    'Contact Property Management:\n📞 Phone: 0720316175\n📧 Email: info@arms.co.ke',
                                    [{ text: 'OK' }]
                                );
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Text style={{ fontSize: 12 }}>🎧</Text>
                                <Text style={styles.trustText}>Need Help? Contact Support</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* Bottom App Version */}
                <Text style={styles.versionText}>
                    ARMS Mobile {APP_VERSION} • Developed by Jimhawkins Korir
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#022c22',
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 24,
    },

    // ── Floating Glass Card ──
    glassCard: {
        width: Math.min(SCREEN_WIDTH * 0.92, 380),
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        borderRadius: 36,
        paddingTop: 42,
        paddingHorizontal: 16,
        paddingBottom: 20,
        position: 'relative',
        borderWidth: 1.5,
        borderColor: 'rgba(52, 211, 153, 0.5)',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 16,
    },
    shieldBadge: {
        position: 'absolute',
        top: -38,
        alignSelf: 'center',
        width: 76,
        height: 76,
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#0f172a',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    cardSubtitle: {
        fontSize: 12.5,
        fontWeight: '600',
        color: '#64748b',
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 16,
    },

    // ── PIN Dots Indicator ──
    pinDotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    dot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotEmpty: {
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderWidth: 2,
        borderColor: '#94a3b8',
    },
    dotFilled: {
        backgroundColor: '#00E676',
        borderWidth: 2,
        borderColor: '#ffffff',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        elevation: 6,
    },
    dotLatest: {
        transform: [{ scale: 1.15 }],
    },
    dotInnerGlow: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ffffff',
    },

    // ── Error Banner ──
    errorBanner: {
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fca5a5',
        borderRadius: 12,
        paddingVertical: 6,
        paddingHorizontal: 10,
        marginBottom: 10,
        alignItems: 'center',
    },
    errorText: {
        color: '#b91c1c',
        fontSize: 11.5,
        fontWeight: '700',
    },

    // ── Keypad Grid ──
    keypadGrid: {
        marginBottom: 12,
    },
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    keyBtn: {
        flex: 1,
        height: 52,
        marginHorizontal: 4,
        borderRadius: 18,
        backgroundColor: '#ffffff',
        borderWidth: 1.2,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
    },
    keyNumberText: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0f172a',
    },
    keyIconImg: {
        width: 26,
        height: 26,
    },

    // ── Login Button ──
    loginPortalBtn: {
        borderRadius: 27,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 8,
    },
    loginBtnDisabled: {
        opacity: 0.7,
        shadowOpacity: 0.1,
    },
    loginBtnGrad: {
        height: 54,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    loginPortalIcon: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: '900',
    },
    loginBtnText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    btnArrowImg: {
        width: 32,
        height: 32,
    },

    // ── Trust & Support Strip ──
    trustStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(2, 44, 34, 0.08)',
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        gap: 8,
    },
    trustText: {
        fontSize: 9.5,
        color: '#065f46',
        fontWeight: '700',
    },
    trustDivider: {
        color: '#cbd5e1',
        fontSize: 11,
    },

    // ── Version text ──
    versionText: {
        marginTop: 14,
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.65)',
        fontWeight: '600',
    },

    // ── License Gate & Overlays ──
    gateContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 999,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    gateContent: {
        backgroundColor: '#1e293b',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#475569',
        width: '100%',
        maxWidth: 340,
    },
    gateTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: '#f87171',
        marginBottom: 8,
    },
    gateMessage: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    gateReasonBox: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        borderRadius: 12,
        padding: 12,
        width: '100%',
        marginBottom: 16,
    },
    gateReasonLabel: {
        fontSize: 10,
        color: '#f87171',
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    gateReasonText: {
        fontSize: 12,
        color: '#fecdd3',
        fontWeight: '600',
    },
    gateBackBtn: {
        backgroundColor: '#3b82f6',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 14,
    },
    gateBackText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '800',
    },
});
