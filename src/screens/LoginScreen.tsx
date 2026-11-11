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
    exactPremiumBg: require('../../assets/login/exact_backdrop_scenery.png'),
    logo: require('../../assets/dashboard/arms_logo.png'),
    keyFingerprint: require('../../assets/login/vector_fingerprint.png'),
    keyBackspace: require('../../assets/login/vector_backspace.png'),
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
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* ════ EXACT PREMIUM BACKGROUND ARTWORK (Villa, Silk Waves, Botanical Leaves) ════ */}
            <Image
                source={ASSETS.exactPremiumBg}
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

            <SafeAreaView style={styles.safeArea}>
                {/* ══════════════════════════════════════════════════════
                    1. TOP BRAND HEADER (Dynamic Landlord / Business Name)
                ══════════════════════════════════════════════════════ */}
                <View style={styles.topBrandHeader}>
                    <Image source={ASSETS.logo} style={styles.brandLogo} />

                    <View style={styles.brandTextCol}>
                        <Text style={styles.brandTitleLine1} numberOfLines={1} adjustsFontSizeToFit>
                            {brandLine1}
                        </Text>
                        {brandLine2 ? (
                            <Text style={styles.brandTitleLine2} numberOfLines={1} adjustsFontSizeToFit>
                                {brandLine2}
                            </Text>
                        ) : null}
                        <Text style={styles.brandSubtitle}>Rental Management</Text>
                        <Text style={styles.brandTagline}>Smart Rentals. Better Living.</Text>
                    </View>
                </View>

                {/* ══════════════════════════════════════════════════════
                    2. CENTRAL SUPER-CURVY FROSTED GLASS LOGIN CARD
                ══════════════════════════════════════════════════════ */}
                <View style={styles.cardCenterWrapper}>
                    {/* Glowing radiant emerald aura backdrop */}
                    <View style={styles.cardAuraGlow} />

                    {/* Outer 3D glass curved halo rim */}
                    <View style={styles.cardOuterGlassRim}>
                        <Animated.View
                            style={[
                                styles.curvyGlassCard,
                                { transform: [{ translateX: shakeAnim }] },
                            ]}
                        >
                            {/* Frosted translucent glass gradient body */}
                            <LinearGradient
                                colors={['rgba(255, 255, 255, 0.98)', 'rgba(240, 253, 246, 0.94)', 'rgba(232, 250, 242, 0.96)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={styles.cardGradientFill}
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
                                            <Text style={{ fontSize: 25 }}>🔒</Text>
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

                                {/* Error Banner */}
                                {error ? (
                                    <View style={styles.errorBanner}>
                                        <Text style={styles.errorText}>⚠️ {error}</Text>
                                    </View>
                                ) : null}

                                {/* Keypad Grid (4 Rows x 3 Columns) - Smooth roomy pill keys, NO tap bounce animations */}
                                <View style={styles.keypadGrid}>
                                    {KEYS.map((row, ri) => (
                                        <View key={ri} style={styles.keyRow}>
                                            {row.map((key, ki) => {
                                                if (key === 'fingerprint') {
                                                    return (
                                                        <TouchableOpacity
                                                            key={ki}
                                                            style={styles.keyBtn}
                                                            activeOpacity={0.65}
                                                            onPress={() => handleKeyPress('fingerprint')}
                                                            disabled={isLoading || lockoutSeconds > 0}
                                                        >
                                                            <Image
                                                                source={ASSETS.keyFingerprint}
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
                                                            activeOpacity={0.65}
                                                            onPress={handleDelete}
                                                            disabled={isLoading || lockoutSeconds > 0}
                                                        >
                                                            <Image
                                                                source={ASSETS.keyBackspace}
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
                                                        activeOpacity={0.65}
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

                                {/* Glowing Neon "Login to Portal" Action Button */}
                                <TouchableOpacity
                                    style={[
                                        styles.loginPortalBtn,
                                        (pin.length < 4 || isLoading || lockoutSeconds > 0) && styles.loginBtnDimmed,
                                    ]}
                                    activeOpacity={0.8}
                                    onPress={handleLogin}
                                    disabled={pin.length < 4 || isLoading || lockoutSeconds > 0}
                                >
                                    <LinearGradient
                                        colors={['#00C853', '#00E676', '#047857']}
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
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <Text style={{ fontSize: 12 }}>🛡️</Text>
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
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                            <Text style={{ fontSize: 12 }}>🎧</Text>
                                            <Text style={styles.trustText}>Need Help? Contact Support</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </LinearGradient>
                        </Animated.View>
                    </View>
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
        paddingBottom: 4,
    },

    // ── 1. Top Brand Header ──
    topBrandHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: (StatusBar.currentHeight || 36) + 4,
        paddingHorizontal: 20,
    },
    brandLogo: {
        width: 58,
        height: 58,
        borderRadius: 18,
        marginRight: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    brandTextCol: {
        flex: 1,
    },
    brandTitleLine1: {
        color: '#ffffff',
        fontSize: 16.5,
        fontWeight: '900',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0, 0, 0, 0.65)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    brandTitleLine2: {
        color: '#fbbf24',
        fontSize: 15.5,
        fontWeight: '900',
        letterSpacing: 0.5,
        marginTop: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.65)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    brandSubtitle: {
        color: 'rgba(255, 255, 255, 0.95)',
        fontSize: 12,
        fontWeight: '700',
        marginTop: 2,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    brandTagline: {
        color: '#34d399',
        fontSize: 11,
        fontStyle: 'italic',
        fontWeight: '600',
        marginTop: 1,
    },

    // ── 2. Central Super-Curvy Frosted Glass Card ──
    cardCenterWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 6,
    },
    cardAuraGlow: {
        position: 'absolute',
        top: 8,
        bottom: 2,
        left: 10,
        right: 10,
        borderRadius: 54,
        backgroundColor: 'rgba(0, 230, 118, 0.32)',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.95,
        shadowRadius: 38,
        elevation: 24,
    },
    cardOuterGlassRim: {
        width: '100%',
        maxWidth: 410,
        borderRadius: 52,
        padding: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.35)',
        borderWidth: 1.5,
        borderColor: 'rgba(0, 230, 118, 0.65)',
    },
    curvyGlassCard: {
        width: '100%',
        borderRadius: 48,
        borderWidth: 1.8,
        borderColor: 'rgba(52, 211, 153, 0.85)',
        position: 'relative',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 28,
        elevation: 20,
        backgroundColor: '#ffffff',
    },
    cardGradientFill: {
        borderRadius: 46,
        paddingTop: 36,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },

    // Shield Lock Badge on Top Rim
    shieldBadgeContainer: {
        position: 'absolute',
        top: -34,
        alignSelf: 'center',
        zIndex: 10,
    },
    shieldOuterRing: {
        width: 68,
        height: 68,
        borderRadius: 24,
        backgroundColor: 'rgba(0, 230, 118, 0.25)',
        padding: 4,
        borderWidth: 2,
        borderColor: '#00E676',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.85,
        shadowRadius: 18,
        elevation: 16,
    },
    shieldInner: {
        flex: 1,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.95)',
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
        marginTop: 2,
        marginBottom: 14,
    },

    // PIN Indicator Dots
    pinDotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    dot: {
        width: 17,
        height: 17,
        borderRadius: 8.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dotEmpty: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
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

    // Keypad Grid - Smooth, roomy pill keys
    keypadGrid: {
        marginBottom: 10,
    },
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    keyBtn: {
        flex: 1,
        height: 54,
        marginHorizontal: 4,
        borderRadius: 22,
        backgroundColor: '#ffffff',
        borderWidth: 1.2,
        borderColor: 'rgba(16, 185, 129, 0.22)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 5,
        elevation: 3,
    },
    keyNumberText: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0f172a',
    },
    keyFingerprintImg: {
        width: 30,
        height: 30,
    },
    keyBackspaceImg: {
        width: 32,
        height: 28,
    },

    // Login Portal Button
    loginPortalBtn: {
        borderRadius: 28,
        overflow: 'hidden',
        marginBottom: 10,
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
        elevation: 8,
    },
    loginBtnDimmed: {
        opacity: 0.8,
        shadowOpacity: 0.2,
    },
    loginBtnGrad: {
        height: 54,
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
        fontSize: 16.5,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    arrowCircleBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
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
        backgroundColor: 'rgba(2, 44, 34, 0.06)',
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        gap: 6,
    },
    trustText: {
        fontSize: 9.5,
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
