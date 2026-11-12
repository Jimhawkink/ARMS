import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, Animated, Alert,
    StatusBar, ImageBackground, Dimensions, SafeAreaView,
} from 'react-native';
import {
    loginTenantByPin, loginStaffByPin, checkTenantLicense,
    getPendingAgreement, getBusinessInfo, BusinessInfo, TenantSession, StaffSession,
} from '../lib/supabase';
import {
    validatePin, isRateLimited, recordFailedAttempt,
    clearRateLimit, saveSession, saveStaffSession,
} from '../lib/security';
import { MobileLicense } from './LicenseScreen';
import { setupNotifications, registerPushToken } from '../lib/notifications';
import { APP_VERSION } from '../lib/version';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
    onLoginSuccess: (session: TenantSession | StaffSession) => void;
    license?: MobileLicense | null;
}

const ASSETS = {
    loginBg: require('../../assets/login/login_bg_final.png'),
};

export default function LoginScreen({ onLoginSuccess, license }: Props) {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const [checkingLicense, setCheckingLicense] = useState(false);
    const [licenseRevoked, setLicenseRevoked] = useState(false);
    const [revokeReason, setRevokeReason] = useState<string | undefined>(undefined);
    const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
        companyName: 'Alpha Rental Management',
        phone: '0720316175',
        email: 'info@arms.com',
    });

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Load business name from database on mount ──────────
    useEffect(() => {
        getBusinessInfo().then(info => {
            if (info && info.companyName) setBusinessInfo(info);
        }).catch(() => {});
    }, []);

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

    // ── Keypad press handler (pure native, NO bounce animations) ───────────
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
                `Please enter your assigned 4-6 digit PIN to log into your account securely.\nNeed help? Call ${businessInfo.phone}`,
                [{ text: 'OK' }]
            );
            return;
        }

        if (pin.length >= 6) return;
        setPin(prev => prev + key);
    }, [pin, isLoading, lockoutSeconds, businessInfo.phone]);

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
                        getPendingAgreement(tenant.tenant_id).then(pending => {
                            if (pending) {
                                import('@react-native-async-storage/async-storage').then(({ default: AS }) => {
                                    AS.setItem('pending_agreement', JSON.stringify(pending));
                                });
                            }
                        }).catch(() => {});
                    }
                } catch {
                    onLoginSuccess(tenant);
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

    const displayCompanyName = license?.clientName || businessInfo.companyName;

    // Split brand name gracefully without cutoff
    const formatBrandLines = (name: string) => {
        const clean = name.trim();
        const words = clean.split(/\s+/);
        if (words.length <= 1) {
            return { line1: clean.toUpperCase(), line2: '' };
        }
        if (words.length === 2) {
            return { line1: words[0].toUpperCase(), line2: words[1].toUpperCase() };
        }
        const mid = Math.ceil(words.length / 2);
        return {
            line1: words.slice(0, mid).join(' ').toUpperCase(),
            line2: words.slice(mid).join(' ').toUpperCase(),
        };
    };

    const { line1: brandLine1, line2: brandLine2 } = formatBrandLines(displayCompanyName);

    return (
        <ImageBackground source={ASSETS.loginBg} style={styles.bgImage} resizeMode="cover">
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* ════ License Gate Modal (If Revoked) ════ */}
            {licenseRevoked && (
                <View style={styles.gateContainer}>
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
                    <View style={{ alignItems: 'center', gap: 16 }}>
                        <ActivityIndicator color="#00E676" size="large" />
                        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
                            Verifying secure account access…
                        </Text>
                    </View>
                </View>
            )}

            <SafeAreaView style={styles.safeArea}>
                {/* ════ 1. TOP BRAND HEADER (Dynamic Landlord / Company Name) ════ */}
                <View style={styles.topBrandHeader}>
                    <View style={styles.brandTextCol}>
                        <Text style={styles.brandTitleLine1} numberOfLines={1} adjustsFontSizeToFit>
                            {brandLine1}
                        </Text>
                        {brandLine2 ? (
                            <Text style={styles.brandTitleLine2} numberOfLines={1} adjustsFontSizeToFit>
                                {brandLine2}
                            </Text>
                        ) : null}
                    </View>
                </View>

                {/* ════ 2. INTERACTIVE CARD OVERLAY LAYER ════ */}
                <Animated.View
                    style={[
                        styles.interactiveCardArea,
                        { transform: [{ translateX: shakeAnim }] },
                    ]}
                >
                    {/* Error Banner */}
                    {error ? (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : (
                        <View style={styles.errorSpacer} />
                    )}

                    {/* PIN Indicator Dots Layer (Glows green when digit entered) */}
                    <View style={styles.pinDotsRow}>
                        {Array.from({ length: 6 }).map((_, i) => {
                            const isFilled = i < pin.length;
                            return (
                                <View key={i} style={styles.dotSlot}>
                                    {isFilled && <View style={styles.dotGlowFill} />}
                                </View>
                            );
                        })}
                    </View>

                    {/* Keypad Grid (Interactive Transparent Touch Targets over Background Pills) */}
                    <View style={styles.keypadGrid}>
                        {KEYS.map((row, ri) => (
                            <View key={ri} style={styles.keyRow}>
                                {row.map((key, ki) => (
                                    <TouchableOpacity
                                        key={ki}
                                        style={styles.keyTouchBtn}
                                        activeOpacity={0.4}
                                        onPress={() => {
                                            if (key === 'fingerprint') handleKeyPress('fingerprint');
                                            else if (key === 'delete') handleDelete();
                                            else handleKeyPress(key);
                                        }}
                                        disabled={isLoading || lockoutSeconds > 0}
                                    />
                                ))}
                            </View>
                        ))}
                    </View>

                    {/* "Login to Portal" CTA Touch Target */}
                    <TouchableOpacity
                        style={styles.loginBtnTouchTarget}
                        activeOpacity={0.7}
                        onPress={handleLogin}
                        disabled={pin.length < 4 || isLoading || lockoutSeconds > 0}
                    >
                        {isLoading && (
                            <View style={styles.verifyingOverlay}>
                                <ActivityIndicator color="#ffffff" size="small" />
                                <Text style={styles.verifyingText}>Verifying…</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Support Contact Strip Touch Target */}
                    <TouchableOpacity
                        style={styles.supportTouchTarget}
                        activeOpacity={0.6}
                        onPress={() => {
                            Alert.alert(
                                'Property Support',
                                `${displayCompanyName}\n📞 Phone: ${businessInfo.phone}\n📧 Email: ${businessInfo.email}`,
                                [{ text: 'OK' }]
                            );
                        }}
                    />
                </Animated.View>

                {/* Bottom App Version Footer */}
                <Text style={styles.versionFooterText}>
                    ARMS Mobile {APP_VERSION} • Developed by Jimhawkins Korir
                </Text>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    bgImage: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: '#022c22',
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
        paddingBottom: 4,
    },

    // ── 1. Top Brand Header ──
    topBrandHeader: {
        paddingTop: (StatusBar.currentHeight || 36) + 6,
        paddingLeft: SCREEN_WIDTH * 0.23,
        paddingRight: SCREEN_WIDTH * 0.38,
        height: 110,
        justifyContent: 'center',
    },
    brandTextCol: {
        justifyContent: 'center',
    },
    brandTitleLine1: {
        color: '#ffffff',
        fontSize: 16.5,
        fontWeight: '900',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    brandTitleLine2: {
        color: '#fbbf24',
        fontSize: 15.5,
        fontWeight: '900',
        letterSpacing: 0.5,
        marginTop: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },

    // ── 2. Interactive Card Area ──
    interactiveCardArea: {
        width: Math.min(SCREEN_WIDTH * 0.90, 400),
        alignSelf: 'center',
        paddingHorizontal: 12,
        paddingBottom: 16,
    },

    errorBanner: {
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fca5a5',
        borderRadius: 10,
        paddingVertical: 4,
        paddingHorizontal: 8,
        marginBottom: 8,
        alignItems: 'center',
    },
    errorSpacer: {
        height: 24,
    },
    errorText: {
        color: '#b91c1c',
        fontSize: 11,
        fontWeight: '700',
    },

    // PIN Indicator Dots Layer
    pinDotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
        height: 24,
    },
    dotSlot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotGlowFill: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#00E676',
        borderWidth: 1.5,
        borderColor: '#ffffff',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 6,
    },

    // Keypad Grid Touch Targets
    keypadGrid: {
        marginBottom: 12,
    },
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    keyTouchBtn: {
        flex: 1,
        height: 52,
        marginHorizontal: 5,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
    },

    // Login CTA Touch Target
    loginBtnTouchTarget: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        marginVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 230, 118, 0.01)',
    },
    verifyingOverlay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(0, 200, 83, 0.9)',
        paddingVertical: 10,
        paddingHorizontal: 24,
        borderRadius: 24,
    },
    verifyingText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.3,
    },

    // Support Strip Touch Target
    supportTouchTarget: {
        width: '100%',
        height: 38,
        borderRadius: 19,
        marginTop: 6,
        backgroundColor: 'rgba(2, 44, 34, 0.01)',
    },

    // Version Footer Text
    versionFooterText: {
        textAlign: 'center',
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: '600',
    },

    // Overlays
    gateContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 999,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: 'rgba(2, 44, 34, 0.95)',
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
