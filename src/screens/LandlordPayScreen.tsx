import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, StatusBar,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    StaffSession, TenantSearchResult, formatKES, maskPhone,
    initiateSTKPush, pollSTKResult, refreshTenantBalance,
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

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', accent: '#10b981', danger: '#ef4444',
    gold: '#f59e0b', text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
    purple: '#8b5cf6',
};

function Row({ emoji, label, value, highlight }: {
    emoji: string; label: string; value: string; highlight?: boolean;
}) {
    return (
        <View style={s.confirmRow}>
            <Text style={s.rowEmoji}>{emoji}</Text>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={[s.rowValue, highlight && { color: C.accent, fontWeight: '900', fontSize: 16 }]}>
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
    const [error, setError] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [receipt, setReceipt] = useState('');
    const [paidAmount, setPaidAmount] = useState(0);
    const [confirmedBalance, setConfirmedBalance] = useState(0);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        refreshTenantBalance(tenant.tenant_id).then(b => {
            setFreshBalance(b);
        });
        return () => { if (cleanupRef.current) cleanupRef.current(); };
    }, []);

    const effectivePhone = phoneMode === 'registered' ? tenant.phone : customPhone;

    const handleProceed = () => {
        const { valid: amtValid, error: amtErr } = validateAmount(amount);
        if (!amtValid) { setError(amtErr || 'Invalid amount'); return; }

        const { valid: phValid, error: phErr } = validateKenyanPhone(effectivePhone);
        if (!phValid) { setError(phErr || 'Invalid phone number'); return; }

        setError('');
        setStep('confirm');
    };

    const handlePayNow = async () => {
        setStep('processing');
        setStatusMsg('Sending M-Pesa prompt to tenant…');

        const amtVal = Math.round(parseFloat(amount));
        const desc = `Rent - ${tenant.tenant_name} - ${tenant.unit_name} (via Landlord)`;

        try {
            const { checkoutRequestId, error: stkErr, tillNotConfigured } = await initiateSTKPush({
                payerPhone: effectivePhone,
                amount: amtVal,
                tenantId: tenant.tenant_id,
                tenantPhone: tenant.phone,
                description: desc,
            });

            if (stkErr || !checkoutRequestId) {
                setStep('failed');
                setError(stkErr || 'STK Push failed');
                return;
            }

            setStatusMsg('Waiting for tenant to enter M-Pesa PIN…\nCheck tenant\'s phone for the prompt.');

            cleanupRef.current = pollSTKResult({
                checkoutRequestId,
                timeoutMs: 70000,
                onConfirmed: async (mpesaReceipt, confirmedAmt) => {
                    const finalAmt = confirmedAmt || amtVal;
                    setReceipt(mpesaReceipt);
                    setPaidAmount(finalAmt);
                    const newBal = await refreshTenantBalance(tenant.tenant_id);
                    setConfirmedBalance(newBal);
                    setStep('success');
                },
                onFailed: (reason) => {
                    setError(reason || 'Payment was cancelled or failed');
                    setStep('failed');
                },
                onTimeout: () => {
                    setError('Payment timed out. If the tenant paid, it will reflect shortly.');
                    setStep('failed');
                },
            });
        } catch (err: any) {
            setError(err.message || 'Network error');
            setStep('failed');
        }
    };

    const reset = () => {
        setStep('details');
        setError('');
        setReceipt('');
        setPaidAmount(0);
        if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    };

    const initials = tenant.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    // ── STEP: DETAILS ─────────────────────────────────────────
    if (step === 'details') {
        return (
            <View style={s.container}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <LinearGradient colors={['#4f46e5', '#7c3aed']} style={s.header}>
                    <TouchableOpacity onPress={onBack} style={s.backBtn}>
                        <Text style={s.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>💳 Collect Rent</Text>
                    <Text style={s.headerSub}>Landlord STK Push · M-Pesa</Text>
                </LinearGradient>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

                        {/* Tenant Info Card */}
                        <LinearGradient colors={['#1e293b', '#334155']} style={s.tenantCard}>
                            <LinearGradient colors={['#4f46e5', '#7c3aed']} style={s.tenantAvatar}>
                                <Text style={s.tenantAvatarText}>{initials}</Text>
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                                <Text style={s.tenantName}>{tenant.tenant_name}</Text>
                                <Text style={s.tenantSub}>📞 {tenant.phone || 'N/A'}</Text>
                                <Text style={s.tenantSub}>🏠 {tenant.unit_name}  ·  📍 {tenant.location_name}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={s.balLabel}>Balance</Text>
                                <Text style={[s.balValue, { color: freshBalance > 0 ? C.danger : C.accent }]}>
                                    {formatKES(freshBalance)}
                                </Text>
                            </View>
                        </LinearGradient>

                        {/* Phone selector */}
                        <Text style={s.sectionLabel}>📱 Send STK Prompt To</Text>
                        <View style={s.phoneModeRow}>
                            <TouchableOpacity
                                style={[s.phoneModeBtn, phoneMode === 'registered' && s.phoneModeBtnActive]}
                                onPress={() => setPhoneMode('registered')}
                            >
                                <Text style={[s.phoneModeBtnText, phoneMode === 'registered' && s.phoneModeBtnTextActive]}>
                                    Tenant's Phone
                                </Text>
                                {phoneMode === 'registered' && (
                                    <Text style={s.phoneModeVal}>{maskPhone(tenant.phone)}</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.phoneModeBtn, phoneMode === 'custom' && s.phoneModeBtnActive]}
                                onPress={() => setPhoneMode('custom')}
                            >
                                <Text style={[s.phoneModeBtnText, phoneMode === 'custom' && s.phoneModeBtnTextActive]}>
                                    Other Phone
                                </Text>
                                <Text style={s.phoneModeHint}>Parent / Relative</Text>
                            </TouchableOpacity>
                        </View>

                        {phoneMode === 'custom' && (
                            <View style={s.inputGroup}>
                                <Text style={s.inputLabel}>📞 Custom Phone Number</Text>
                                <TextInput
                                    style={s.input}
                                    value={customPhone}
                                    onChangeText={setCustomPhone}
                                    placeholder="e.g. 0712345678"
                                    placeholderTextColor={C.dim}
                                    keyboardType="phone-pad"
                                    maxLength={13}
                                    autoFocus
                                />
                                <Text style={s.inputHint}>
                                    This phone will receive the M-Pesa prompt. Payment still credited to {tenant.tenant_name}.
                                </Text>
                            </View>
                        )}

                        {/* Amount */}
                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>💰 Amount to Collect (KES)</Text>
                            <TextInput
                                style={[s.input, s.amountInput]}
                                value={amount}
                                onChangeText={t => setAmount(t.replace(/[^0-9]/g, ''))}
                                placeholder="Enter amount"
                                placeholderTextColor={C.dim}
                                keyboardType="numeric"
                                maxLength={7}
                            />
                            {freshBalance > 0 && (
                                <TouchableOpacity
                                    style={s.quickBtn}
                                    onPress={() => setAmount(String(Math.round(freshBalance)))}
                                >
                                    <Text style={s.quickBtnText}>
                                        💡 Collect full balance: {formatKES(freshBalance)}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Info note */}
                        <View style={s.infoBox}>
                            <Text style={s.infoIcon}>🔒</Text>
                            <Text style={s.infoText}>
                                The M-Pesa prompt will be sent to the selected phone.
                                The tenant must enter their M-Pesa PIN to complete payment.
                                Payment is credited directly to {tenant.tenant_name}'s account.
                            </Text>
                        </View>

                        {error ? (
                            <View style={s.errorBox}>
                                <Text style={s.errorText}>⚠️ {error}</Text>
                            </View>
                        ) : null}

                        <TouchableOpacity onPress={handleProceed} activeOpacity={0.85}>
                            <LinearGradient colors={[C.accent, C.primary]} style={s.proceedBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                <Text style={s.proceedBtnText}>Review & Confirm →</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        );
    }

    // ── STEP: CONFIRM ─────────────────────────────────────────
    if (step === 'confirm') {
        return (
            <View style={s.container}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <LinearGradient colors={['#4f46e5', '#7c3aed']} style={s.header}>
                    <TouchableOpacity onPress={() => setStep('details')} style={s.backBtn}>
                        <Text style={s.backText}>← Edit</Text>
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>✅ Confirm Collection</Text>
                    <Text style={s.headerSub}>Review before sending prompt</Text>
                </LinearGradient>
                <ScrollView contentContainerStyle={s.content}>
                    <View style={s.confirmCard}>
                        <Row emoji="👤" label="Tenant"     value={tenant.tenant_name} />
                        <Row emoji="🏠" label="Room"       value={`${tenant.unit_name} · ${tenant.location_name}`} />
                        <Row emoji="💰" label="Amount"     value={formatKES(parseFloat(amount))} highlight />
                        <Row emoji="📱" label="STK To"     value={maskPhone(effectivePhone)} />
                        {phoneMode === 'custom' && (
                            <View style={s.creditNote}>
                                <Text style={s.creditNoteText}>
                                    ✅ Payment credited to <Text style={{ fontWeight: '900' }}>{tenant.tenant_name}'s account</Text>, not the payer's number
                                </Text>
                            </View>
                        )}
                        <Row emoji="🏛️" label="Initiated By" value={`Landlord: ${staff.staff_name}`} />
                        <Row emoji="📲" label="Method"     value="M-Pesa STK Push" />
                    </View>

                    <TouchableOpacity onPress={handlePayNow} activeOpacity={0.85}>
                        <LinearGradient colors={['#10b981', '#059669', '#047857']} style={s.payNowBtn}>
                            <Text style={{ fontSize: 22 }}>🚀</Text>
                            <Text style={s.payNowText}>Send STK Prompt</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setStep('details')} style={s.cancelLink}>
                        <Text style={s.cancelText}>← Go Back</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // ── STEP: PROCESSING ──────────────────────────────────────
    if (step === 'processing') {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <View style={s.resultCard}>
                    <ActivityIndicator size="large" color={C.accent} />
                    <Text style={s.processingTitle}>Awaiting Payment</Text>
                    <Text style={s.processingMsg}>{statusMsg}</Text>
                    <View style={s.processingTenantChip}>
                        <Text style={s.processingTenantText}>👤 {tenant.tenant_name}</Text>
                        <Text style={s.processingTenantText}>💰 {formatKES(parseFloat(amount))}</Text>
                    </View>
                    <Text style={s.processingHint}>⚠️ Do NOT close this screen</Text>
                </View>
            </View>
        );
    }

    // ── STEP: SUCCESS ─────────────────────────────────────────
    if (step === 'success') {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <View style={s.resultCard}>
                    <Text style={{ fontSize: 52 }}>🎉</Text>
                    <Text style={s.successTitle}>Payment Received!</Text>
                    <View style={s.resultRows}>
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>Tenant</Text>
                            <Text style={s.resultValue}>{tenant.tenant_name}</Text>
                        </View>
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>Amount Paid</Text>
                            <Text style={[s.resultValue, { color: C.accent }]}>{formatKES(paidAmount)}</Text>
                        </View>
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>M-Pesa Receipt</Text>
                            <Text style={[s.resultValue, { color: C.gold }]}>{receipt}</Text>
                        </View>
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>New Balance</Text>
                            <Text style={[s.resultValue, { color: confirmedBalance > 0 ? C.danger : C.accent }]}>
                                {formatKES(confirmedBalance)}
                            </Text>
                        </View>
                        <View style={s.resultRow}>
                            <Text style={s.resultLabel}>Collected By</Text>
                            <Text style={s.resultValue}>{staff.staff_name}</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => { reset(); onPaymentComplete(); }} activeOpacity={0.85}>
                        <LinearGradient colors={[C.primary, '#4f46e5']} style={s.doneBtn}>
                            <Text style={s.doneBtnText}>✅ Done — Back to Search</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ── STEP: FAILED ──────────────────────────────────────────
    return (
        <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <View style={s.resultCard}>
                <Text style={{ fontSize: 52 }}>❌</Text>
                <Text style={s.failTitle}>Payment Failed</Text>
                <Text style={s.failMsg}>{error || 'Transaction was not completed'}</Text>
                <TouchableOpacity onPress={reset} activeOpacity={0.85}>
                    <LinearGradient colors={[C.accent, '#059669']} style={s.doneBtn}>
                        <Text style={s.doneBtnText}>🔄 Try Again</Text>
                    </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={onBack} style={s.cancelLink}>
                    <Text style={s.cancelText}>← Back to Tenant</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16 },
    backBtn: { marginBottom: 8 },
    backText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
    headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    content: { padding: 16, paddingBottom: 48 },

    tenantCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 18, padding: 16, marginBottom: 20,
        borderWidth: 1, borderColor: C.border,
    },
    tenantAvatar: {
        width: 50, height: 50, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    tenantAvatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
    tenantName: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 3 },
    tenantSub: { fontSize: 11, color: C.sub, marginBottom: 1 },
    balLabel: { fontSize: 9, color: C.dim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    balValue: { fontSize: 15, fontWeight: '900' },

    sectionLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },

    phoneModeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    phoneModeBtn: {
        flex: 1, backgroundColor: C.card, borderRadius: 14,
        borderWidth: 1, borderColor: C.border,
        padding: 12, alignItems: 'center',
    },
    phoneModeBtnActive: {
        backgroundColor: 'rgba(99,102,241,0.15)',
        borderColor: C.primary,
    },
    phoneModeBtnText: { fontSize: 12, fontWeight: '700', color: C.sub },
    phoneModeBtnTextActive: { color: '#a5b4fc' },
    phoneModeVal: { fontSize: 10, color: C.gold, marginTop: 3, fontWeight: '700' },
    phoneModeHint: { fontSize: 9, color: C.dim, marginTop: 3 },

    inputGroup: { marginBottom: 16 },
    inputLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 8 },
    input: {
        backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 15, color: C.text, fontWeight: '600',
    },
    amountInput: { fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
    inputHint: { fontSize: 10, color: C.dim, marginTop: 6, lineHeight: 15 },
    quickBtn: {
        backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 10,
        padding: 10, marginTop: 8,
        borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
    },
    quickBtnText: { fontSize: 12, color: C.accent, fontWeight: '700', textAlign: 'center' },

    infoBox: {
        flexDirection: 'row', gap: 10,
        backgroundColor: 'rgba(99,102,241,0.08)',
        borderRadius: 14, padding: 14, marginBottom: 16,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
    },
    infoIcon: { fontSize: 16 },
    infoText: { flex: 1, fontSize: 11, color: C.sub, lineHeight: 18 },

    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12,
        padding: 12, marginBottom: 12,
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    },
    errorText: { fontSize: 12, color: C.danger, fontWeight: '600' },

    proceedBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
    proceedBtnText: { fontSize: 16, fontWeight: '900', color: '#fff' },

    // Confirm
    confirmCard: {
        backgroundColor: C.card, borderRadius: 18,
        borderWidth: 1, borderColor: C.border,
        marginBottom: 20, overflow: 'hidden',
    },
    confirmRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    rowEmoji: { fontSize: 16, width: 28 },
    rowLabel: { fontSize: 12, color: C.sub, fontWeight: '600', flex: 1 },
    rowValue: { fontSize: 13, color: C.text, fontWeight: '700', textAlign: 'right', flex: 1.2 },
    creditNote: {
        backgroundColor: 'rgba(16,185,129,0.08)', padding: 12,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    creditNoteText: { fontSize: 11, color: C.accent, lineHeight: 17, textAlign: 'center' },
    payNowBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, borderRadius: 18, paddingVertical: 18, marginBottom: 12,
    },
    payNowText: { fontSize: 18, fontWeight: '900', color: '#fff' },
    cancelLink: { alignItems: 'center', paddingVertical: 14 },
    cancelText: { fontSize: 13, color: C.dim, fontWeight: '600' },

    // Result / Processing
    resultCard: {
        backgroundColor: C.card, borderRadius: 24, padding: 32,
        alignItems: 'center', gap: 12, marginHorizontal: 24,
        borderWidth: 1, borderColor: C.border,
    },
    processingTitle: { fontSize: 20, fontWeight: '900', color: C.text },
    processingMsg: { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },
    processingTenantChip: {
        backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 14,
        padding: 12, width: '100%', gap: 6,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
    },
    processingTenantText: { fontSize: 13, color: C.text, fontWeight: '700', textAlign: 'center' },
    processingHint: { fontSize: 11, color: C.gold, fontWeight: '700' },

    successTitle: { fontSize: 22, fontWeight: '900', color: C.accent },
    failTitle: { fontSize: 22, fontWeight: '900', color: C.danger },
    failMsg: { fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 20 },

    resultRows: { width: '100%', gap: 0 },
    resultRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    resultLabel: { fontSize: 12, color: C.sub, fontWeight: '600' },
    resultValue: { fontSize: 13, color: C.text, fontWeight: '800' },

    doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
    doneBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
