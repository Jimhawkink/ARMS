import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, Alert, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession, formatKES, maskPhone, normalizePhone,
    initiateSTKPush, pollSTKResult, recordTenantPayment,
    refreshTenantBalance, getUnpaidBilling,
    isVacationMonth, getEffectiveRent, getVacationRent,
} from '../lib/supabase';
import { validateKenyanPhone, validateAmount, updateSessionBalance } from '../lib/security';

interface Props {
    session: TenantSession;
    onBack: () => void;
    onPaymentComplete: () => void;
}

type PayMode = 'self' | 'payForMe';
type PayStep = 'choose' | 'amount' | 'confirm' | 'processing' | 'success' | 'failed';

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', accent: '#10b981', danger: '#ef4444',
    gold: '#f59e0b', text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
};

export default function PayRentScreen({ session, onBack, onPaymentComplete }: Props) {
    const [mode, setMode] = useState<PayMode>('self');
    const [step, setStep] = useState<PayStep>('choose');
    const [amount, setAmount] = useState('');
    const [payerPhone, setPayerPhone] = useState('');
    const [balance, setBalance] = useState(session.balance);
    const [processing, setProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState('');
    const [paidAmount, setPaidAmount] = useState(0);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        loadBalance();
        return () => { if (cleanupRef.current) cleanupRef.current(); };
    }, []);

    const loadBalance = async () => {
        const b = await refreshTenantBalance(session.tenant_id);
        setBalance(b);
    };

    const handleSelectMode = (m: PayMode) => {
        setMode(m);
        setStep('amount');
        setError('');
        if (m === 'self') setPayerPhone(session.phone);
        else setPayerPhone('');
    };

    const handleProceedToConfirm = () => {
        const { valid: amtValid, value: amtVal, error: amtErr } = validateAmount(amount);
        if (!amtValid) { setError(amtErr || 'Invalid amount'); return; }

        const phone = mode === 'self' ? session.phone : payerPhone;
        const { valid: phValid, error: phErr } = validateKenyanPhone(phone);
        if (!phValid) { setError(phErr || 'Invalid phone'); return; }

        setError('');
        setStep('confirm');
    };

    const handlePayNow = async () => {
        setStep('processing');
        setProcessing(true);
        setStatusMsg('Sending M-Pesa prompt…');
        setError('');

        const phone = mode === 'self' ? session.phone : payerPhone;
        const amtVal = Math.round(parseFloat(amount));
        const desc = `Rent - ${session.tenant_name} - ${session.unit_name}`;

        try {
            const { checkoutRequestId, error: stkErr } = await initiateSTKPush({
                payerPhone: phone,
                amount: amtVal,
                tenantId: session.tenant_id,
                tenantPhone: session.phone,
                description: desc,
            });

            if (stkErr || !checkoutRequestId) {
                setStep('failed');
                setError(stkErr || 'STK Push failed');
                setProcessing(false);
                return;
            }

            setStatusMsg('Waiting for payment confirmation…\nCheck your phone for the M-Pesa prompt');

            cleanupRef.current = pollSTKResult({
                checkoutRequestId,
                timeoutMs: 65000,
                onConfirmed: async (mpesaReceipt, confirmedAmount) => {
                    setStatusMsg('Payment received! Recording…');
                    const finalAmt = confirmedAmount || amtVal;

                    const result = await recordTenantPayment({
                        tenantId: session.tenant_id,
                        locationId: session.location_id,
                        amount: finalAmt,
                        mpesaReceipt,
                        payerPhone: phone,
                        payerName: session.tenant_name,
                        checkoutRequestId,
                        billingMonth: new Date().toISOString().slice(0, 7),
                    });

                    if (result.success) {
                        setReceipt(mpesaReceipt);
                        setPaidAmount(finalAmt);
                        const newBal = await refreshTenantBalance(session.tenant_id);
                        setBalance(newBal);
                        await updateSessionBalance(newBal);
                        setStep('success');
                    } else {
                        setError(result.error || 'Failed to record');
                        setStep('failed');
                    }
                    setProcessing(false);
                },
                onFailed: (reason) => {
                    setError(reason || 'Payment was cancelled');
                    setStep('failed');
                    setProcessing(false);
                },
                onTimeout: () => {
                    setError('Payment timed out. If you paid, it will reflect shortly.');
                    setStep('failed');
                    setProcessing(false);
                },
            });
        } catch (err: any) {
            setError(err.message || 'Network error');
            setStep('failed');
            setProcessing(false);
        }
    };

    const resetFlow = () => {
        setStep('choose');
        setAmount('');
        setPayerPhone('');
        setError('');
        setReceipt('');
        setPaidAmount(0);
        if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    };

    // ── RENDER ──

    // Step: Choose mode
    if (step === 'choose') {
        return (
            <View style={s.container}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <Header title="💳 Pay Rent" sub="Choose payment method" onBack={onBack} />
                <ScrollView contentContainerStyle={s.content}>
                    <View style={s.balanceCard}>
                        <Text style={s.balLabel}>Outstanding Balance</Text>
                        <Text style={[s.balValue, { color: balance > 0 ? C.danger : C.accent }]}>
                            {formatKES(balance)}
                        </Text>
                        {session.is_on_vacation && isVacationMonth() && (
                            <Text style={s.vacationTag}>🏖️ Vacation Mode • Half-rent: {formatKES(getVacationRent(session.monthly_rent))}</Text>
                        )}
                    </View>

                    <TouchableOpacity onPress={() => handleSelectMode('self')} activeOpacity={0.85}>
                        <LinearGradient colors={['#10b981', '#059669']} style={s.modeCard}>
                            <Text style={s.modeEmoji}>📱</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.modeTitle}>Pay with My Number</Text>
                                <Text style={s.modeSub}>STK push to {maskPhone(session.phone)}</Text>
                            </View>
                            <Text style={s.modeArrow}>→</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleSelectMode('payForMe')} activeOpacity={0.85}>
                        <LinearGradient colors={['#6366f1', '#4f46e5']} style={s.modeCard}>
                            <Text style={s.modeEmoji}>🤝</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.modeTitle}>Someone Else Pays</Text>
                                <Text style={s.modeSub}>Enter payer's phone — credited to YOU</Text>
                            </View>
                            <Text style={s.modeArrow}>→</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={s.infoBox}>
                        <Text style={s.infoIcon}>🔒</Text>
                        <Text style={s.infoText}>
                            Payments are processed securely via M-Pesa.{'\n'}
                            All payments are credited to your account regardless of who pays.
                        </Text>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // Step: Enter amount (+ payer phone if pay-for-me)
    if (step === 'amount') {
        return (
            <View style={s.container}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <Header
                    title={mode === 'self' ? '📱 Self Pay' : '🤝 Pay For Me'}
                    sub="Enter payment details"
                    onBack={() => setStep('choose')}
                />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={s.content}>
                        <View style={s.balanceCard}>
                            <Text style={s.balLabel}>Balance Due</Text>
                            <Text style={[s.balValue, { color: C.danger }]}>{formatKES(balance)}</Text>
                            {session.is_on_vacation && isVacationMonth() && (
                                <Text style={s.vacationTag}>🏖️ Vacation rent: {formatKES(getEffectiveRent(session))} (50% off)</Text>
                            )}
                        </View>

                        {mode === 'payForMe' && (
                            <View style={s.inputGroup}>
                                <Text style={s.inputLabel}>📞 Payer's Phone Number</Text>
                                <TextInput
                                    style={s.input}
                                    value={payerPhone}
                                    onChangeText={setPayerPhone}
                                    placeholder="e.g. 0712345678"
                                    placeholderTextColor={C.dim}
                                    keyboardType="phone-pad"
                                    maxLength={13}
                                />
                                <Text style={s.inputHint}>
                                    This person will receive the M-Pesa prompt
                                </Text>
                            </View>
                        )}

                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>💰 Payment Amount (KES)</Text>
                            <TextInput
                                style={[s.input, s.amountInput]}
                                value={amount}
                                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                                placeholder="Enter amount"
                                placeholderTextColor={C.dim}
                                keyboardType="numeric"
                                maxLength={7}
                            />
                            <TouchableOpacity onPress={() => setAmount(String(Math.round(balance)))} style={s.quickBtn}>
                                <Text style={s.quickBtnText}>💡 Pay full balance: {formatKES(balance)}</Text>
                            </TouchableOpacity>
                        </View>

                        {error ? (
                            <View style={s.errorBox}><Text style={s.errorText}>⚠️ {error}</Text></View>
                        ) : null}

                        <TouchableOpacity onPress={handleProceedToConfirm} activeOpacity={0.85}>
                            <LinearGradient colors={[C.accent, '#059669']} style={s.proceedBtn}>
                                <Text style={s.proceedBtnText}>Continue →</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        );
    }

    // Step: Confirm
    if (step === 'confirm') {
        const phone = mode === 'self' ? session.phone : payerPhone;
        return (
            <View style={s.container}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <Header title="✅ Confirm Payment" sub="Review details" onBack={() => setStep('amount')} />
                <ScrollView contentContainerStyle={s.content}>
                    <View style={s.confirmCard}>
                        <ConfirmRow label="Tenant" value={session.tenant_name} emoji="👤" />
                        <ConfirmRow label="Room" value={`${session.unit_name} • ${session.location_name}`} emoji="🏠" />
                        <ConfirmRow label="Amount" value={formatKES(parseFloat(amount))} emoji="💰" highlight />
                        <ConfirmRow label="STK Push To" value={maskPhone(phone)} emoji="📱" />
                        {mode === 'payForMe' && (
                            <View style={s.creditNote}>
                                <Text style={s.creditNoteText}>
                                    ✅ Payment will be <Text style={{ fontWeight: '900' }}>credited to {session.tenant_name}'s account</Text>, not the payer's
                                </Text>
                            </View>
                        )}
                        <ConfirmRow label="Method" value="M-Pesa STK Push" emoji="📲" />
                    </View>

                    <TouchableOpacity onPress={handlePayNow} activeOpacity={0.85}>
                        <LinearGradient colors={['#10b981', '#059669', '#047857']} style={s.payNowBtn}>
                            <Text style={s.payNowEmoji}>🚀</Text>
                            <Text style={s.payNowText}>Pay {formatKES(parseFloat(amount))} Now</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setStep('amount')} style={s.cancelLink}>
                        <Text style={s.cancelText}>← Go Back</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // Step: Processing
    if (step === 'processing') {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <View style={s.processingCard}>
                    <ActivityIndicator size="large" color={C.accent} />
                    <Text style={s.processingTitle}>Processing Payment</Text>
                    <Text style={s.processingMsg}>{statusMsg}</Text>
                    <Text style={s.processingHint}>Do NOT close this screen</Text>
                </View>
            </View>
        );
    }

    // Step: Success
    if (step === 'success') {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <View style={s.resultCard}>
                    <Text style={s.resultEmoji}>🎉</Text>
                    <Text style={s.resultTitle}>Payment Successful!</Text>
                    <View style={s.resultRow}><Text style={s.resultLabel}>Amount</Text><Text style={s.resultValue}>{formatKES(paidAmount)}</Text></View>
                    <View style={s.resultRow}><Text style={s.resultLabel}>M-Pesa Receipt</Text><Text style={s.resultValue}>{receipt}</Text></View>
                    <View style={s.resultRow}><Text style={s.resultLabel}>New Balance</Text><Text style={[s.resultValue, { color: balance > 0 ? C.danger : C.accent }]}>{formatKES(balance)}</Text></View>
                    <TouchableOpacity onPress={() => { resetFlow(); onPaymentComplete(); }} activeOpacity={0.85}>
                        <LinearGradient colors={[C.primary, '#4f46e5']} style={s.doneBtn}>
                            <Text style={s.doneBtnText}>✅ Back to Dashboard</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Step: Failed
    return (
        <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <View style={s.resultCard}>
                <Text style={s.resultEmoji}>❌</Text>
                <Text style={[s.resultTitle, { color: C.danger }]}>Payment Failed</Text>
                <Text style={s.failMsg}>{error || 'Transaction was not completed'}</Text>
                <TouchableOpacity onPress={resetFlow} activeOpacity={0.85}>
                    <LinearGradient colors={[C.primary, '#4f46e5']} style={s.doneBtn}>
                        <Text style={s.doneBtnText}>🔄 Try Again</Text>
                    </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={onBack} style={s.cancelLink}>
                    <Text style={s.cancelText}>← Back to Dashboard</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ── Sub-components ──

function Header({ title, sub, onBack }: { title: string; sub: string; onBack: () => void }) {
    return (
        <LinearGradient colors={['#4f46e5', '#6366f1']} style={s.header}>
            <TouchableOpacity onPress={onBack} style={s.backBtn}>
                <Text style={s.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>{title}</Text>
            <Text style={s.headerSub}>{sub}</Text>
        </LinearGradient>
    );
}

function ConfirmRow({ label, value, emoji, highlight }: { label: string; value: string; emoji: string; highlight?: boolean }) {
    return (
        <View style={s.confirmRow}>
            <Text style={s.confirmEmoji}>{emoji}</Text>
            <Text style={s.confirmLabel}>{label}</Text>
            <Text style={[s.confirmValue, highlight && { color: '#10b981', fontWeight: '900', fontSize: 16 }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40 },
    header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16 },
    backBtn: { marginBottom: 8 },
    backText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
    headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    balanceCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
    balLabel: { fontSize: 11, color: C.sub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    balValue: { fontSize: 28, fontWeight: '900' },
    vacationTag: { fontSize: 11, color: '#fdba74', fontWeight: '700', marginTop: 6, textAlign: 'center' },
    modeCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 18, marginBottom: 12, overflow: 'hidden' },
    modeEmoji: { fontSize: 28 },
    modeTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
    modeSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    modeArrow: { fontSize: 20, color: '#fff', fontWeight: '700' },
    infoBox: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' },
    infoIcon: { fontSize: 16 },
    infoText: { flex: 1, fontSize: 11, color: C.sub, lineHeight: 18 },
    inputGroup: { marginBottom: 16 },
    inputLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 8 },
    input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text, fontWeight: '600' },
    amountInput: { fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
    inputHint: { fontSize: 10, color: C.dim, marginTop: 6 },
    quickBtn: { backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
    quickBtnText: { fontSize: 12, color: C.accent, fontWeight: '700', textAlign: 'center' },
    errorBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
    errorText: { fontSize: 12, color: C.danger, fontWeight: '600' },
    proceedBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    proceedBtnText: { fontSize: 16, fontWeight: '900', color: '#fff' },
    confirmCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, marginBottom: 20, overflow: 'hidden' },
    confirmRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    confirmEmoji: { fontSize: 16, width: 30 },
    confirmLabel: { fontSize: 12, color: C.sub, fontWeight: '600', flex: 1 },
    confirmValue: { fontSize: 13, color: C.text, fontWeight: '700', textAlign: 'right', flex: 1.2 },
    creditNote: { backgroundColor: 'rgba(16,185,129,0.1)', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    creditNoteText: { fontSize: 11, color: C.accent, lineHeight: 18, textAlign: 'center' },
    payNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, paddingVertical: 18 },
    payNowEmoji: { fontSize: 20 },
    payNowText: { fontSize: 18, fontWeight: '900', color: '#fff' },
    cancelLink: { alignItems: 'center', paddingVertical: 16 },
    cancelText: { fontSize: 13, color: C.dim, fontWeight: '600' },
    processingCard: { backgroundColor: C.card, borderRadius: 24, padding: 40, alignItems: 'center', gap: 16, marginHorizontal: 24, borderWidth: 1, borderColor: C.border },
    processingTitle: { fontSize: 18, fontWeight: '900', color: C.text },
    processingMsg: { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },
    processingHint: { fontSize: 11, color: C.gold, fontWeight: '700' },
    resultCard: { backgroundColor: C.card, borderRadius: 24, padding: 32, alignItems: 'center', gap: 12, marginHorizontal: 24, borderWidth: 1, borderColor: C.border },
    resultEmoji: { fontSize: 50 },
    resultTitle: { fontSize: 20, fontWeight: '900', color: C.accent },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    resultLabel: { fontSize: 12, color: C.sub, fontWeight: '600' },
    resultValue: { fontSize: 13, color: C.text, fontWeight: '800' },
    failMsg: { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },
    doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
    doneBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
