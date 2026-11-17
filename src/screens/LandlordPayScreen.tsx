import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    Animated,
    Clipboard,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    StaffSession,
    TenantSearchResult,
    formatKES,
    maskPhone,
    normalizePhone,
    initiateSTKPush,
    pollSTKResult,
    refreshTenantBalance,
} from '../lib/supabase';
import { validateKenyanPhone, validateAmount } from '../lib/security';

interface Props {
    staff: StaffSession;
    tenant: TenantSearchResult;
    onBack: () => void;
    onPaymentComplete: () => void;
}

type Step = 'details' | 'confirm' | 'processing' | 'success' | 'failed';
type PhoneMode = 'registered' | 'custom';

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    primary: '#6366f1',
    accent: '#10b981',
    neonGreen: '#00e676',
    danger: '#ef4444',
    gold: '#fbbf24',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
    purple: '#8b5cf6',
};

const CONFETTI_COLORS = ['#10b981', '#00e676', '#fbbf24', '#f59e0b', '#38bdf8', '#a855f7', '#ec4899', '#ffffff'];

function FireworksBurst() {
    const particles = useRef(
        Array.from({ length: 32 }).map((_, i) => {
            const angle = (i / 32) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
            const dist = 70 + Math.random() * 110;
            const size = 6 + Math.random() * 8;
            const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const anim = new Animated.Value(0);
            return {
                anim,
                targetX: Math.cos(angle) * dist,
                targetY: Math.sin(angle) * dist,
                size,
                color,
                isCircle: i % 2 === 0,
            };
        })
    ).current;

    useEffect(() => {
        const animations = particles.map(p =>
            Animated.sequence([
                Animated.timing(p.anim, {
                    toValue: 1,
                    duration: 1300 + Math.random() * 400,
                    useNativeDriver: true,
                }),
                Animated.timing(p.anim, {
                    toValue: 0.8,
                    duration: 600,
                    useNativeDriver: true,
                }),
            ])
        );
        Animated.stagger(20, animations).start();
    }, [particles]);

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                {particles.map((p, idx) => {
                    const transX = p.anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, p.targetX],
                    });
                    const transY = p.anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, p.targetY],
                    });
                    const scale = p.anim.interpolate({
                        inputRange: [0, 0.4, 1],
                        outputRange: [0.2, 1.4, 0.7],
                    });
                    const opacity = p.anim.interpolate({
                        inputRange: [0, 0.2, 0.7, 1],
                        outputRange: [0, 1, 0.9, 0],
                    });
                    const rotate = p.anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${(idx % 2 === 0 ? 1 : -1) * 360}deg`],
                    });

                    return (
                        <Animated.View
                            key={idx}
                            style={{
                                position: 'absolute',
                                width: p.size,
                                height: p.isCircle ? p.size : p.size * 1.6,
                                borderRadius: p.isCircle ? p.size / 2 : 2,
                                backgroundColor: p.color,
                                opacity,
                                transform: [
                                    { translateX: transX },
                                    { translateY: transY },
                                    { scale },
                                    { rotate },
                                ],
                            }}
                        />
                    );
                })}
            </View>
        </View>
    );
}

function ConfirmRowItem({ emoji, label, value, highlight }: { emoji: string; label: string; value: string; highlight?: boolean }) {
    return (
        <View style={styles.confirmRow}>
            <Text style={styles.rowEmoji}>{emoji}</Text>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={[styles.rowValue, highlight && { color: COLORS.neonGreen, fontWeight: '900', fontSize: 16 }]}>
                {value}
            </Text>
        </View>
    );
}

export default function LandlordPayScreen({ staff, tenant, onBack, onPaymentComplete }: Props) {
    const [step, setStep] = useState<Step>('details');
    const [phoneMode, setPhoneMode] = useState<PhoneMode>('registered');
    const [customPhone, setCustomPhone] = useState('');
    const [amount, setAmount] = useState('');
    const [freshBalance, setFreshBalance] = useState(tenant.balance);
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState('');
    const [paidAmount, setPaidAmount] = useState(0);
    const [confirmedBalance, setConfirmedBalance] = useState(0);

    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        refreshTenantBalance(tenant.tenant_id).then(bal => {
            setFreshBalance(bal);
            if (bal > 0) setAmount(String(Math.round(bal)));
        });
        return () => {
            if (cleanupRef.current) cleanupRef.current();
        };
    }, [tenant.tenant_id]);

    const effectivePhone = phoneMode === 'registered' ? tenant.phone : customPhone;

    const handleProceed = () => {
        const { valid: amtValid, error: amtErr } = validateAmount(amount);
        if (!amtValid) {
            setError(amtErr || 'Please enter a valid payment amount');
            return;
        }

        const { valid: phValid, error: phErr } = validateKenyanPhone(effectivePhone);
        if (!phValid) {
            setError(phErr || 'Please enter a valid Kenyan phone number');
            return;
        }

        setError('');
        setStep('confirm');
    };

    const handlePayNow = async () => {
        setStep('processing');
        setStatusMsg('Dispatching M-Pesa STK push to tenant...');

        const normalized = normalizePhone(effectivePhone);
        if (!normalized) {
            setError('Invalid phone number');
            setStep('details');
            return;
        }

        const amtVal = Math.round(parseFloat(amount));
        const desc = `Rent - ${tenant.tenant_name} - ${tenant.unit_name} (Landlord)`;

        try {
            const { checkoutRequestId, error: stkErr } = await initiateSTKPush({
                payerPhone: normalized,
                amount: amtVal,
                tenantId: tenant.tenant_id,
                tenantPhone: tenant.phone || normalized,
                description: desc,
            });

            if (stkErr || !checkoutRequestId) {
                setStep('failed');
                setError(stkErr || 'STK Push failed');
                return;
            }

            setStatusMsg('Waiting for tenant to enter M-Pesa PIN on their phone...');

            cleanupRef.current = pollSTKResult({
                checkoutRequestId,
                timeoutMs: 60000,
                onConfirmed: async (mpesaReceipt, confirmedAmt) => {
                    const finalAmt = confirmedAmt || amtVal;
                    setReceipt(mpesaReceipt);
                    setPaidAmount(finalAmt);
                    const newBal = await refreshTenantBalance(tenant.tenant_id);
                    setConfirmedBalance(newBal);
                    setStep('success');
                },
                onFailed: reason => {
                    setError(reason || 'Payment was cancelled or rejected by tenant.');
                    setStep('failed');
                },
                onTimeout: () => {
                    setError('Payment verification timed out. If money was deducted, the system will auto-sync.');
                    setStep('failed');
                },
            });
        } catch (err: any) {
            setError(err.message || 'Network communication error');
            setStep('failed');
        }
    };

    const reset = () => {
        setStep('details');
        setError('');
        setReceipt('');
        setPaidAmount(0);
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
    };

    const initials = tenant.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    // ─────────────────────────────────────────────────────────────
    // STEP: SUCCESS (WITH FIREWORKS)
    // ─────────────────────────────────────────────────────────────
    if (step === 'success') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={onBack} activeOpacity={0.75} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Rent Collected</Text>
                        <Text style={styles.headerSub}>STK settled instantly</Text>
                    </View>
                </View>

                {/* Celebratory Fireworks Particle Burst */}
                <FireworksBurst />

                <ScrollView contentContainerStyle={styles.centerContent}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Text style={styles.successIconEmoji}>🎆</Text>
                        </View>
                        <Text style={styles.successTitle}>🎉 Payment Received! 🎇</Text>
                        <Text style={styles.successSub}>
                            The tenant's payment was verified and credited in real-time.
                        </Text>

                        <View style={styles.resultRows}>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Tenant Name</Text>
                                <Text style={styles.resultValue}>{tenant.tenant_name}</Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Unit Allocated</Text>
                                <Text style={styles.resultValue}>{tenant.unit_name} • {tenant.location_name}</Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Amount Collected</Text>
                                <Text style={[styles.resultValue, { color: COLORS.neonGreen, fontWeight: '900' }]}>
                                    {formatKES(paidAmount)}
                                </Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>M-Pesa Receipt</Text>
                                <Text style={[styles.resultValue, { color: COLORS.gold }]}>{receipt}</Text>
                            </View>
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Remaining Balance</Text>
                                <Text style={[styles.resultValue, { color: confirmedBalance > 0 ? COLORS.danger : COLORS.neonGreen }]}>
                                    {formatKES(confirmedBalance)}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                reset();
                                onPaymentComplete();
                            }}
                            activeOpacity={0.85}
                            style={styles.doneBtn}
                        >
                            <LinearGradient colors={['#10b981', '#059669']} style={styles.doneBtnGrad}>
                                <Text style={styles.doneBtnText}>Done • Return to Tenants</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: PROCESSING (RADAR)
    // ─────────────────────────────────────────────────────────────
    if (step === 'processing') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={() => setStep('details')} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Cancel</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Sending STK Push</Text>
                        <Text style={styles.headerSub}>Awaiting tenant PIN</Text>
                    </View>
                </View>

                <View style={styles.centerBox}>
                    <View style={styles.processingCard}>
                        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginBottom: 16 }} />
                        <Text style={styles.processingTitle}>M-Pesa Prompt Dispatched</Text>
                        <Text style={styles.processingSub}>{statusMsg}</Text>
                        <View style={styles.processingPhonePill}>
                            <Text style={styles.processingPhoneText}>{maskPhone(effectivePhone)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setStep('details')} style={styles.cancelLink}>
                            <Text style={styles.cancelLinkText}>Cancel & Edit</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: FAILED
    // ─────────────────────────────────────────────────────────────
    if (step === 'failed') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Collection Status</Text>
                        <Text style={styles.headerSub}>Notice</Text>
                    </View>
                </View>

                <View style={styles.centerBox}>
                    <View style={styles.failedCard}>
                        <Text style={styles.failedIcon}>⚠️</Text>
                        <Text style={styles.failedTitle}>Prompt Not Confirmed</Text>
                        <Text style={styles.failedSub}>{error || 'The transaction was not completed.'}</Text>
                        <TouchableOpacity onPress={reset} style={styles.retryBtn}>
                            <Text style={styles.retryBtnText}>Try Again</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onBack} style={styles.cancelLink}>
                            <Text style={styles.cancelLinkText}>Return to Tenant List</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: CONFIRM
    // ─────────────────────────────────────────────────────────────
    if (step === 'confirm') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={() => setStep('details')} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Confirm STK Push</Text>
                        <Text style={styles.headerSub}>Verify payment recipient</Text>
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.confirmCard}>
                        <Text style={styles.confirmCardLabel}>TRANSACTION SUMMARY</Text>
                        <ConfirmRowItem emoji="👤" label="Tenant" value={tenant.tenant_name} />
                        <ConfirmRowItem emoji="🚪" label="Allocated Unit" value={`${tenant.unit_name} • ${tenant.location_name}`} />
                        <ConfirmRowItem emoji="💰" label="Amount" value={formatKES(parseFloat(amount))} highlight />
                        <ConfirmRowItem emoji="📱" label="Prompt Sent To" value={maskPhone(effectivePhone)} />
                        <ConfirmRowItem emoji="👔" label="Initiated By" value={`${staff.staff_name} (Landlord)`} />
                    </View>

                    <TouchableOpacity onPress={handlePayNow} activeOpacity={0.85} style={styles.sendStkBtn}>
                        <LinearGradient colors={['#10b981', '#059669']} style={styles.sendStkGrad}>
                            <Text style={styles.sendStkEmoji}>⚡</Text>
                            <Text style={styles.sendStkText}>Push STK ({formatKES(parseFloat(amount))})</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: DETAILS (DEFAULT)
    // ─────────────────────────────────────────────────────────────
    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Top Safe Header Bar */}
            <View style={styles.pinnedHeader}>
                <TouchableOpacity onPress={onBack} activeOpacity={0.75} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>Collect Rent</Text>
                    <Text style={styles.headerSub}>Landlord Instant STK Express</Text>
                </View>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>
                    {/* Tenant Hero Card */}
                    <LinearGradient colors={['#16213e', '#0f172a']} style={styles.tenantHeroCard}>
                        <View style={styles.tenantAvatar}>
                            <Text style={styles.tenantAvatarText}>{initials}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.tenantHeroName}>{tenant.tenant_name}</Text>
                            <Text style={styles.tenantHeroSub}>🚪 {tenant.unit_name} • 📍 {tenant.location_name}</Text>
                            <Text style={styles.tenantHeroPhone}>📱 {tenant.phone || 'No phone'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.balSub}>Balance</Text>
                            <Text style={[styles.balAmount, { color: freshBalance > 0 ? COLORS.danger : COLORS.neonGreen }]}>
                                {formatKES(freshBalance)}
                            </Text>
                        </View>
                    </LinearGradient>

                    {/* Phone Selector */}
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>1. SEND STK PROMPT TO</Text>
                        <View style={styles.modeToggleRow}>
                            <TouchableOpacity
                                style={[styles.modeBtn, phoneMode === 'registered' && styles.modeBtnActive]}
                                onPress={() => setPhoneMode('registered')}
                            >
                                <Text style={[styles.modeBtnText, phoneMode === 'registered' && styles.modeBtnTextActive]}>
                                    Tenant's Phone
                                </Text>
                                <Text style={styles.modeBtnSub}>{maskPhone(tenant.phone)}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modeBtn, phoneMode === 'custom' && styles.modeBtnActive]}
                                onPress={() => setPhoneMode('custom')}
                            >
                                <Text style={[styles.modeBtnText, phoneMode === 'custom' && styles.modeBtnTextActive]}>
                                    Other Phone
                                </Text>
                                <Text style={styles.modeBtnSub}>Parent / Relative</Text>
                            </TouchableOpacity>
                        </View>

                        {phoneMode === 'custom' && (
                            <View style={styles.customPhoneBox}>
                                <Text style={styles.inputLabel}>RECIPIENT PHONE NUMBER</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={customPhone}
                                    onChangeText={setCustomPhone}
                                    placeholder="e.g. 0712345678"
                                    placeholderTextColor={COLORS.textDim}
                                    keyboardType="phone-pad"
                                    maxLength={13}
                                />
                            </View>
                        )}
                    </View>

                    {/* Amount Input */}
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>2. COLLECTION AMOUNT (KES)</Text>
                        <View style={styles.amountWrap}>
                            <Text style={styles.kesPrefix}>KES</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={amount}
                                onChangeText={t => setAmount(t.replace(/[^0-9]/g, ''))}
                                placeholder="0"
                                placeholderTextColor={COLORS.textDim}
                                keyboardType="numeric"
                                maxLength={7}
                            />
                        </View>

                        <View style={styles.presetRow}>
                            {freshBalance > 0 && (
                                <TouchableOpacity
                                    onPress={() => setAmount(String(Math.round(freshBalance)))}
                                    style={[styles.presetChip, styles.presetChipHighlight]}
                                >
                                    <Text style={styles.presetChipTextHighlight}>Full Balance: {formatKES(freshBalance)}</Text>
                                </TouchableOpacity>
                            )}
                            {tenant.monthly_rent ? (
                                <TouchableOpacity
                                    onPress={() => setAmount(String(Math.round(tenant.monthly_rent)))}
                                    style={styles.presetChip}
                                >
                                    <Text style={styles.presetChipText}>1 Month: {formatKES(tenant.monthly_rent)}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity onPress={handleProceed} activeOpacity={0.85} style={styles.proceedBtn}>
                        <LinearGradient colors={['#10b981', '#059669']} style={styles.proceedGrad}>
                            <Text style={styles.proceedBtnText}>Continue to Review →</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    pinnedHeader: {
        backgroundColor: '#0d1527',
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 46,
        paddingBottom: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 50,
    },
    backBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        paddingHorizontal: 13,
        paddingVertical: 7,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
    },
    backBtnText: {
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: '800',
    },
    headerTitleWrap: {
        flex: 1,
    },
    headerTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: -0.2,
    },
    headerSub: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },
    content: {
        padding: 16,
    },
    centerContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 16,
    },
    tenantHeroCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        gap: 12,
    },
    tenantAvatar: {
        width: 46,
        height: 46,
        borderRadius: 16,
        backgroundColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tenantAvatarText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
    },
    tenantHeroName: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
        marginBottom: 2,
    },
    tenantHeroSub: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '600',
    },
    tenantHeroPhone: {
        color: COLORS.textDim,
        fontSize: 11,
        marginTop: 2,
    },
    balSub: {
        fontSize: 9,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.6,
        marginBottom: 2,
    },
    balAmount: {
        fontSize: 16,
        fontWeight: '900',
    },
    sectionCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    modeToggleRow: {
        flexDirection: 'row',
        gap: 10,
    },
    modeBtn: {
        flex: 1,
        backgroundColor: '#0a0f1d',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    modeBtnActive: {
        borderColor: COLORS.accent,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    modeBtnText: {
        color: COLORS.textSub,
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 2,
    },
    modeBtnTextActive: {
        color: COLORS.text,
        fontWeight: '900',
    },
    modeBtnSub: {
        fontSize: 10,
        color: COLORS.textDim,
    },
    customPhoneBox: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    inputLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    textInput: {
        backgroundColor: '#0a0f1d',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: COLORS.text,
        fontSize: 14,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    amountWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        paddingHorizontal: 16,
        borderWidth: 1.5,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        marginBottom: 10,
    },
    kesPrefix: {
        fontSize: 16,
        fontWeight: '900',
        color: COLORS.textDim,
        marginRight: 8,
    },
    amountInput: {
        flex: 1,
        height: 50,
        fontSize: 24,
        fontWeight: '900',
        color: COLORS.neonGreen,
    },
    presetRow: {
        flexDirection: 'row',
        gap: 8,
    },
    presetChip: {
        flex: 1,
        backgroundColor: '#0a0f1d',
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    presetChipHighlight: {
        borderColor: 'rgba(245, 158, 11, 0.4)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
    },
    presetChipText: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '700',
    },
    presetChipTextHighlight: {
        color: '#fbbf24',
        fontSize: 11,
        fontWeight: '900',
    },
    errorBox: {
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        marginBottom: 16,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 12,
        fontWeight: '700',
    },
    proceedBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    proceedGrad: {
        paddingVertical: 15,
        alignItems: 'center',
    },
    proceedBtnText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
    },
    confirmCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        marginBottom: 18,
    },
    confirmCardLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 14,
    },
    confirmRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    rowEmoji: {
        fontSize: 16,
        marginRight: 10,
    },
    rowLabel: {
        flex: 1,
        color: COLORS.textSub,
        fontSize: 12,
        fontWeight: '600',
    },
    rowValue: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: '800',
    },
    sendStkBtn: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    sendStkGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    sendStkEmoji: {
        fontSize: 18,
    },
    sendStkText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
    },
    centerBox: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
    },
    processingCard: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    processingTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 8,
    },
    processingSub: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    processingPhonePill: {
        backgroundColor: '#0a0f1d',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        marginBottom: 16,
    },
    processingPhoneText: {
        color: COLORS.neonGreen,
        fontSize: 14,
        fontWeight: '900',
    },
    cancelLink: {
        paddingVertical: 6,
    },
    cancelLinkText: {
        color: COLORS.textDim,
        fontSize: 12,
        fontWeight: '700',
    },
    failedCard: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
    },
    failedIcon: {
        fontSize: 40,
        marginBottom: 10,
    },
    failedTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 6,
    },
    failedSub: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 18,
    },
    retryBtn: {
        width: '100%',
        backgroundColor: COLORS.accent,
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
        marginBottom: 10,
    },
    retryBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
    successCard: {
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    successIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    successIconEmoji: {
        fontSize: 32,
    },
    successTitle: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 6,
    },
    successSub: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 18,
    },
    resultRows: {
        width: '100%',
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    resultLabel: {
        fontSize: 11,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    resultValue: {
        fontSize: 12,
        color: COLORS.text,
        fontWeight: '800',
    },
    doneBtn: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
    },
    doneBtnGrad: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    doneBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
});
