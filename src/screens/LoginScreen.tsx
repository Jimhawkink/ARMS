import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, Animated, Alert,
    StatusBar, Image, Dimensions, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
    villa: require('../../assets/dashboard/hero_villa_clean.png'),
    logo: require('../../assets/dashboard/arms_logo.png'),
    bottomLeftArt: require('../../assets/login/bottom_left_art.png'),
    keyFingerprintClean: require('../../assets/login/fingerprint_clean.png'),
    keyBackspaceClean: require('../../assets/login/backspace_clean.png'),
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
    const pulseAnim = useRef(new Animated.Value(1)).current;
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
                `Please enter your 4-6 digit assigned PIN to log into your account securely.\nNeed help? Call ${businessInfo.phone}`,
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

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* ════ CLEAN RADIANT EMERALD GRADIENT BACKDROP ════ */}
            <LinearGradient
                colors={['#022c22', '#064e3b', '#047857', '#022c22']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Top-Right Modern Luxury Villa Visual */}
            <Image
                source={ASSETS.villa}
                style={styles.villaBackdrop}
                resizeMode="cover"
            />
            {/* Fade overlay so building blends into the emerald silk gradient */}
            <LinearGradient
                colors={['rgba(2,44,34,0.95)', 'rgba(4,120,87,0.65)', 'rgba(2,44,34,0.1)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.villaFade}
            />

            {/* Bottom-Left Botanical Art with "Your Property, Our Priority!" */}
            <Image
                source={ASSETS.bottomLeftArt}
                style={styles.bottomLeftArt}
                resizeMode="contain"
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

            <SafeAreaView style={styles.safeArea}>
                {/* ══════════════════════════════════════════════════════
                    1. TOP BRAND HEADER (Dynamic Landlord / Business Name)
                ══════════════════════════════════════════════════════ */}
                <View style={styles.topBrandHeader}>
                    <Image source={ASSETS.logo} style={styles.brandLogo} />

                    <View style={styles.brandTextCol}>
                        <Text style={styles.brandTitle} numberOfLines={1}>
                            {displayCompanyName.toUpperCase()}
                        </Text>
                        <Text style={styles.brandSubtitle}>Rental Management</Text>
                        <Text style={styles.brandTagline}>Smart Rentals. Better Living.</Text>
                    </View>
                </View>

                {/* ══════════════════════════════════════════════════════
                    2. CENTRAL FLOATING CURVY FROSTED GLASS LOGIN CARD
                ══════════════════════════════════════════════════════ */}
                <View style={styles.cardCenterWrapper}>
                    <Animated.View
                        style={[
                            styles.curvyGlassCard,
                            {
                                transform: [
                                    { translateX: shakeAnim },
                                    { scale: pulseAnim },
                                ],
                            },
                        ]}
                    >
                        {/* Glowing Emerald Shield Lock Badge on Top Rim */}
                        <View style={styles.shieldBadgeContainer}>
                            <View style={styles.shieldOuterRing}>
                                <LinearGradient
                                    colors={['#00E676', '#00C853', '#047857']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.shieldInner}
                                >
                                    <Text style={{ fontSize: 24 }}>🔒</Text>
                                </LinearGradient>
                            </View>
                        </View>

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

                        {/* Error banner */}
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
                                                        source={ASSETS.keyFingerprintClean}
                                                        style={styles.keyFingerprintImg}
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
                                                        source={ASSETS.keyBackspaceClean}
                                                        style={styles.keyBackspaceImg}
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
                                        <View style={styles.arrowCircleBadge}>
                                            <Text style={styles.arrowChevron}>❯</Text>
                                        </View>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Trust & Support Strip */}
                        <View style={styles.trustStrip}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={{ fontSize: 11 }}>🛡️</Text>
                                <Text style={styles.trustText}>Secure & Encrypted</Text>
                            </View>
                            <Text style={styles.trustDivider}>|</Text>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => {
                                    Alert.alert(
                                        'Support Contact',
                                        `${displayCompanyName}\n📞 Phone: ${businessInfo.phone}\n📧 Email: ${businessInfo.email}`,
                                        [{ text: 'OK' }]
                                    );
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={{ fontSize: 11 }}>🎧</Text>
                                    <Text style={styles.trustText}>Need Help? Contact Support</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>

                {/* Bottom App Version Footer */}
                <Text style={styles.versionFooterText}>
                    ARMS Mobile {APP_VERSION} • Developed by Jimhawkins Korir
                </Text>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#022c22',
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
        paddingBottom: 8,
    },
    villaBackdrop: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: SCREEN_WIDTH * 0.58,
        height: 220,
        opacity: 0.75,
    },
    villaFade: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: SCREEN_WIDTH * 0.58,
        height: 220,
    },
    bottomLeftArt: {
        position: 'absolute',
        bottom: 8,
        left: 0,
        width: 120,
        height: 220,
        opacity: 0.6,
    },

    // ── 1. Top Brand Header ──
    topBrandHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: (StatusBar.currentHeight || 36) + 6,
        paddingHorizontal: 20,
    },
    brandLogo: {
        width: 56,
        height: 56,
        borderRadius: 16,
        marginRight: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    brandTextCol: {
        flex: 1,
    },
    brandTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0, 0, 0, 0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    brandSubtitle: {
        color: '#fbbf24',
        fontSize: 13,
        fontWeight: '800',
        marginTop: 1,
        letterSpacing: 0.3,
    },
    brandTagline: {
        color: '#ffffff',
        fontSize: 11,
        fontStyle: 'italic',
        fontWeight: '500',
        marginTop: 1,
        opacity: 0.9,
    },

    // ── 2. Curvy Frosted Glass Card ──
    cardCenterWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        marginVertical: 10,
    },
    curvyGlassCard: {
        width: Math.min(SCREEN_WIDTH * 0.92, 380),
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 36,
        paddingTop: 36,
        paddingHorizontal: 16,
        paddingBottom: 16,
        position: 'relative',
        borderWidth: 1.5,
        borderColor: 'rgba(52, 211, 153, 0.6)',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 16,
    },

    // Shield Lock Badge on Top
    shieldBadgeContainer: {
        position: 'absolute',
        top: -32,
        alignSelf: 'center',
        zIndex: 10,
    },
    shieldOuterRing: {
        width: 64,
        height: 64,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 230, 118, 0.25)',
        padding: 4,
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 14,
        elevation: 12,
    },
    shieldInner: {
        flex: 1,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.9)',
    },

    cardTitle: {
        fontSize: 21,
        fontWeight: '900',
        color: '#0f172a',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    cardSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
        textAlign: 'center',
        marginTop: 2,
        marginBottom: 12,
    },

    // PIN Indicator Dots
    pinDotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotEmpty: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#ffffff',
    },

    errorBanner: {
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fca5a5',
        borderRadius: 10,
        paddingVertical: 5,
        paddingHorizontal: 8,
        marginBottom: 8,
        alignItems: 'center',
    },
    errorText: {
        color: '#b91c1c',
        fontSize: 11,
        fontWeight: '700',
    },

    // Keypad Grid
    keypadGrid: {
        marginBottom: 10,
    },
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 7,
    },
    keyBtn: {
        flex: 1,
        height: 48,
        marginHorizontal: 4,
        borderRadius: 18,
        backgroundColor: '#ffffff',
        borderWidth: 1.2,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3,
    },
    keyNumberText: {
        fontSize: 21,
        fontWeight: '800',
        color: '#0f172a',
    },
    keyFingerprintImg: {
        width: 26,
        height: 26,
    },
    keyBackspaceImg: {
        width: 28,
        height: 24,
    },

    // Login Portal Button
    loginPortalBtn: {
        borderRadius: 25,
        overflow: 'hidden',
        marginBottom: 10,
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    loginBtnDisabled: {
        opacity: 0.7,
        shadowOpacity: 0.1,
    },
    loginBtnGrad: {
        height: 50,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    loginPortalIcon: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
    },
    loginBtnText: {
        color: '#ffffff',
        fontSize: 15.5,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    arrowCircleBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderWidth: 1.5,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowChevron: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
        marginLeft: 1,
    },

    // Trust Strip
    trustStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(2, 44, 34, 0.08)',
        borderRadius: 16,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        gap: 6,
    },
    trustText: {
        fontSize: 9,
        color: '#065f46',
        fontWeight: '700',
    },
    trustDivider: {
        color: '#cbd5e1',
        fontSize: 10,
    },

    // Version Footer Text
    versionFooterText: {
        textAlign: 'center',
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.65)',
        fontWeight: '600',
    },

    // Overlays
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
