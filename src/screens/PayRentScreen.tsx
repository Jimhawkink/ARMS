import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    Clipboard,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession,
    formatKES,
    maskPhone,
    normalizePhone,
    initiateSTKPush,
    pollSTKResult,
    initiateKCBPush,
    pollKCBResult,
    refreshTenantBalance,
    getLatestPayment,
    getTenantActivePenalties,
    TenantPenaltyInfo,
} from '../lib/supabase';
import { validateKenyanPhone, validateAmount, updateSessionBalance } from '../lib/security';

interface Props {
    session: TenantSession;
    onBack: () => void;
    onPaymentComplete: () => void;
}

type PayMode = 'self' | 'payForMe';
type PayMethod = 'KCB' | 'MPesa';
type PayStep = 'amount' | 'confirm' | 'processing' | 'success' | 'failed';

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    accent: '#10b981',
    neonGreen: '#00e676',
    danger: '#ef4444',
    gold: '#fbbf24',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
};

export default function PayRentScreen({ session, onBack, onPaymentComplete }: Props) {
    const [mode, setMode] = useState<PayMode>('self');
    const [step, setStep] = useState<PayStep>('amount');
    const [payMethod, setPayMethod] = useState<PayMethod>('KCB');
    const [amount, setAmount] = useState('');
    const [payerPhone, setPayerPhone] = useState('');
    const [balance, setBalance] = useState(session.balance);
    const [penaltyInfo, setPenaltyInfo] = useState<TenantPenaltyInfo>({
        totalPenalty: 0,
        penaltyDays: 0,
        penaltyDates: [],
        rateLabel: '10%',
    });
    const [processing, setProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState('');
    const [paidAmount, setPaidAmount] = useState(0);
    const [checkingSeconds, setCheckingSeconds] = useState(0);
    const [manualChecking, setManualChecking] = useState(false);
    const [copiedReceipt, setCopiedReceipt] = useState(false);

    // Payment method availability
    const [mpesaAvailable, setMpesaAvailable] = useState(false);
    const [kcbAvailable, setKcbAvailable] = useState(true);
    const [methodLoading, setMethodLoading] = useState(true);

    const cleanupRef = useRef<(() => void) | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const checkoutRef = useRef<string | null>(null);
    const paymentDoneRef = useRef(false);

    useEffect(() => {
        loadBalance();
        checkPaymentMethods();
        return () => {
            if (cleanupRef.current) cleanupRef.current();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const loadBalance = async () => {
        try {
            const [b, pen] = await Promise.all([
                refreshTenantBalance(session.tenant_id),
                getTenantActivePenalties(session.tenant_id),
            ]);
            setBalance(b);
            setPenaltyInfo(pen);
            const total = b + (pen?.totalPenalty || 0);
            if (total > 0 && !amount) {
                setAmount(String(Math.round(total)));
            }
        } catch (err) {
            console.error('loadBalance error:', err);
        }
    };

    const checkPaymentMethods = async () => {
        setMethodLoading(true);
        try {
            const res = await fetch(
                `https://arms-opal.vercel.app/api/unit-tills?location_id=${session.location_id}`,
                { headers: { Accept: 'application/json' } }
            );
            const data = await res.json();
            const till = data.unit_till;
            const hasMpesa = !!(till && (till.till_number || till.paybill_number));
            setMpesaAvailable(hasMpesa);
            setKcbAvailable(true);
            setPayMethod('KCB');
        } catch {
            setMpesaAvailable(false);
            setKcbAvailable(true);
            setPayMethod('KCB');
        } finally {
            setMethodLoading(false);
        }
    };

    const handleProceedToConfirm = () => {
        setError('');
        const amtCheck = validateAmount(amount);
        if (!amtCheck.valid) {
            setError(amtCheck.error || 'Please enter a valid payment amount');
            return;
        }
        if (mode === 'payForMe') {
            const phoneCheck = validateKenyanPhone(payerPhone);
            if (!phoneCheck.valid) {
                setError(phoneCheck.error || 'Please enter a valid Kenyan phone number');
                return;
            }
        }
        setStep('confirm');
    };

    const handlePayNow = async () => {
        setError('');
        setProcessing(true);
        setStep('processing');
        setStatusMsg('Initializing payment prompt...');
        paymentDoneRef.current = false;

        const phone = mode === 'self' ? session.phone : payerPhone;
        const normalized = normalizePhone(phone);
        if (!normalized) {
            setError('Please enter a valid phone number');
            setStep('amount');
            setProcessing(false);
            return;
        }
        const amtVal = Math.round(parseFloat(amount));

        setCheckingSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setCheckingSeconds(s => s + 1);
        }, 1000);

        // KCB BUNI PATH
        if (payMethod === 'KCB') {
            try {
                setStatusMsg('Sending KCB Buni STK push...');
                const initRes = await initiateKCBPush({
                    payerPhone: normalized,
                    amount: amtVal,
                    tenantId: session.tenant_id,
                    description: `Rent Unit ${session.unit_name}`,
                });

                if (!initRes || !initRes.checkoutRequestId) {
                    throw new Error(initRes?.error || 'Could not initiate KCB STK. Please retry.');
                }

                checkoutRef.current = initRes.checkoutRequestId;
                setStatusMsg('STK sent! Check your phone & enter PIN');

                cleanupRef.current = pollKCBResult({
                    checkoutRequestId: initRes.checkoutRequestId,
                    timeoutMs: 25000,
                    onConfirmed: async (receiptCode, confirmedAmount) => {
                        if (timerRef.current) clearInterval(timerRef.current);
                        paymentDoneRef.current = true;
                        setStatusMsg('Payment Confirmed!');
                        const [newBal, newPen] = await Promise.all([
                            refreshTenantBalance(session.tenant_id),
                            getTenantActivePenalties(session.tenant_id),
                        ]);
                        setBalance(newBal);
                        setPenaltyInfo(newPen);
                        await updateSessionBalance(newBal);
                        setReceipt(receiptCode || 'KCB-STK');
                        setPaidAmount(confirmedAmount || amtVal);
                        setStep('success');
                        setProcessing(false);
                    },
                    onFailed: (reason) => {
                        if (timerRef.current) clearInterval(timerRef.current);
                        setError(reason || 'Payment was cancelled or failed.');
                        setStep('failed');
                        setProcessing(false);
                    },
                    onTimeout: async () => {
                        if (timerRef.current) clearInterval(timerRef.current);
                        try {
                            const [latestPay, newBal] = await Promise.all([
                                getLatestPayment(session.tenant_id),
                                refreshTenantBalance(session.tenant_id),
                            ]);
                            if (latestPay && latestPay.amount > 0) {
                                setBalance(newBal);
                                await updateSessionBalance(newBal);
                                setReceipt(latestPay.mpesa_receipt || 'KCB-CONFIRMED');
                                setPaidAmount(latestPay.amount);
                                setStep('success');
                                setProcessing(false);
                                return;
                            }
                        } catch { /* ignore */ }

                        setError('Payment confirmation is taking slightly longer. If deducted from your account, tap "Check Status".');
                        setStep('failed');
                        setProcessing(false);
                    },
                });
            } catch (err: any) {
                if (timerRef.current) clearInterval(timerRef.current);
                setError(err.message || 'KCB push failed. Please try again.');
                setStep('failed');
                setProcessing(false);
            }
            return;
        }

        // M-PESA EXPRESS PATH
        try {
            setStatusMsg('Sending M-Pesa STK push prompt...');
            const initRes = await initiateSTKPush({
                payerPhone: normalized,
                amount: amtVal,
                tenantId: session.tenant_id,
                tenantPhone: session.phone || normalized,
                description: `Rent Unit ${session.unit_name}`,
            });

            if (!initRes || !initRes.checkoutRequestId) {
                throw new Error(initRes?.error || 'Could not initiate STK push.');
            }

            checkoutRef.current = initRes.checkoutRequestId;
            setStatusMsg('STK sent! Check your phone & enter PIN');

            cleanupRef.current = pollSTKResult({
                checkoutRequestId: initRes.checkoutRequestId,
                timeoutMs: 25000,
                onConfirmed: async (mpesaReceipt, confirmedAmount) => {
                    if (timerRef.current) clearInterval(timerRef.current);
                    paymentDoneRef.current = true;
                    setStatusMsg('Payment Confirmed!');
                    const [newBal, newPen] = await Promise.all([
                        refreshTenantBalance(session.tenant_id),
                        getTenantActivePenalties(session.tenant_id),
                    ]);
                    setBalance(newBal);
                    setPenaltyInfo(newPen);
                    await updateSessionBalance(newBal);
                    setReceipt(mpesaReceipt);
                    setPaidAmount(confirmedAmount || amtVal);
                    setStep('success');
                    setProcessing(false);
                },
                onFailed: (reason) => {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setError(reason || 'Payment cancelled or rejected.');
                    setStep('failed');
                    setProcessing(false);
                },
                onTimeout: async () => {
                    if (timerRef.current) clearInterval(timerRef.current);
                    try {
                        const [latestPay, newBal] = await Promise.all([
                            getLatestPayment(session.tenant_id),
                            refreshTenantBalance(session.tenant_id),
                        ]);
                        if (latestPay && latestPay.amount > 0) {
                            setBalance(newBal);
                            await updateSessionBalance(newBal);
                            setReceipt(latestPay.mpesa_receipt);
                            setPaidAmount(latestPay.amount);
                            setStep('success');
                            setProcessing(false);
                            return;
                        }
                    } catch { /* ignore */ }

                    setError('Payment confirmation is taking slightly longer. Check your M-Pesa SMS or tap "Check Status".');
                    setStep('failed');
                    setProcessing(false);
                },
            });
        } catch (err: any) {
            if (timerRef.current) clearInterval(timerRef.current);
            setError(err.message || 'Payment initiation failed.');
            setStep('failed');
            setProcessing(false);
        }
    };

    const handleManualCheck = async () => {
        if (!checkoutRef.current) {
            Alert.alert('Notice', 'No active payment session found. Please initiate a payment.');
            return;
        }
        setManualChecking(true);
        try {
            if (payMethod === 'KCB') {
                const res = await fetch('https://arms-opal.vercel.app/api/kcb/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        checkoutRequestId: checkoutRef.current,
                        tenantId: session.tenant_id,
                        amount: Math.round(parseFloat(amount)),
                    }),
                });
                const data = await res.json();
                if (res.ok && data?.success && data?.status === 'Completed') {
                    if (timerRef.current) clearInterval(timerRef.current);
                    paymentDoneRef.current = true;
                    const [newBal, newPen] = await Promise.all([
                        refreshTenantBalance(session.tenant_id),
                        getTenantActivePenalties(session.tenant_id),
                    ]);
                    setBalance(newBal);
                    setPenaltyInfo(newPen);
                    await updateSessionBalance(newBal);
                    setReceipt(data.receipt || 'KCB-STK');
                    setPaidAmount(data.amount || Math.round(parseFloat(amount)));
                    setStep('success');
                    setProcessing(false);
                    setManualChecking(false);
                    return;
                }
            } else {
                const res = await fetch(
                    `https://arms-opal.vercel.app/api/mpesa/stk-status?checkoutRequestId=${encodeURIComponent(checkoutRef.current)}`,
                    { headers: { Accept: 'application/json' } }
                );
                const data = await res.json();
                if (data?.confirmed) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    paymentDoneRef.current = true;
                    const [newBal, newPen] = await Promise.all([
                        refreshTenantBalance(session.tenant_id),
                        getTenantActivePenalties(session.tenant_id),
                    ]);
                    setBalance(newBal);
                    setPenaltyInfo(newPen);
                    await updateSessionBalance(newBal);
                    setReceipt(data.receipt || 'MPESA');
                    setPaidAmount(data.amount || Math.round(parseFloat(amount)));
                    setStep('success');
                    setProcessing(false);
                    setManualChecking(false);
                    return;
                }
            }

            // DB check fallback
            const latest = await getLatestPayment(session.tenant_id);
            if (latest && latest.amount > 0) {
                const newBal = await refreshTenantBalance(session.tenant_id);
                setBalance(newBal);
                setReceipt(latest.mpesa_receipt || 'CONFIRMED');
                setPaidAmount(latest.amount);
                setStep('success');
                setProcessing(false);
                setManualChecking(false);
                return;
            }

            Alert.alert('Still In Progress', 'Payment is still being processed by the telecom network. Please wait a few seconds and tap again.');
        } catch (e: any) {
            Alert.alert('Status Check', e.message || 'Could not verify status yet.');
        } finally {
            setManualChecking(false);
        }
    };

    const resetForNextPayment = () => {
        setStep('amount');
        setAmount('');
        setError('');
        setStatusMsg('');
        setReceipt('');
        setPaidAmount(0);
        setCheckingSeconds(0);
        setManualChecking(false);
        setPayMethod('KCB');
        checkoutRef.current = null;
        paymentDoneRef.current = false;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
        loadBalance();
    };

    const copyReceiptCode = () => {
        if (!receipt) return;
        Clipboard.setString(receipt);
        setCopiedReceipt(true);
        Alert.alert('Copied', `Receipt code ${receipt} copied.`);
        setTimeout(() => setCopiedReceipt(false), 2500);
    };

    const totalDue = balance + (penaltyInfo?.totalPenalty || 0);

const CONFETTI_COLORS = ['#10b981', '#00e676', '#fbbf24', '#f59e0b', '#38bdf8', '#a855f7', '#ec4899', '#ffffff'];

function FireworksBurst() {
    const particles = useRef(
        Array.from({ length: 36 }).map((_, i) => {
            const angle = (i / 36) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
            const dist = 70 + Math.random() * 120;
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
                    duration: 1400 + Math.random() * 400,
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

    // ─────────────────────────────────────────────────────────────
    // STEP: SUCCESS
    // ─────────────────────────────────────────────────────────────
    if (step === 'success') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Dashboard</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Payment Received</Text>
                        <Text style={styles.headerSub}>Transaction settled instantly</Text>
                    </View>
                </View>

                {/* Celebratory Fireworks Particle Burst */}
                <FireworksBurst />

                <ScrollView contentContainerStyle={styles.centerContent}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Text style={styles.successIconEmoji}>🎆</Text>
                        </View>
                        <Text style={styles.successTitle}>🎉 Payment Successful! 🎇</Text>
                        <Text style={styles.successSub}>
                            Your rent payment has been received and credited to your unit account balance.
                        </Text>

                        <View style={styles.successAmountBox}>
                            <Text style={styles.successAmountLabel}>AMOUNT SETTLED</Text>
                            <Text style={styles.successAmountValue}>{formatKES(paidAmount)}</Text>
                        </View>

                        <View style={styles.receiptBox}>
                            <Text style={styles.receiptBoxLabel}>OFFICIAL RECEIPT CODE</Text>
                            <TouchableOpacity onPress={copyReceiptCode} style={styles.receiptTouchRow}>
                                <Text style={styles.receiptCodeText}>{receipt || 'CONFIRMED'}</Text>
                                <Text style={styles.receiptCopyBadge}>
                                    {copiedReceipt ? '✓ Copied' : '❐ Copy'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.metaDivider} />

                        <View style={styles.successMetaRow}>
                            <Text style={styles.successMetaLabel}>Allocated Unit:</Text>
                            <Text style={styles.successMetaVal}>{session.unit_name}</Text>
                        </View>
                        <View style={styles.successMetaRow}>
                            <Text style={styles.successMetaLabel}>Remaining Balance:</Text>
                            <Text style={[styles.successMetaVal, { color: balance > 0 ? COLORS.danger : COLORS.neonGreen }]}>
                                {formatKES(balance)}
                            </Text>
                        </View>

                        <View style={styles.successActions}>
                            <TouchableOpacity
                                onPress={resetForNextPayment}
                                activeOpacity={0.85}
                                style={styles.repeatBtn}
                            >
                                <LinearGradient
                                    colors={['#10b981', '#059669']}
                                    style={styles.repeatBtnGrad}
                                >
                                    <Text style={styles.repeatBtnText}>💳 Make Another Payment</Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={onBack}
                                activeOpacity={0.75}
                                style={styles.doneBtn}
                            >
                                <Text style={styles.doneBtnText}>Return to Dashboard</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: PROCESSING (RADAR COUNTDOWN)
    // ─────────────────────────────────────────────────────────────
    if (step === 'processing') {
        const phone = mode === 'self' ? session.phone : payerPhone;
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={() => setStep('amount')} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Cancel</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>STK Push Sent</Text>
                        <Text style={styles.headerSub}>Awaiting M-Pesa PIN on phone</Text>
                    </View>
                </View>

                <View style={styles.processingContent}>
                    <View style={styles.radarCard}>
                        <View style={styles.radarOuterRing}>
                            <View style={styles.radarMiddleRing}>
                                <ActivityIndicator size="large" color="#10b981" />
                            </View>
                        </View>

                        <Text style={styles.radarTitle}>Check Your Phone Screen</Text>
                        <Text style={styles.radarDesc}>
                            An M-Pesa PIN prompt has been sent to{'\n'}
                            <Text style={styles.radarPhoneHighlight}>{maskPhone(phone)}</Text>
                        </Text>

                        <View style={styles.radarAmountPill}>
                            <Text style={styles.radarAmountText}>Paying {formatKES(parseFloat(amount))}</Text>
                        </View>

                        <Text style={styles.radarTimerText}>
                            Waiting for PIN input... {checkingSeconds}s
                        </Text>

                        <TouchableOpacity
                            onPress={handleManualCheck}
                            disabled={manualChecking}
                            style={styles.manualCheckBtn}
                        >
                            {manualChecking ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Text style={styles.manualCheckText}>🔍 Check If Payment Went Through</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setStep('amount')}
                            style={styles.cancelLinkBtn}
                        >
                            <Text style={styles.cancelLinkText}>Change Amount or Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: FAILED / DELAYED
    // ─────────────────────────────────────────────────────────────
    if (step === 'failed') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Dashboard</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Payment Notice</Text>
                        <Text style={styles.headerSub}>Verification details</Text>
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.centerContent}>
                    <View style={styles.failedCard}>
                        <View style={styles.failedIconCircle}>
                            <Text style={styles.failedIconEmoji}>⚠️</Text>
                        </View>
                        <Text style={styles.failedTitle}>Confirmation Status</Text>
                        <Text style={styles.failedDesc}>{error || 'Payment was not confirmed.'}</Text>

                        <TouchableOpacity
                            onPress={handleManualCheck}
                            disabled={manualChecking}
                            style={styles.failedCheckBtn}
                        >
                            {manualChecking ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Text style={styles.failedCheckText}>🔍 Check If Payment Went Through</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={resetForNextPayment}
                            style={styles.retryBtn}
                        >
                            <Text style={styles.retryBtnText}>🔄 Try Again</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onBack}
                            style={styles.failedBackLink}
                        >
                            <Text style={styles.failedBackLinkText}>← Back to Dashboard</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: CONFIRM INVOICE REVIEW
    // ─────────────────────────────────────────────────────────────
    if (step === 'confirm') {
        const phone = mode === 'self' ? session.phone : payerPhone;
        const amtVal = parseFloat(amount) || 0;
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={() => setStep('amount')} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Confirm Payment</Text>
                        <Text style={styles.headerSub}>Verify invoice & mobile prompt</Text>
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.confirmCard}>
                        <View style={styles.invoiceHeader}>
                            <Text style={styles.invoiceLabel}>PAYMENT SUMMARY</Text>
                            <View style={styles.secureBadge}>
                                <Text style={styles.secureBadgeText}>🔒 256-BIT ENCRYPTED</Text>
                            </View>
                        </View>

                        <View style={styles.confirmAmountHero}>
                            <Text style={styles.confirmAmountSub}>TOTAL AMOUNT</Text>
                            <Text style={styles.confirmAmountMain}>{formatKES(amtVal)}</Text>
                        </View>

                        <View style={styles.confirmDottedLine} />

                        <View style={styles.confirmRow}>
                            <Text style={styles.confirmRowLabel}>Tenant Name</Text>
                            <Text style={styles.confirmRowVal}>{session.tenant_name}</Text>
                        </View>

                        <View style={styles.confirmRow}>
                            <Text style={styles.confirmRowLabel}>Allocated Unit</Text>
                            <Text style={styles.confirmRowVal}>{session.unit_name} • {session.location_name}</Text>
                        </View>

                        <View style={styles.confirmRow}>
                            <Text style={styles.confirmRowLabel}>Payment Gateway</Text>
                            <Text style={[styles.confirmRowVal, { color: '#38bdf8' }]}>
                                {payMethod === 'KCB' ? 'KCB Buni M-Pesa Express' : 'Direct M-Pesa Till'}
                            </Text>
                        </View>

                        <View style={styles.confirmRow}>
                            <Text style={styles.confirmRowLabel}>Prompt Sent To</Text>
                            <Text style={[styles.confirmRowVal, { color: COLORS.neonGreen }]}>{maskPhone(phone)}</Text>
                        </View>

                        {penaltyInfo?.totalPenalty > 0 && (
                            <View style={styles.confirmPenaltyNotice}>
                                <Text style={styles.confirmPenaltyNoticeText}>
                                    Includes settlement for late rent penalty fee.
                                </Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        onPress={handlePayNow}
                        disabled={processing}
                        activeOpacity={0.85}
                        style={styles.payNowBtn}
                    >
                        <LinearGradient
                            colors={['#10b981', '#059669', '#047857']}
                            style={styles.payNowGrad}
                        >
                            <Text style={styles.payNowEmoji}>⚡</Text>
                            <Text style={styles.payNowText}>
                                Trigger STK Prompt ({formatKES(amtVal)})
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setStep('amount')} style={styles.editBackBtn}>
                        <Text style={styles.editBackBtnText}>Edit Amount or Phone</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // STEP: AMOUNT & NETWORK SELECTION (DEFAULT)
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
                    <Text style={styles.headerTitle}>Make Rent Payment</Text>
                    <Text style={styles.headerSub}>Instant STK push confirmation</Text>
                </View>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Balance & Due Hero Card */}
                    <View style={styles.balanceCard}>
                        <LinearGradient
                            colors={['#16213e', '#0f172a']}
                            style={styles.balanceGrad}
                        >
                            <Text style={styles.balanceCardLabel}>
                                {totalDue > 0 ? 'TOTAL OUTSTANDING DUE' : 'CURRENT BALANCE'}
                            </Text>
                            <Text style={[styles.balanceCardAmount, { color: totalDue > 0 ? COLORS.danger : COLORS.neonGreen }]}>
                                {formatKES(totalDue > 0 ? totalDue : 0)}
                            </Text>

                            {penaltyInfo?.totalPenalty > 0 && (
                                <View style={styles.penaltyAlertRow}>
                                    <View style={styles.penaltyTag}>
                                        <Text style={styles.penaltyTagText}>⚡ 10% Late Fee Applied</Text>
                                    </View>
                                    <Text style={styles.penaltyBreakdownText}>
                                        Rent: {formatKES(balance)} + Penalty: {formatKES(penaltyInfo.totalPenalty)}
                                    </Text>
                                </View>
                            )}
                        </LinearGradient>
                    </View>

                    {/* Payment Network Gateway Card */}
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>1. PAYMENT GATEWAY</Text>
                        <View style={styles.networkToggleRow}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => setPayMethod('KCB')}
                                style={[
                                    styles.networkBtn,
                                    payMethod === 'KCB' && styles.networkBtnActive,
                                ]}
                            >
                                <View style={styles.networkBtnTop}>
                                    <Text style={styles.networkEmoji}>🏦</Text>
                                    <View style={[styles.networkStatusDot, payMethod === 'KCB' && styles.networkStatusDotActive]} />
                                </View>
                                <Text style={styles.networkName}>KCB Buni</Text>
                                <Text style={styles.networkSub}>Instant STK Express</Text>
                                {payMethod === 'KCB' && (
                                    <View style={styles.activePill}>
                                        <Text style={styles.activePillText}>ACTIVE</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={mpesaAvailable ? 0.85 : 1}
                                onPress={() => mpesaAvailable && setPayMethod('MPesa')}
                                style={[
                                    styles.networkBtn,
                                    payMethod === 'MPesa' && styles.networkBtnActive,
                                    !mpesaAvailable && styles.networkBtnDisabled,
                                ]}
                            >
                                <View style={styles.networkBtnTop}>
                                    <Text style={styles.networkEmoji}>📱</Text>
                                    <View style={[styles.networkStatusDot, payMethod === 'MPesa' && styles.networkStatusDotActive]} />
                                </View>
                                <Text style={styles.networkName}>M-Pesa Direct</Text>
                                <Text style={styles.networkSub}>
                                    {mpesaAvailable ? 'Till / Paybill' : 'Not configured'}
                                </Text>
                                {payMethod === 'MPesa' && (
                                    <View style={styles.activePill}>
                                        <Text style={styles.activePillText}>ACTIVE</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Payer Mode Card */}
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>2. WHO IS PAYING?</Text>
                        <View style={styles.modeToggleRow}>
                            <TouchableOpacity
                                onPress={() => setMode('self')}
                                style={[styles.modeBtn, mode === 'self' && styles.modeBtnActive]}
                            >
                                <Text style={[styles.modeBtnText, mode === 'self' && styles.modeBtnTextActive]}>
                                    👤 My Phone ({maskPhone(session.phone)})
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setMode('payForMe')}
                                style={[styles.modeBtn, mode === 'payForMe' && styles.modeBtnActive]}
                            >
                                <Text style={[styles.modeBtnText, mode === 'payForMe' && styles.modeBtnTextActive]}>
                                    👥 Different Number
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {mode === 'payForMe' && (
                            <View style={styles.payerInputBox}>
                                <Text style={styles.payerInputLabel}>RECIPIENT M-PESA NUMBER</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={payerPhone}
                                    onChangeText={setPayerPhone}
                                    placeholder="e.g. 0712345678"
                                    placeholderTextColor={COLORS.textDim}
                                    keyboardType="phone-pad"
                                    maxLength={13}
                                />
                                <Text style={styles.payerInputSub}>
                                    Payment will still be credited to your unit ({session.unit_name}).
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Amount Input & Presets */}
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>3. PAYMENT AMOUNT (KES)</Text>
                        <View style={styles.amountInputWrap}>
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

                        {/* Presets Chips */}
                        <View style={styles.presetGrid}>
                            {totalDue > 0 && (
                                <TouchableOpacity
                                    onPress={() => setAmount(String(Math.round(totalDue)))}
                                    style={[styles.presetChip, styles.presetChipHighlight]}
                                >
                                    <Text style={styles.presetChipTextHighlight}>
                                        ⚡ Full Due: {formatKES(totalDue)}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {balance > 0 && totalDue !== balance && (
                                <TouchableOpacity
                                    onPress={() => setAmount(String(Math.round(balance)))}
                                    style={styles.presetChip}
                                >
                                    <Text style={styles.presetChipText}>
                                        Rent Only: {formatKES(balance)}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {session.monthly_rent ? (
                                <TouchableOpacity
                                    onPress={() => setAmount(String(Math.round(session.monthly_rent)))}
                                    style={styles.presetChip}
                                >
                                    <Text style={styles.presetChipText}>
                                        1 Month: {formatKES(session.monthly_rent)}
                                    </Text>
                                </TouchableOpacity>
                            ) : null}

                            {session.monthly_rent ? (
                                <TouchableOpacity
                                    onPress={() => setAmount(String(Math.round(session.monthly_rent / 2)))}
                                    style={styles.presetChip}
                                >
                                    <Text style={styles.presetChipText}>
                                        Half: {formatKES(session.monthly_rent / 2)}
                                    </Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    {/* Proceed Button */}
                    <TouchableOpacity
                        onPress={handleProceedToConfirm}
                        activeOpacity={0.85}
                        style={styles.proceedBtn}
                    >
                        <LinearGradient
                            colors={['#10b981', '#059669']}
                            style={styles.proceedGrad}
                        >
                            <Text style={styles.proceedBtnText}>Continue to Confirmation →</Text>
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
    balanceCard: {
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    balanceGrad: {
        padding: 20,
    },
    balanceCardLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    balanceCardAmount: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    penaltyAlertRow: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
    },
    penaltyTag: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        marginBottom: 4,
    },
    penaltyTagText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#fbbf24',
    },
    penaltyBreakdownText: {
        fontSize: 11,
        color: COLORS.textSub,
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
        fontSize: 11,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    networkToggleRow: {
        flexDirection: 'row',
        gap: 12,
    },
    networkBtn: {
        flex: 1,
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1.5,
        borderColor: COLORS.cardBorder,
    },
    networkBtnActive: {
        borderColor: COLORS.accent,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
    },
    networkBtnDisabled: {
        opacity: 0.4,
    },
    networkBtnTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    networkEmoji: {
        fontSize: 20,
    },
    networkStatusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.textDim,
    },
    networkStatusDotActive: {
        backgroundColor: COLORS.neonGreen,
    },
    networkName: {
        fontSize: 13,
        fontWeight: '900',
        color: COLORS.text,
        marginBottom: 2,
    },
    networkSub: {
        fontSize: 10,
        color: COLORS.textDim,
        fontWeight: '600',
    },
    activePill: {
        marginTop: 6,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    activePillText: {
        fontSize: 8,
        fontWeight: '900',
        color: COLORS.accent,
    },
    modeToggleRow: {
        flexDirection: 'row',
        gap: 8,
    },
    modeBtn: {
        flex: 1,
        backgroundColor: '#0a0f1d',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    modeBtnActive: {
        borderColor: COLORS.accent,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    modeBtnText: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '700',
    },
    modeBtnTextActive: {
        color: COLORS.text,
        fontWeight: '800',
    },
    payerInputBox: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.06)',
    },
    payerInputLabel: {
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
    payerInputSub: {
        fontSize: 10,
        color: COLORS.textDim,
        marginTop: 4,
    },
    amountInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        paddingHorizontal: 16,
        borderWidth: 1.5,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        marginBottom: 12,
    },
    kesPrefix: {
        fontSize: 18,
        fontWeight: '900',
        color: COLORS.textDim,
        marginRight: 10,
    },
    amountInput: {
        flex: 1,
        height: 52,
        fontSize: 26,
        fontWeight: '900',
        color: COLORS.neonGreen,
    },
    presetGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    presetChip: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: '#0a0f1d',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    presetChipHighlight: {
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        borderColor: 'rgba(245, 158, 11, 0.4)',
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
        letterSpacing: 0.2,
    },
    confirmCard: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        marginBottom: 20,
    },
    invoiceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    invoiceLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
    },
    secureBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    secureBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: COLORS.accent,
    },
    confirmAmountHero: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    confirmAmountSub: {
        fontSize: 10,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    confirmAmountMain: {
        fontSize: 34,
        fontWeight: '900',
        color: COLORS.neonGreen,
        letterSpacing: -0.5,
    },
    confirmDottedLine: {
        height: 1,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderStyle: 'dashed',
        marginVertical: 16,
    },
    confirmRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    confirmRowLabel: {
        fontSize: 12,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    confirmRowVal: {
        fontSize: 12,
        color: COLORS.text,
        fontWeight: '800',
    },
    confirmPenaltyNotice: {
        marginTop: 12,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        padding: 8,
        borderRadius: 8,
    },
    confirmPenaltyNoticeText: {
        fontSize: 10,
        color: '#fbbf24',
        fontWeight: '700',
        textAlign: 'center',
    },
    payNowBtn: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
    },
    payNowGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    payNowEmoji: {
        fontSize: 18,
    },
    payNowText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '900',
    },
    editBackBtn: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    editBackBtnText: {
        color: COLORS.textSub,
        fontSize: 12,
        fontWeight: '700',
    },
    processingContent: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
    },
    radarCard: {
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 26,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    radarOuterRing: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 18,
    },
    radarMiddleRing: {
        width: 66,
        height: 66,
        borderRadius: 33,
        backgroundColor: 'rgba(16, 185, 129, 0.18)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    radarTitle: {
        color: COLORS.text,
        fontSize: 19,
        fontWeight: '900',
        marginBottom: 8,
    },
    radarDesc: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    radarPhoneHighlight: {
        color: COLORS.neonGreen,
        fontWeight: '900',
        fontSize: 14,
    },
    radarAmountPill: {
        backgroundColor: '#0a0f1d',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        marginBottom: 14,
    },
    radarAmountText: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: '800',
    },
    radarTimerText: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 20,
    },
    manualCheckBtn: {
        width: '100%',
        backgroundColor: COLORS.accent,
        paddingVertical: 13,
        borderRadius: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    manualCheckText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
    cancelLinkBtn: {
        paddingVertical: 6,
    },
    cancelLinkText: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
    },
    successCard: {
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
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
        color: '#ffffff',
        fontSize: 32,
        fontWeight: '900',
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
    successAmountBox: {
        width: '100%',
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        padding: 14,
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    successAmountLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    successAmountValue: {
        fontSize: 26,
        fontWeight: '900',
        color: COLORS.neonGreen,
    },
    receiptBox: {
        width: '100%',
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    receiptBoxLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    receiptTouchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    receiptCodeText: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.6,
    },
    receiptCopyBadge: {
        fontSize: 11,
        color: COLORS.accent,
        fontWeight: '800',
    },
    metaDivider: {
        width: '100%',
        height: 1,
        backgroundColor: COLORS.cardBorder,
        marginBottom: 14,
    },
    successMetaRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    successMetaLabel: {
        fontSize: 12,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    successMetaVal: {
        fontSize: 12,
        color: COLORS.text,
        fontWeight: '800',
    },
    successActions: {
        width: '100%',
        gap: 10,
        marginTop: 18,
    },
    repeatBtn: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    repeatBtnGrad: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    repeatBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
    doneBtn: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    doneBtnText: {
        color: COLORS.textSub,
        fontSize: 12,
        fontWeight: '800',
    },
    failedCard: {
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
    },
    failedIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    failedIconEmoji: {
        fontSize: 30,
    },
    failedTitle: {
        color: COLORS.text,
        fontSize: 19,
        fontWeight: '900',
        marginBottom: 8,
    },
    failedDesc: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 20,
    },
    failedCheckBtn: {
        width: '100%',
        backgroundColor: COLORS.accent,
        paddingVertical: 13,
        borderRadius: 14,
        alignItems: 'center',
        marginBottom: 10,
    },
    failedCheckText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
    retryBtn: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        marginBottom: 12,
    },
    retryBtnText: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: '800',
    },
    failedBackLink: {
        paddingVertical: 6,
    },
    failedBackLinkText: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
    },
});
