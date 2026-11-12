import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    ActivityIndicator, Animated, Alert,
    StatusBar, ImageBackground, Dimensions, SafeAreaView,
    useWindowDimensions,
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
    loginBgPhone: require('../../assets/login/login_bg_phone_20_9.png'),
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

    const displayCompanyName = license?.clientName || businessInfo.companyName;

    // ── Dynamic 100% Screen-Fitted Geometry Calculation ──
    // The background image asset is 1024 x 2280.
    // Under resizeMode="cover", the image is scaled and centered by React Native.
    // We compute the exact scale and offsets so all touch targets and indicators
    // lock directly over the artwork with sub-pixel precision on ANY device.
    const { width: winW, height: winH } = useWindowDimensions();
    const bgScale = Math.max(winW / 1024, winH / 2280);
    const offsetX = (winW - 1024 * bgScale) / 2;
    const offsetY = (winH - 2280 * bgScale) / 2;

    const toX = (x: number) => offsetX + x * bgScale;
    const toY = (y: number) => offsetY + y * bgScale;
    const toW = (w: number) => w * bgScale;
    const toH = (h: number) => h * bgScale;

    // Exact PIN dot center positions in the 1024x2280 background
    const DOT_CENTERS_X = [284, 375, 466, 557, 648, 739];
    const DOT_CENTER_Y = 840;

    // Keypad layout definition locked over each pill in the artwork
    const KEY_GRID = [
        // Row 1
        { key: '1', x: 180, y: 920 },
        { key: '2', x: 412, y: 920 },
        { key: '3', x: 644, y: 920 },

        // Row 2
        { key: '4', x: 180, y: 1025 },
        { key: '5', x: 412, y: 1025 },
        { key: '6', x: 644, y: 1025 },

        // Row 3
        { key: '7', x: 180, y: 1130 },
        { key: '8', x: 412, y: 1130 },
        { key: '9', x: 644, y: 1130 },

        // Row 4
        { key: 'fingerprint', x: 180, y: 1235 },
        { key: '0',           x: 412, y: 1235 },
        { key: 'delete',      x: 644, y: 1235 },
    ];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* ════ 100% FIT 20:9 PHONE BACKGROUND WITH EXACT SCENERY & CURVY CARD ════ */}
            <ImageBackground
                source={ASSETS.loginBgPhone}
                style={styles.bgImage}
                resizeMode="cover"
            >
                <Animated.View
                    style={[
                        StyleSheet.absoluteFillObject,
                        { transform: [{ translateX: shakeAnim }] },
                    ]}
                >
                    {/* Error Banner (floating gracefully in clear space above PIN dots) */}
                    {error ? (
                        <View style={[styles.errorBanner, { top: toY(760) }]}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    {/* ════ 6 ACTIVE PIN INDICATOR DOTS (Locked over empty circle rings) ════ */}
                    {DOT_CENTERS_X.map((cx, i) => {
                        const isFilled = i < pin.length;
                        return (
                            <View
                                key={i}
                                style={[
                                    styles.pinDotWrapper,
                                    {
                                        left: toX(cx) - toW(12),
                                        top: toY(DOT_CENTER_Y) - toH(12),
                                        width: toW(24),
                                        height: toH(24),
                                    },
                                ]}
                                pointerEvents="none"
                            >
                                {isFilled && (
                                    <View
                                        style={[
                                            styles.pinDotActiveGlow,
                                            {
                                                width: toW(16),
                                                height: toH(16),
                                                borderRadius: toW(8),
                                            },
                                        ]}
                                    />
                                )}
                            </View>
                        );
                    })}

                    {/* ════ 12 INTERACTIVE KEYPAD TOUCH TARGETS (Locked over each pill) ════ */}
                    {KEY_GRID.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.keypadTouchTarget,
                                {
                                    left: toX(item.x),
                                    top: toY(item.y),
                                    width: toW(200),
                                    height: toH(92),
                                    borderRadius: toW(26),
                                },
                            ]}
                            activeOpacity={0.35}
                            onPress={() => {
                                if (item.key === 'fingerprint') handleKeyPress('fingerprint');
                                else if (item.key === 'delete') handleDelete();
                                else handleKeyPress(item.key);
                            }}
                            disabled={isLoading || lockoutSeconds > 0}
                        />
                    ))}

                    {/* ════ "LOGIN TO PORTAL" CTA TOUCH TARGET (Locked over green button) ════ */}
                    <TouchableOpacity
                        style={[
                            styles.loginBtnTouchTarget,
                            {
                                left: toX(150),
                                top: toY(1355),
                                width: toW(724),
                                height: toH(110),
                                borderRadius: toW(55),
                            },
                        ]}
                        activeOpacity={0.65}
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

                    {/* ════ SUPPORT TOUCH TARGET (Locked over "Need Help? Contact Support") ════ */}
                    <TouchableOpacity
                        style={[
                            styles.supportTouchTarget,
                            {
                                left: toX(160),
                                top: toY(1505),
                                width: toW(704),
                                height: toH(70),
                                borderRadius: toW(35),
                            },
                        ]}
                        activeOpacity={0.5}
                        onPress={() => {
                            Alert.alert(
                                'Property Support',
                                `${displayCompanyName}\n📞 Phone: ${businessInfo.phone}\n📧 Email: ${businessInfo.email}`,
                                [{ text: 'OK' }]
                            );
                        }}
                    />
                </Animated.View>

                {/* ════ LICENSE GATE MODAL (If Revoked) ════ */}
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

                {/* ════ VERIFYING ACCESS OVERLAY ════ */}
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

                {/* Bottom App Version Footer */}
                <Text style={styles.versionFooterText}>
                    ARMS Mobile {APP_VERSION} • Developed by Jimhawkins Korir
                </Text>
            </ImageBackground>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#022c22',
    },
    bgImage: {
        width: '100%',
        height: '100%',
    },

    // ── Floating Error Banner ──
    errorBanner: {
        position: 'absolute',
        top: '32.5%',
        alignSelf: 'center',
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fca5a5',
        borderRadius: 10,
        paddingVertical: 5,
        paddingHorizontal: 12,
        zIndex: 50,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    errorText: {
        color: '#b91c1c',
        fontSize: 12,
        fontWeight: '800',
    },

    // ── PIN Dot Active Layer ──
    pinDotWrapper: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pinDotActiveGlow: {
        backgroundColor: '#00E676',
        borderWidth: 1.5,
        borderColor: '#ffffff',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 6,
    },

    // ── Keypad Pill Touch Targets ──
    keypadTouchTarget: {
        position: 'absolute',
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
    },

    // ── "Login to Portal" CTA Touch Target ──
    loginBtnTouchTarget: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 230, 118, 0.01)',
    },
    verifyingOverlay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(0, 200, 83, 0.92)',
        paddingVertical: 8,
        paddingHorizontal: 22,
        borderRadius: 24,
    },
    verifyingText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.3,
    },

    // ── Support Strip Touch Target ──
    supportTouchTarget: {
        position: 'absolute',
        backgroundColor: 'rgba(2, 44, 34, 0.01)',
    },

    // ── Bottom Version Footer ──
    versionFooterText: {
        position: 'absolute',
        bottom: 10,
        alignSelf: 'center',
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.75)',
        fontWeight: '700',
    },

    // ── Gate & Verification Overlays ──
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
