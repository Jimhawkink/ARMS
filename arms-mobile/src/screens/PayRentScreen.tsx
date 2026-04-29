import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import {
    type Tenant, type Billing, fmt, getTenantBilling,
    normalizePhone, formatPhoneDisplay,
} from '../lib/supabase';
import {
    initiateStkPush, checkStkStatus, formatMpesaPhone, isValidKenyanPhone,
    type StkPushResponse,
} from '../lib/mpesa';

type PayStep = 'input' | 'processing' | 'success' | 'failed';
type PayMode = 'self' | 'payforme';

interface PayRentScreenProps {
    tenant: Tenant;
    onBack: () => void;
    onPaymentComplete: () => void;
}

export default function PayRentScreen({ tenant, onBack, onPaymentComplete }: PayRentScreenProps) {
    const [amount, setAmount] = useState('');
    const [payMode, setPayMode] = useState<PayMode>('self');
    const [selfPhone, setSelfPhone] = useState('');
    const [otherPhone, setOtherPhone] = useState('');
    const [step, setStep] = useState<PayStep>('input');
    const [loading, setLoading] = useState(false);
    const [stkResponse, setStkResponse] = useState<StkPushResponse | null>(null);
    const [pollCount, setPollCount] = useState(0);
    const [unpaidBills, setUnpaidBills] = useState<Billing[]>([]);
    const [selectedBill, setSelectedBill] = useState<Billing | null>(null);

    useEffect(() => {
        (async () => {
            // Set default phone to tenant's registered phone
            const displayPhone = tenant.phone ? formatPhoneDisplay(tenant.phone) : '';
            setSelfPhone(displayPhone.replace(/^0/, ''));

            const bills = await getTenantBilling(tenant.tenant_id);
            const unpaid = bills.filter(b => b.status === 'Unpaid' || b.status === 'Partial');
            setUnpaidBills(unpaid);
            if (unpaid.length > 0) {
                setSelectedBill(unpaid[0]);
                setAmount(String(unpaid[0].rent_amount - unpaid[0].amount_paid));
            } else if (tenant.monthly_rent) {
                setAmount(String(tenant.monthly_rent));
            }
        })();
    }, [tenant]);

    // Poll for STK status
    useEffect(() => {
        if (step !== 'processing' || !stkResponse?.CheckoutRequestID) return;
        const interval = setInterval(async () => {
            try {
                const status = await checkStkStatus(stkResponse.CheckoutRequestID!);
                if (status.ResultCode === '0') {
                    setStep('success');
                    clearInterval(interval);
                } else if (status.ResultCode && status.ResultCode !== '0') {
                    setStep('failed');
                    clearInterval(interval);
                }
                setPollCount(c => c + 1);
                if (pollCount > 30) {
                    setStep('failed');
                    clearInterval(interval);
                }
            } catch {
                // keep polling
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [step, stkResponse, pollCount]);

    // Get the phone that will receive STK push
    const getStkPhone = (): string => {
        if (payMode === 'self') {
            return formatMpesaPhone(selfPhone);
        }
        return formatMpesaPhone(otherPhone);
    };

    // Get the tenant's primary phone for account matching
    const getTenantPrimaryPhone = (): string => {
        return tenant.phone ? formatMpesaPhone(tenant.phone) : '';
    };

    const handlePay = async () => {
        if (!tenant) return;
        const payAmount = parseFloat(amount);
        if (!payAmount || payAmount <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid amount to pay');
            return;
        }

        const stkPhone = getStkPhone();
        if (!isValidKenyanPhone(stkPhone)) {
            Alert.alert('Invalid Phone', 'Please enter a valid M-Pesa phone number (e.g., 0712345678)');
            return;
        }

        // For Pay-for-Me, validate the other phone
        if (payMode === 'payforme' && !isValidKenyanPhone(otherPhone)) {
            Alert.alert('Invalid Phone', 'Please enter a valid phone number for the person paying');
            return;
        }

        const displayPhone = payMode === 'self'
            ? formatPhoneDisplay(stkPhone)
            : formatPhoneDisplay(stkPhone);

        const confirmMsg = payMode === 'self'
            ? `Pay ${fmt(payAmount)} via M-Pesa?\n\nAn STK push will be sent to YOUR phone (${displayPhone}).`
            : `Pay ${fmt(payAmount)} via M-Pesa?\n\nAn STK push will be sent to ${displayPhone}.\n\n⚠️ The payment will be credited to YOUR account (${tenant.tenant_name}).`;

        Alert.alert('Confirm Payment', confirmMsg, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Pay Now',
                style: 'default',
                onPress: async () => {
                    setLoading(true);
                    setStep('processing');
                    try {
                        const res = await initiateStkPush({
                            phone: stkPhone,
                            amount: payAmount,
                            accountReference: `RENT-${tenant.tenant_name}-${tenant.id_number || tenant.tenant_id}`,
                            transactionDesc: `Rent payment by ${tenant.tenant_name}${payMode === 'payforme' ? ' (Pay-for-Me)' : ''}`,
                            tenantId: tenant.tenant_id,
                            tenantPrimaryPhone: getTenantPrimaryPhone(),
                            isPayForMe: payMode === 'payforme',
                        });

                        if (res.error || res.errorCode) {
                            setStep('failed');
                            Alert.alert('Payment Failed', res.error || res.errorMessage || 'STK push failed. Please try again.');
                        } else if (res.missingConfig) {
                            setStep('failed');
                            Alert.alert('Not Configured', 'M-Pesa STK Push is not configured. Contact your landlord.');
                        } else if (res.CheckoutRequestID) {
                            setStkResponse(res);
                            setStep('processing');
                        } else {
                            setStep('failed');
                            Alert.alert('Payment Failed', 'Unexpected response. Please try again.');
                        }
                    } catch (e: any) {
                        setStep('failed');
                        Alert.alert('Error', e.message || 'Something went wrong');
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    };

    const handleReset = () => {
        setStep('input');
        setStkResponse(null);
        setPollCount(0);
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Pay Rent</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {step === 'input' && (
                    <>
                        {/* Tenant Info Card */}
                        <View style={styles.tenantCard}>
                            <LinearGradient colors={colors.gradientPrimary} style={styles.tenantAvatar}>
                                <Text style={styles.tenantAvatarText}>{(tenant.tenant_name || '?').charAt(0)}</Text>
                            </LinearGradient>
                            <View style={styles.tenantInfo}>
                                <Text style={styles.tenantName}>{tenant.tenant_name}</Text>
                                <Text style={styles.tenantDetail}>ID: {tenant.id_number || '—'} • {tenant.phone ? formatPhoneDisplay(tenant.phone) : '—'}</Text>
                                <Text style={styles.tenantUnit}>{tenant.arms_units?.unit_name || '—'} • {tenant.arms_locations?.location_name || ''}</Text>
                            </View>
                        </View>

                        {/* Balance Info */}
                        <View style={styles.balanceStrip}>
                            <View style={styles.balanceStripItem}>
                                <Text style={styles.balanceStripLabel}>Outstanding</Text>
                                <Text style={styles.balanceStripValue}>{fmt(tenant.balance || 0)}</Text>
                            </View>
                            <View style={styles.balanceStripDivider} />
                            <View style={styles.balanceStripItem}>
                                <Text style={styles.balanceStripLabel}>Monthly Rent</Text>
                                <Text style={styles.balanceStripValue}>{fmt(tenant.monthly_rent)}</Text>
                            </View>
                        </View>

                        {/* Unpaid Bills Selection */}
                        {unpaidBills.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>📋 Select Bill to Pay</Text>
                                {unpaidBills.map(bill => (
                                    <TouchableOpacity
                                        key={bill.billing_id}
                                        style={[
                                            styles.billSelectCard,
                                            selectedBill?.billing_id === bill.billing_id && styles.billSelectActive,
                                        ]}
                                        onPress={() => {
                                            setSelectedBill(bill);
                                            setAmount(String(bill.rent_amount - bill.amount_paid));
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.billSelectLeft}>
                                            <View style={[
                                                styles.billRadio,
                                                selectedBill?.billing_id === bill.billing_id && styles.billRadioActive,
                                            ]}>
                                                {selectedBill?.billing_id === bill.billing_id && <Text style={styles.billRadioDot}>✓</Text>}
                                            </View>
                                            <View>
                                                <Text style={styles.billSelectMonth}>{bill.billing_month}</Text>
                                                <Text style={styles.billSelectDue}>Due: {bill.due_date}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.billSelectRight}>
                                            <Text style={styles.billSelectAmount}>{fmt(bill.rent_amount - bill.amount_paid)}</Text>
                                            <Text style={styles.billSelectStatus}>{bill.status}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Amount Input */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>💰 Payment Amount</Text>
                            <View style={styles.amountInputWrapper}>
                                <Text style={styles.amountCurrency}>KES</Text>
                                <TextInput
                                    style={styles.amountInput}
                                    placeholder="0"
                                    placeholderTextColor={colors.textPlaceholder}
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="numeric"
                                />
                            </View>
                            <View style={styles.quickRow}>
                                {[tenant.monthly_rent, 5000, 10000, 20000].filter(Boolean).map((val, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={styles.quickBtn}
                                        onPress={() => setAmount(String(val))}
                                    >
                                        <Text style={styles.quickBtnText}>{fmt(val!)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Payment Mode Selector */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>📱 Payment Method</Text>
                            <View style={styles.modeRow}>
                                <TouchableOpacity
                                    style={[styles.modeCard, payMode === 'self' && styles.modeCardActive]}
                                    onPress={() => setPayMode('self')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.modeEmoji}>📱</Text>
                                    <Text style={[styles.modeTitle, payMode === 'self' && styles.modeTitleActive]}>My Phone</Text>
                                    <Text style={styles.modeDesc}>STK push to your registered number</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modeCard, payMode === 'payforme' && styles.modeCardActive]}
                                    onPress={() => setPayMode('payforme')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.modeEmoji}>🤝</Text>
                                    <Text style={[styles.modeTitle, payMode === 'payforme' && styles.modeTitleActive]}>Pay for Me</Text>
                                    <Text style={styles.modeDesc}>Someone else pays for you</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Phone Input - Self */}
                        {payMode === 'self' && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>📱 Your M-Pesa Phone</Text>
                                <View style={styles.phoneInputWrapper}>
                                    <Text style={styles.phonePrefix}>🇰🇪 +254</Text>
                                    <TextInput
                                        style={styles.phoneInput}
                                        placeholder="7XX XXX XXX"
                                        placeholderTextColor={colors.textPlaceholder}
                                        value={selfPhone}
                                        onChangeText={t => setSelfPhone(t.replace(/\D/g, ''))}
                                        keyboardType="phone-pad"
                                        maxLength={9}
                                    />
                                </View>
                                <Text style={styles.phoneHint}>
                                    This is your registered phone number. STK push will be sent here.
                                </Text>
                            </View>
                        )}

                        {/* Phone Input - Pay for Me */}
                        {payMode === 'payforme' && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>🤝 Payer's Phone Number</Text>
                                <View style={styles.payForMeInfo}>
                                    <Text style={styles.payForMeInfoText}>
                                        ⚠️ The STK push will be sent to THIS phone number.{'\n'}
                                        The payment will be credited to YOUR account ({tenant.tenant_name}).
                                    </Text>
                                </View>
                                <View style={styles.phoneInputWrapper}>
                                    <Text style={styles.phonePrefix}>🇰🇪 +254</Text>
                                    <TextInput
                                        style={styles.phoneInput}
                                        placeholder="Enter payer's phone number"
                                        placeholderTextColor={colors.textPlaceholder}
                                        value={otherPhone}
                                        onChangeText={t => setOtherPhone(t.replace(/\D/g, ''))}
                                        keyboardType="phone-pad"
                                        maxLength={9}
                                    />
                                </View>
                                <Text style={styles.phoneHint}>
                                    The person paying will receive the STK push on this number.
                                    Your account will be credited automatically.
                                </Text>
                            </View>
                        )}

                        {/* Pay Button */}
                        <TouchableOpacity
                            style={styles.payButton}
                            onPress={handlePay}
                            activeOpacity={0.85}
                        >
                            <LinearGradient colors={colors.gradientButton} style={styles.payButtonGradient}>
                                <Text style={styles.payButtonText}>
                                    💳 Pay {fmt(parseFloat(amount) || 0)} via M-Pesa
                                    {payMode === 'payforme' ? ' (Pay for Me)' : ''}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <Text style={styles.disclaimer}>
                            By proceeding, an M-Pesa STK push will be sent to the specified phone number.
                            Enter your M-Pesa PIN to complete the payment.
                        </Text>
                    </>
                )}

                {step === 'processing' && (
                    <View style={styles.processingContainer}>
                        <View style={styles.processingCircle}>
                            <ActivityIndicator size="large" color={colors.accentIndigo} />
                        </View>
                        <Text style={styles.processingTitle}>Processing Payment...</Text>
                        <Text style={styles.processingSub}>
                            {payMode === 'self'
                                ? `An STK push has been sent to your phone (${selfPhone}).\nPlease enter your M-Pesa PIN.`
                                : `An STK push has been sent to ${otherPhone}.\nAsk them to enter their M-Pesa PIN.`
                            }
                        </Text>
                        <View style={styles.processingDetails}>
                            <Text style={styles.processingDetailText}>Amount: {fmt(parseFloat(amount) || 0)}</Text>
                            <Text style={styles.processingDetailText}>Tenant: {tenant.tenant_name}</Text>
                            <Text style={styles.processingDetailText}>ID: {tenant.id_number || '—'}</Text>
                            <Text style={styles.processingDetailText}>
                                {payMode === 'self' ? 'Paying from: Your phone' : `Paying from: ${otherPhone}`}
                            </Text>
                            {payMode === 'payforme' && (
                                <Text style={styles.processingDetailText}>
                                    Crediting to: {tenant.phone ? formatPhoneDisplay(tenant.phone) : 'Your account'}
                                </Text>
                            )}
                        </View>
                        <Text style={styles.processingWait}>Waiting for M-Pesa confirmation...</Text>
                        {pollCount > 0 && (
                            <Text style={styles.pollText}>Checking status... (attempt {pollCount})</Text>
                        )}
                    </View>
                )}

                {step === 'success' && (
                    <View style={styles.resultContainer}>
                        <View style={styles.successCircle}>
                            <Text style={styles.successEmoji}>✅</Text>
                        </View>
                        <Text style={styles.resultTitle}>Payment Successful!</Text>
                        <Text style={styles.resultSub}>
                            Your rent payment of {fmt(parseFloat(amount) || 0)} has been processed.
                        </Text>
                        <View style={styles.resultDetails}>
                            <Text style={styles.resultDetailText}>Tenant: {tenant.tenant_name}</Text>
                            <Text style={styles.resultDetailText}>ID: {tenant.id_number || '—'}</Text>
                            <Text style={styles.resultDetailText}>Amount: {fmt(parseFloat(amount) || 0)}</Text>
                            {payMode === 'payforme' && (
                                <Text style={styles.resultDetailText}>Paid by: {otherPhone}</Text>
                            )}
                        </View>
                        <TouchableOpacity style={styles.resultBtn} onPress={() => { onPaymentComplete(); onBack(); }}>
                            <LinearGradient colors={colors.gradientButton} style={styles.resultBtnGradient}>
                                <Text style={styles.resultBtnText}>Back to Dashboard</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.resultBtnSecondary} onPress={handleReset}>
                            <Text style={styles.resultBtnSecondaryText}>Make Another Payment</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {step === 'failed' && (
                    <View style={styles.resultContainer}>
                        <View style={styles.failCircle}>
                            <Text style={styles.failEmoji}>❌</Text>
                        </View>
                        <Text style={styles.resultTitle}>Payment Failed</Text>
                        <Text style={styles.resultSub}>
                            The M-Pesa transaction could not be completed. Please try again.
                        </Text>
                        <TouchableOpacity style={styles.resultBtn} onPress={handleReset}>
                            <LinearGradient colors={colors.gradientButton} style={styles.resultBtnGradient}>
                                <Text style={styles.resultBtnText}>Try Again</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.resultBtnSecondary} onPress={onBack}>
                            <Text style={styles.resultBtnSecondaryText}>Back to Dashboard</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    },
    backBtn: { padding: 8 },
    backText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

    // Tenant Card
    tenantCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.bgCard, borderRadius: 18, padding: 18,
        borderWidth: 1, borderColor: colors.borderColor,
    },
    tenantAvatar: {
        width: 52, height: 52, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center', marginRight: 14,
    },
    tenantAvatarText: { color: '#fff', fontSize: 22, fontWeight: '900' },
    tenantInfo: { flex: 1 },
    tenantName: { color: '#fff', fontSize: 16, fontWeight: '800' },
    tenantDetail: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
    tenantUnit: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 },

    // Balance Strip
    balanceStrip: {
        flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14,
        padding: 16, marginTop: 14, borderWidth: 1, borderColor: colors.borderColor,
    },
    balanceStripItem: { flex: 1 },
    balanceStripLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600', letterSpacing: 1 },
    balanceStripValue: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
    balanceStripDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

    // Section
    section: { marginTop: 22 },
    sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 10 },

    // Bill Select
    billSelectCard: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14,
        marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    billSelectActive: { borderColor: colors.accentIndigo, backgroundColor: 'rgba(79,70,229,0.1)' },
    billSelectLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    billRadio: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center',
    },
    billRadioActive: { borderColor: colors.accentIndigo, backgroundColor: colors.accentIndigo },
    billRadioDot: { color: '#fff', fontSize: 12, fontWeight: '900' },
    billSelectMonth: { color: '#fff', fontSize: 13, fontWeight: '700' },
    billSelectDue: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
    billSelectRight: { alignItems: 'flex-end' },
    billSelectAmount: { color: '#fff', fontSize: 14, fontWeight: '800' },
    billSelectStatus: { color: colors.accentYellow, fontSize: 10, fontWeight: '600', marginTop: 2 },

    // Amount Input
    amountInputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.bgInput, borderRadius: 16,
        paddingHorizontal: 20, borderWidth: 1, borderColor: colors.borderColor,
    },
    amountCurrency: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '700', marginRight: 10 },
    amountInput: { flex: 1, color: '#fff', fontSize: 32, fontWeight: '900', paddingVertical: 18 },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    quickBtn: {
        backgroundColor: 'rgba(79,70,229,0.15)', borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 8,
        borderWidth: 1, borderColor: 'rgba(79,70,229,0.3)',
    },
    quickBtnText: { color: '#818cf8', fontSize: 12, fontWeight: '700' },

    // Payment Mode
    modeRow: { flexDirection: 'row', gap: 10 },
    modeCard: {
        flex: 1, backgroundColor: colors.bgCard, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: colors.borderColor, alignItems: 'center',
    },
    modeCardActive: { borderColor: colors.accentIndigo, backgroundColor: 'rgba(79,70,229,0.1)' },
    modeEmoji: { fontSize: 28 },
    modeTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    modeTitleActive: { color: colors.textPrimary },
    modeDesc: { color: colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' },

    // Phone Input
    phoneInputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.bgInput, borderRadius: 16,
        paddingHorizontal: 16, borderWidth: 1, borderColor: colors.borderColor,
    },
    phonePrefix: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600', marginRight: 8 },
    phoneInput: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', paddingVertical: 16, letterSpacing: 1 },
    phoneHint: { color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 8, lineHeight: 16 },

    // Pay-for-Me info
    payForMeInfo: {
        backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 14,
        marginBottom: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    },
    payForMeInfoText: { color: colors.accentYellow, fontSize: 12, fontWeight: '600', lineHeight: 18 },

    // Pay Button
    payButton: { borderRadius: 16, overflow: 'hidden', marginTop: 28, ...shadows.md },
    payButtonGradient: { height: 56, justifyContent: 'center', alignItems: 'center' },
    payButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    disclaimer: { color: 'rgba(255,255,255,0.2)', fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 },

    // Processing
    processingContainer: { alignItems: 'center', paddingTop: 40 },
    processingCircle: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(79,70,229,0.15)', justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: 'rgba(79,70,229,0.3)',
    },
    processingTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 24 },
    processingSub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    processingDetails: {
        backgroundColor: colors.bgCard, borderRadius: 16, padding: 18,
        marginTop: 24, width: '100%', borderWidth: 1, borderColor: colors.borderColor,
    },
    processingDetailText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
    processingWait: { color: colors.accentYellow, fontSize: 13, fontWeight: '600', marginTop: 20 },
    pollText: { color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 8 },

    // Result
    resultContainer: { alignItems: 'center', paddingTop: 40 },
    successCircle: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(16,185,129,0.15)', justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: 'rgba(16,185,129,0.3)',
    },
    successEmoji: { fontSize: 44 },
    failCircle: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: 'rgba(239,68,68,0.3)',
    },
    failEmoji: { fontSize: 44 },
    resultTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 24 },
    resultSub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    resultDetails: {
        backgroundColor: colors.bgCard, borderRadius: 16, padding: 18,
        marginTop: 24, width: '100%', borderWidth: 1, borderColor: colors.borderColor,
    },
    resultDetailText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
    resultBtn: { borderRadius: 14, overflow: 'hidden', width: '100%', marginTop: 24 },
    resultBtnGradient: { height: 50, justifyContent: 'center', alignItems: 'center' },
    resultBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    resultBtnSecondary: {
        borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center',
        width: '100%', marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    resultBtnSecondaryText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
});
