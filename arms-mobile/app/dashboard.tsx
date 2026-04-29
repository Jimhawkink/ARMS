import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { type PortalUser, type Billing, type Payment, fmt, getTenantBilling, getTenantPayments, supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [bills, setBills] = useState<Billing[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadSession = async () => {
    const raw = await SecureStore.getItemAsync('arms_session');
    if (!raw) { router.replace('/login'); return null; }
    const parsed = JSON.parse(raw) as PortalUser;
    setUser(parsed);
    return parsed;
  };

  const loadData = async (portalUser?: PortalUser) => {
    const pu = portalUser || user;
    if (!pu) return;
    const [b, p] = await Promise.all([
      getTenantBilling(pu.tenant_id),
      getTenantPayments(pu.tenant_id),
    ]);
    setBills(b);
    setPayments(p);
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const pu = await loadSession();
        if (pu) await loadData(pu);
      })();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('arms_session');
          router.replace('/login');
        },
      },
    ]);
  };

  if (!user) return null;

  const tenant = user.arms_tenants;
  const unpaidBills = bills.filter(b => b.status === 'Unpaid' || b.status === 'Partial');
  const totalBalance = unpaidBills.reduce((sum, b) => sum + (b.rent_amount - b.amount_paid), 0);
  const lastPayment = payments[0];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{(tenant?.tenant_name || '?').charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{tenant?.tenant_name}</Text>
            <Text style={styles.headerSub}>{tenant?.arms_units?.unit_name || 'No Unit'} • {tenant?.arms_locations?.location_name || ''}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceBg1} />
          <View style={styles.balanceBg2} />
          <Text style={styles.balanceLabel}>OUTSTANDING BALANCE</Text>
          <Text style={styles.balanceAmount}>{fmt(tenant?.balance || totalBalance)}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceItemLabel}>Monthly Rent</Text>
              <Text style={styles.balanceItemValue}>{fmt(tenant?.monthly_rent || 0)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceItemLabel}>Unpaid Bills</Text>
              <Text style={styles.balanceItemValue}>{unpaidBills.length}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.payBtn}
            onPress={() => router.push('/pay-rent')}
            activeOpacity={0.85}
          >
            <Text style={styles.payBtnText}>💳  Pay Rent Now</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Info Cards */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCard, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.infoEmoji}>🏠</Text>
            <Text style={styles.infoLabel}>Unit</Text>
            <Text style={styles.infoValue}>{tenant?.arms_units?.unit_name || '—'}</Text>
          </View>
          <View style={[styles.infoCard, { borderLeftColor: '#10b981' }]}>
            <Text style={styles.infoEmoji}>💰</Text>
            <Text style={styles.infoLabel}>Rent</Text>
            <Text style={styles.infoValue}>{fmt(tenant?.monthly_rent || 0)}</Text>
          </View>
          <View style={[styles.infoCard, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.infoEmoji}>📅</Text>
            <Text style={styles.infoLabel}>Since</Text>
            <Text style={styles.infoValue}>{tenant?.move_in_date || '—'}</Text>
          </View>
        </View>

        {/* My Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 My Details</Text>
          <View style={styles.detailCard}>
            {[
              { label: 'Name', value: tenant?.tenant_name },
              { label: 'ID Number', value: tenant?.id_number },
              { label: 'Phone', value: tenant?.phone },
              { label: 'Email', value: tenant?.email },
              { label: 'Status', value: tenant?.status },
              { label: 'Deposit Paid', value: fmt(tenant?.deposit_paid || 0) },
            ].map((item, i) => (
              <View key={i} style={[styles.detailRow, i < 5 && styles.detailRowBorder]}>
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={styles.detailValue}>{item.value || '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Bills */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Recent Bills</Text>
          {bills.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyText}>No billing records yet</Text>
            </View>
          ) : (
            bills.slice(0, 5).map((bill, i) => (
              <View key={bill.billing_id} style={styles.billCard}>
                <View style={styles.billLeft}>
                  <Text style={styles.billMonth}>{bill.billing_month}</Text>
                  <Text style={styles.billDue}>Due: {bill.due_date}</Text>
                </View>
                <View style={styles.billRight}>
                  <Text style={styles.billAmount}>{fmt(bill.rent_amount)}</Text>
                  <View style={[
                    styles.billBadge,
                    bill.status === 'Paid' ? styles.badgePaid :
                    bill.status === 'Partial' ? styles.badgePartial :
                    styles.badgeUnpaid
                  ]}>
                    <Text style={[
                      styles.billBadgeText,
                      bill.status === 'Paid' ? styles.badgePaidText :
                      bill.status === 'Partial' ? styles.badgePartialText :
                      styles.badgeUnpaidText
                    ]}>{bill.status}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Recent Payments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧾 Recent Payments</Text>
          {payments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🧾</Text>
              <Text style={styles.emptyText}>No payment records yet</Text>
            </View>
          ) : (
            payments.slice(0, 5).map((pay, i) => (
              <View key={pay.payment_id} style={styles.paymentCard}>
                <View style={styles.payLeft}>
                  <Text style={styles.payMethod}>{pay.payment_method}</Text>
                  <Text style={styles.payDate}>{new Date(pay.payment_date).toLocaleDateString()}</Text>
                  {pay.mpesa_receipt ? <Text style={styles.payRef}>Ref: {pay.mpesa_receipt}</Text> : null}
                </View>
                <Text style={styles.payAmount}>{fmt(pay.amount)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Pay Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/pay-rent')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>💳 Pay Rent</Text>
      </TouchableOpacity>
    </View>
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
    backgroundColor: 'rgba(15,10,46,0.95)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  logoutText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  // Balance Card
  balanceCard: {
    backgroundColor: '#4f46e5',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    marginTop: 8,
  },
  balanceBg1: {
    position: 'absolute',
    right: -30,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceBg2: {
    position: 'absolute',
    right: 60,
    bottom: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  balanceAmount: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 4 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 14,
  },
  balanceItem: { flex: 1 },
  balanceItemLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  balanceItemValue: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 2 },
  balanceDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.15)' },
  payBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  payBtnText: { color: '#4f46e5', fontSize: 16, fontWeight: '800' },

  // Info Row
  infoRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoEmoji: { fontSize: 20 },
  infoLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600', marginTop: 6, letterSpacing: 1 },
  infoValue: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },

  // Section
  section: { marginTop: 24 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },

  // Detail Card
  detailCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  detailLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  detailValue: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Bill Card
  billCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  billLeft: { flex: 1 },
  billMonth: { color: '#fff', fontSize: 14, fontWeight: '700' },
  billDue: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  billRight: { alignItems: 'flex-end' },
  billAmount: { color: '#fff', fontSize: 15, fontWeight: '800' },
  billBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  badgePaid: { backgroundColor: 'rgba(16,185,129,0.15)' },
  badgePartial: { backgroundColor: 'rgba(245,158,11,0.15)' },
  badgeUnpaid: { backgroundColor: 'rgba(239,68,68,0.15)' },
  billBadgeText: { fontSize: 10, fontWeight: '700' },
  badgePaidText: { color: '#10b981' },
  badgePartialText: { color: '#f59e0b' },
  badgeUnpaidText: { color: '#ef4444' },

  // Payment Card
  paymentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  payLeft: { flex: 1 },
  payMethod: { color: '#fff', fontSize: 13, fontWeight: '700' },
  payDate: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  payRef: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 },
  payAmount: { color: '#10b981', fontSize: 15, fontWeight: '800' },

  // Empty
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 8 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: '#4f46e5',
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 16,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
