import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { type PortalUser, fmt, getTenantBilling, type Billing } from '@/lib/supabase';
import { initiateStkPush, checkStkStatus, type StkPushResponse } from '@/lib/mpesa';

type PayStep = 'input' | 'processing' | 'success' | 'failed';

export default function PayRentScreen() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<PayStep>('input');
  const [loading, setLoading] = useState(false);
  const [stkResponse, setStkResponse] = useState<StkPushResponse | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [unpaidBills, setUnpaidBills] = useState<Billing[]>([]);
  const [selectedBill, setSelectedBill] = useState<Billing | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await SecureStore.getItemAsync('arms_session');
      if (!raw) { router.replace('/login'); return; }
      const parsed = JSON.parse(raw) as PortalUser;
      setUser(parsed);
      setPhone(parsed.arms_tenants?.phone || '');
      const bills = await getTenantBilling(parsed.tenant_id);
      const unpaid = bills.filter(b => b.status === 'Unpaid' || b.status === 'Partial');
      setUnpaidBills(unpaid);
      if (unpaid.length > 0) {
        setSelectedBill(unpaid[0]);
        setAmount(String(unpaid[0].rent_amount - unpaid[0].amount_paid));
      } else if (parsed.arms_tenants?.monthly_rent) {
        setAmount(String(parsed.arms_tenants.monthly_rent));
      }
    })();
  }, []);

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
  }, [step, stkResponse]);

  const handlePay = async () => {
    if (!user) return;
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to pay');
      return;
    }
    if (!phone || phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid M-Pesa phone number (e.g., 0712345678)');
      return;
    }

    Alert.alert(
      'Confirm Payment',
      `Pay ${fmt(payAmount)} via M-Pesa to ${phone}?\n\nAn STK push will be sent to your phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            setStep('processing');
            try {
              const res = await initiateStkPush({
                phone,
                amount: payAmount,
                accountReference: `RENT-${user.arms_tenants?.tenant_name || 'TENANT'}-${user.arms_tenants?.id_number || user.tenant_id}`,
                transactionDesc: `Rent payment by ${user.arms_tenants?.tenant_name}`,
                tenantId: user.tenant_id,
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
      ]
    );
  };

  const handleReset = () => {
    setStep('input');
    setStkResponse(null);
    setPollCount(0);
  };

  if (!user) return null;
  const tenant = user.arms_tenants;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
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
              <View style={styles.tenantAvatar}>
                <Text style={styles.tenantAvatarText}>{(tenant?.tenant_name || '?').charAt(0)}</Text>
              </View>
              <View style={styles.tenantInfo}>
                <Text style={styles.tenantName}>{tenant?.tenant_name}</Text>
                <Text style={styles.tenantDetail}>ID: {tenant?.id_number || '—'} • {tenant?.phone || '—'}</Text>
                <Text style={styles.tenantUnit}>{tenant?.arms_units?.unit_name || '—'} • {tenant?.arms_locations?.location_name || ''}</Text>
              </View>
            </View>

            {/* Balance Info */}
            <View style={styles.balanceStrip}>
              <View style={styles.balanceStripItem}>
                <Text style={styles.balanceStripLabel}>Outstanding</Text>
                <Text style={styles.balanceStripValue}>{fmt(tenant?.balance || 0)}</Text>
              </View>
              <View style={styles.balanceStripDivider} />
              <View style={styles.balanceStripItem}>
                <Text style={styles.balanceStripLabel}>Monthly Rent</Text>
                <Text style={styles.balanceStripValue}>{fmt(tenant?.monthly_rent || 0)}</Text>
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
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  fontSize={32}
                  fontWeight="900"
                />
              </View>
              {/* Quick amounts */}
              <View style={styles.quickRow}>
                {[tenant?.monthly_rent, 5000, 10000, 20000].filter(Boolean).map((val, i) => (
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

            {/* Phone Input */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📱 M-Pesa Phone Number</Text>
              <View style={styles.phoneInputWrapper}>
                <Text style={styles.phonePrefix}>🇰🇪 +254</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="7XX XXX XXX"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={phone.startsWith('254') ? phone.slice(3) : phone.startsWith('0') ? phone.slice(1) : phone}
                  onChangeText={(text: string) => {
                    const clean = text.replace(/\D/g, '');
                    setPhone(clean);
                  }}
                  keyboardType="phone-pad"
                  maxLength={9}
                />
              </View>
              <Text style={styles.phoneHint}>
                STK push will be sent to this number. Make sure it's registered with M-Pesa.
              </Text>
            </View>

            {/* Pay Button */}
            <TouchableOpacity
              style={styles.payButton}
              onPress={handlePay}
              activeOpacity={0.85}
            >
              <Text style={styles.payButtonText}>💳 Pay {fmt(parseFloat(amount) || 0)} via M-Pesa</Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              By proceeding, an M-Pesa STK push will be sent to your phone.
              Enter your M-Pesa PIN to complete the payment.
            </Text>
          </>
        )}

        {step === 'processing' && (
          <View style={styles.processingContainer}>
            <View style={styles.processingCircle}>
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
            <Text style={styles.processingTitle}>Processing Payment...</Text>
            <Text style={styles.processingSub}>
              An STK push has been sent to {phone}.{'\n'}Please enter your M-Pesa PIN on your phone.
            </Text>
            <View style={styles.processingDetails}>
              <Text style={styles.processingDetailText}>Amount: {fmt(parseFloat(amount) || 0)}</Text>
              <Text style={styles.processingDetailText}>Phone: {phone}</Text>
              <Text style={styles.processingDetailText}>Tenant: {tenant?.tenant_name}</Text>
              <Text style={styles.processingDetailText}>ID: {tenant?.id_number || '—'}</Text>
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
              <Text style={styles.resultDetailText}>Tenant: {tenant?.tenant_name}</Text>
              <Text style={styles.resultDetailText}>ID: {tenant?.id_number || '—'}</Text>
              <Text style={styles.resultDetailText}>Phone: {phone}</Text>
              <Text style={styles.resultDetailText}>Amount: {fmt(parseFloat(amount) || 0)}</Text>
            </View>
            <TouchableOpacity style={styles.resultBtn} onPress={() => router.replace('/dashboard')}>
              <Text style={styles.resultBtnText}>Back to Dashboard</Text>
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
              <Text style={styles.resultBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resultBtnSecondary} onPress={() => router.replace('/dashboard')}>
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
  container: { flex: 1, backgroundColor: '#0f0a2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backBtn: { padding: 8 },
  backText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

  // Tenant Card
  tenantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tenantAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  tenantAvatarText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  tenantInfo: { flex: 1 },
  tenantName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tenantDetail: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  tenantUnit: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 },

  // Balance Strip
  balanceStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  billSelectActive: {
    borderColor: '#4f46e5',
    backgroundColor: 'rgba(79,70,229,0.1)',
  },
  billSelectLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  billRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  billRadioActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  billRadioDot: { color: '#fff', fontSize: 12, fontWeight: '900' },
  billSelectMonth: { color: '#fff', fontSize: 13, fontWeight: '700' },
  billSelectDue: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
  billSelectRight: { alignItems: 'flex-end' },
  billSelectAmount: { color: '#fff', fontSize: 14, fontWeight: '800' },
  billSelectStatus: { color: '#f59e0b', fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Amount Input
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  amountCurrency: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '700', marginRight: 10 },
  amountInput: {
    flex: 1,
    color: '#fff',
    paddingVertical: 18,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickBtn: {
    backgroundColor: 'rgba(79,70,229,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.3)',
  },
  quickBtnText: { color: '#818cf8', fontSize: 12, fontWeight: '700' },

  // Phone Input
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  phonePrefix: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600', marginRight: 8 },
  phoneInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 16,
    letterSpacing: 1,
  },
  phoneHint: { color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 8, lineHeight: 16 },

  // Pay Button
  payButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  payButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disclaimer: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },

  // Processing
  processingContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  processingCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(79,70,229,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(79,70,229,0.3)',
  },
  processingTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 24 },
  processingSub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  processingDetails: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 18,
    marginTop: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  processingDetailText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  processingWait: { color: '#f59e0b', fontSize: 13, fontWeight: '600', marginTop: 20 },
  pollText: { color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 8 },

  // Result
  resultContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  successEmoji: { fontSize: 44 },
  failCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  failEmoji: { fontSize: 44 },
  resultTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 24 },
  resultSub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  resultDetails: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 18,
    marginTop: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  resultDetailText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  resultBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 24,
  },
  resultBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultBtnSecondary: {
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resultBtnSecondaryText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
});
