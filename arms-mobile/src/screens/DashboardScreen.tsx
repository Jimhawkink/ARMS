import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, RefreshControl, Dimensions, Alert,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import {
    type Tenant, type Billing, type Payment,
    fmt, getTenantFullData, getTenantBilling, getTenantPayments,
    logoutTenant, changeTenantPin, formatPhoneDisplay,
    isVacationMonth, getCurrentEffectiveRent, getVacationRent,
} from '../lib/supabase';

const { width } = Dimensions.get('window');

interface DashboardScreenProps {
    tenant: Tenant;
    onLogout: () => void;
    onPayRent: () => void;
    onTenantUpdate: (tenant: Tenant) => void;
}

export default function DashboardScreen({ tenant, onLogout, onPayRent, onTenantUpdate }: DashboardScreenProps) {
    const [bills, setBills] = useState<Billing[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'bills' | 'payments'>('overview');
    const [showChangePin, setShowChangePin] = useState(false);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [changingPin, setChangingPin] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [b, p, freshTenant] = await Promise.all([
                getTenantBilling(tenant.tenant_id),
                getTenantPayments(tenant.tenant_id),
                getTenantFullData(tenant.tenant_id),
            ]);
            setBills(b);
            setPayments(p);
            if (freshTenant) onTenantUpdate(freshTenant);
        } catch (e) {
            console.error('Failed to load data:', e);
        } finally {
            setLoading(false);
        }
    }, [tenant.tenant_id]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: async () => { await logoutTenant(); onLogout(); } },
        ]);
    };

    const handleChangePin = async () => {
        if (!currentPin.trim() || !newPin.trim() || !confirmPin.trim()) {
            Alert.alert('Error', 'Please fill all PIN fields');
            return;
        }
        if (newPin !== confirmPin) {
            Alert.alert('Error', 'New PINs do not match');
            return;
        }
        if (newPin.trim().length < 4) {
            Alert.alert('Error', 'PIN must be at least 4 digits');
            return;
        }
        setChangingPin(true);
        const result = await changeTenantPin(tenant.tenant_id, currentPin, newPin);
        setChangingPin(false);
        if (result.success) {
            Alert.alert('Success', 'PIN changed successfully!');
            setShowChangePin(false);
            setCurrentPin(''); setNewPin(''); setConfirmPin('');
        } else {
            Alert.alert('Error', result.error || 'Failed to change PIN');
        }
    };

    const unpaidBills = bills.filter(b => b.status === 'Unpaid' || b.status === 'Partial');
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accentIndigo} />
                <Text style={styles.loadingText}>Loading your account...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <LinearGradient colors={colors.gradientPrimary} style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{(tenant.tenant_name || '?').charAt(0)}</Text>
                    </LinearGradient>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName} numberOfLines={1}>{tenant.tenant_name}</Text>
                        <Text style={styles.headerSub} numberOfLines={1}>
                            {tenant.arms_units?.unit_name || '—'} • {tenant.arms_locations?.location_name || ''}
                            {tenant.is_on_vacation ? ' 🏖️' : ''}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentIndigo} />}
                contentContainerStyle={styles.scrollContent}
            >
                <LinearGradient colors={colors.gradientPrimary} style={styles.balanceCard}>
                    <View style={styles.balanceBg1} />
                    <View style={styles.balanceBg2} />
                    {tenant.is_on_vacation && isVacationMonth() && (
                        <View style={styles.vacationBanner}>
                            <Text style={styles.vacationBannerText}>🏖️ VACATION MODE • Half-rent applies this month</Text>
                        </View>
                    )}
                    <Text style={styles.balanceLabel}>OUTSTANDING BALANCE</Text>
                    <Text style={styles.balanceAmount}>{fmt(tenant.balance || 0)}</Text>
                    <View style={styles.balanceRow}>
                        <View style={styles.balanceItem}>
                            <Text style={styles.balanceItemLabel}>
                                {tenant.is_on_vacation && isVacationMonth() ? 'Vacation Rent' : 'Monthly Rent'}
                            </Text>
                            <Text style={styles.balanceItemValue}>
                                {tenant.is_on_vacation && isVacationMonth()
                                    ? fmt(getVacationRent(tenant.monthly_rent))
                                    : fmt(tenant.monthly_rent)}
                            </Text>
                        </View>
                        <View style={styles.balanceDivider} />
                        <View style={styles.balanceItem}>
                            <Text style={styles.balanceItemLabel}>Unpaid Bills</Text>
                            <Text style={styles.balanceItemValue}>{unpaidBills.length}</Text>
                        </View>
                        <View style={styles.balanceDivider} />
                        <View style={styles.balanceItem}>
                            <Text style={styles.balanceItemLabel}>Total Paid</Text>
                            <Text style={styles.balanceItemValue}>{fmt(totalPaid)}</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.payBtn} onPress={onPayRent} activeOpacity={0.85}>
                        <Text style={styles.payBtnText}>💳  Pay Rent Now</Text>
                    </TouchableOpacity>
                </LinearGradient>

                <View style={styles.infoRow}>
                    <View style={[styles.infoCard, { borderLeftColor: colors.accentBlue }]}>
                        <Text style={styles.infoEmoji}>🏠</Text>
                        <Text style={styles.infoLabel}>Unit</Text>
                        <Text style={styles.infoValue}>{tenant.arms_units?.unit_name || '—'}</Text>
                    </View>
                    <View style={[styles.infoCard, { borderLeftColor: tenant.is_on_vacation && isVacationMonth() ? '#f97316' : colors.accentEmerald }]}>
                        <Text style={styles.infoEmoji}>{tenant.is_on_vacation && isVacationMonth() ? '🏖️' : '💰'}</Text>
                        <Text style={styles.infoLabel}>{tenant.is_on_vacation && isVacationMonth() ? 'Vac. Rent' : 'Rent'}</Text>
                        <Text style={styles.infoValue}>{fmt(getCurrentEffectiveRent(tenant))}</Text>
                    </View>
                    <View style={[styles.infoCard, { borderLeftColor: colors.accentOrange }]}>
                        <Text style={styles.infoEmoji}>📅</Text>
                        <Text style={styles.infoLabel}>Since</Text>
                        <Text style={styles.infoValue}>{tenant.move_in_date || '—'}</Text>
                    </View>
                </View>

                <View style={styles.tabRow}>
                    {(['overview', 'bills', 'payments'] as const).map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tab, activeTab === tab && styles.tabActive]}
                            onPress={() => setActiveTab(tab)}
                        >
                            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                {tab === 'overview' ? '📋 Overview' : tab === 'bills' ? '📄 Bills' : '🧾 Payments'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {activeTab === 'overview' && (
                    <>
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>📋 My Details</Text>
                            <View style={styles.detailCard}>
                                {[
                                    { label: 'Full Name', value: tenant.tenant_name },
                                    { label: 'ID Number', value: tenant.id_number },
                                    { label: 'Phone', value: tenant.phone ? formatPhoneDisplay(tenant.phone) : '—' },
                                    { label: 'Email', value: tenant.email },
                                    { label: 'Status', value: tenant.status },
                                    { label: 'Vacation Mode', value: tenant.is_on_vacation ? '🏖️ On Vacation (50% rent May-Aug)' : '🏠 Regular' },
                                    { label: 'Deposit Paid', value: fmt(tenant.deposit_paid || 0) },
                                    { label: 'Location', value: tenant.arms_locations?.location_name },
                                ].map((item, i) => (
                                    <View key={i} style={[styles.detailRow, i < 7 && styles.detailRowBorder]}>
                                        <Text style={styles.detailLabel}>{item.label}</Text>
                                        <Text style={styles.detailValue}>{item.value || '—'}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <TouchableOpacity
                                style={styles.changePinBtn}
                                onPress={() => setShowChangePin(!showChangePin)}
                            >
                                <Text style={styles.changePinBtnText}>🔐 Change PIN</Text>
                                <Text style={styles.changePinArrow}>{showChangePin ? '▲' : '▼'}</Text>
                            </TouchableOpacity>
                            {showChangePin && (
                                <View style={styles.pinChangeCard}>
                                    <View style={styles.pinInputGroup}>
                                        <Text style={styles.pinLabel}>CURRENT PIN</Text>
                                        <TextInput
                                            style={styles.pinInput}
                                            placeholder="Enter current PIN"
                                            placeholderTextColor={colors.textPlaceholder}
                                            value={currentPin}
                                            onChangeText={t => setCurrentPin(t.replace(/\D/g, ''))}
                                            secureTextEntry
                                            keyboardType="numeric"
                                            maxLength={6}
                                        />
                                    </View>
                                    <View style={styles.pinInputGroup}>
                                        <Text style={styles.pinLabel}>NEW PIN</Text>
                                        <TextInput
                                            style={styles.pinInput}
                                            placeholder="Enter new PIN (min 4 digits)"
                                            placeholderTextColor={colors.textPlaceholder}
                                            value={newPin}
                                            onChangeText={t => setNewPin(t.replace(/\D/g, ''))}
                                            secureTextEntry
                                            keyboardType="numeric"
                                            maxLength={6}
                                        />
                                    </View>
                                    <View style={styles.pinInputGroup}>
                                        <Text style={styles.pinLabel}>CONFIRM NEW PIN</Text>
                                        <TextInput
                                            style={styles.pinInput}
                                            placeholder="Confirm new PIN"
                                            placeholderTextColor={colors.textPlaceholder}
                                            value={confirmPin}
                                            onChangeText={t => setConfirmPin(t.replace(/\D/g, ''))}
                                            secureTextEntry
                                            keyboardType="numeric"
                                            maxLength={6}
                                        />
                                    </View>
                                    <TouchableOpacity
                                        style={styles.pinSaveBtn}
                                        onPress={handleChangePin}
                                        disabled={changingPin}
                                    >
                                        <LinearGradient
                                            colors={changingPin ? ['#4b5563', '#374151'] : colors.gradientButton}
                                            style={styles.pinSaveBtnGradient}
                                        >
                                            {changingPin ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.pinSaveBtnText}>💾 Update PIN</Text>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </>
                )}

                {activeTab === 'bills' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📄 All Bills ({bills.length})</Text>
                        {bills.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyEmoji}>📭</Text>
                                <Text style={styles.emptyText}>No billing records yet</Text>
                            </View>
                        ) : (
                            <>
                                <View style={styles.gridHeader}>
                                    <Text style={[styles.gridHeaderText, { flex: 1.2 }]}>Month</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 1 }]}>Rent</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 1 }]}>Paid</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 1 }]}>Balance</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 0.8 }]}>Status</Text>
                                </View>
                                {bills.map((bill, i) => (
                                    <View key={bill.billing_id} style={[styles.gridRow, i % 2 === 0 && styles.gridRowEven]}>
                                        <Text style={[styles.gridCell, { flex: 1.2, fontWeight: '700' }]}>{bill.billing_month}</Text>
                                        <Text style={[styles.gridCell, { flex: 1 }]}>{fmt(bill.rent_amount)}</Text>
                                        <Text style={[styles.gridCell, { flex: 1, color: colors.accentEmerald }]}>{fmt(bill.amount_paid)}</Text>
                                        <Text style={[styles.gridCell, { flex: 1, color: bill.balance > 0 ? colors.accentRed : colors.accentEmerald, fontWeight: '700' }]}>
                                            {fmt(bill.balance)}
                                        </Text>
                                        <View style={[
                                            styles.statusBadge,
                                            bill.status === 'Paid' ? styles.badgePaid :
                                            bill.status === 'Partial' ? styles.badgePartial :
                                            styles.badgeUnpaid
                                        ]}>
                                            <Text style={[
                                                styles.statusText,
                                                bill.status === 'Paid' ? styles.statusTextPaid :
                                                bill.status === 'Partial' ? styles.statusTextPartial :
                                                styles.statusTextUnpaid
                                            ]}>{bill.status}</Text>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </View>
                )}

                {activeTab === 'payments' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>🧾 Payment History ({payments.length})</Text>
                        {payments.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyEmoji}>🧾</Text>
                                <Text style={styles.emptyText}>No payment records yet</Text>
                            </View>
                        ) : (
                            <>
                                <View style={styles.gridHeader}>
                                    <Text style={[styles.gridHeaderText, { flex: 1.3 }]}>Date</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 1 }]}>Amount</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 1 }]}>Method</Text>
                                    <Text style={[styles.gridHeaderText, { flex: 1.2 }]}>Receipt</Text>
                                </View>
                                {payments.map((pay, i) => (
                                    <View key={pay.payment_id} style={[styles.gridRow, i % 2 === 0 && styles.gridRowEven]}>
                                        <Text style={[styles.gridCell, { flex: 1.3 }]}>
                                            {new Date(pay.payment_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: '2-digit' })}
                                        </Text>
                                        <Text style={[styles.gridCell, { flex: 1, color: colors.accentEmerald, fontWeight: '700' }]}>
                                            {fmt(pay.amount)}
                                        </Text>
                                        <Text style={[styles.gridCell, { flex: 1 }]}>{pay.payment_method}</Text>
                                        <Text style={[styles.gridCell, { flex: 1.2, fontSize: 10 }]} numberOfLines={1}>
                                            {pay.mpesa_receipt || pay.reference_no || '—'}
                                        </Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            <TouchableOpacity style={styles.fab} onPress={onPayRent} activeOpacity={0.85}>
                <LinearGradient colors={colors.gradientButton} style={styles.fabGradient}>
                    <Text style={styles.fabText}>💳 Pay Rent</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    loadingContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.bgPrimary,
    },
    loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 13 },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
        backgroundColor: 'rgba(15,10,46,0.95)',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    avatarCircle: {
        width: 44, height: 44, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
    headerInfo: { flex: 1 },
    headerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },
    logoutBtn: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
        backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    logoutText: { color: colors.accentRed, fontSize: 12, fontWeight: '700' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
    balanceCard: { borderRadius: 24, padding: 24, overflow: 'hidden', marginTop: 8 },
    vacationBanner: {
        backgroundColor: 'rgba(249,115,22,0.25)', borderRadius: 10, paddingVertical: 8,
        paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)',
    },
    vacationBannerText: { color: '#fdba74', fontSize: 11, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
    balanceBg1: {
        position: 'absolute', right: -30, top: -40,
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    balanceBg2: {
        position: 'absolute', right: 60, bottom: -30,
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
    balanceAmount: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 4 },
    balanceRow: {
        flexDirection: 'row', alignItems: 'center', marginTop: 16,
        backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 14,
    },
    balanceItem: { flex: 1 },
    balanceItemLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600', letterSpacing: 1 },
    balanceItemValue: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
    balanceDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.15)' },
    payBtn: {
        backgroundColor: '#fff', borderRadius: 14, height: 50,
        justifyContent: 'center', alignItems: 'center', marginTop: 16,
    },
    payBtnText: { color: colors.accentIndigo, fontSize: 16, fontWeight: '800' },
    infoRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    infoCard: {
        flex: 1, backgroundColor: colors.bgCard, borderRadius: 16, padding: 14,
        borderLeftWidth: 3, borderWidth: 1, borderColor: colors.borderColor,
    },
    infoEmoji: { fontSize: 20 },
    infoLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600', marginTop: 6, letterSpacing: 1 },
    infoValue: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginTop: 2 },
    tabRow: {
        flexDirection: 'row', gap: 8, marginTop: 20,
        backgroundColor: colors.bgCard, borderRadius: 14, padding: 4,
        borderWidth: 1, borderColor: colors.borderColor,
    },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    tabActive: { backgroundColor: 'rgba(79,70,229,0.2)' },
    tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    tabTextActive: { color: colors.textPrimary, fontWeight: '800' },
    section: { marginTop: 20 },
    sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 10 },
    detailCard: {
        backgroundColor: colors.bgCard, borderRadius: 18, padding: 18,
        borderWidth: 1, borderColor: colors.borderColor,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    detailRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderColor },
    detailLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    detailValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
    changePinBtn: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: colors.bgCard, borderRadius: 14, padding: 16,
        borderWidth: 1, borderColor: colors.borderColor,
    },
    changePinBtnText: { color: colors.accentIndigo, fontSize: 14, fontWeight: '700' },
    changePinArrow: { color: colors.textMuted, fontSize: 10 },
    pinChangeCard: {
        backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, marginTop: 8,
        borderWidth: 1, borderColor: colors.borderColor,
    },
    pinInputGroup: { marginBottom: 12 },
    pinLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
    pinInput: {
        backgroundColor: colors.bgInput, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
        color: colors.textPrimary, fontSize: 15, fontWeight: '600',
        borderWidth: 1, borderColor: colors.borderColor,
    },
    pinSaveBtn: { borderRadius: 10, overflow: 'hidden', marginTop: 4 },
    pinSaveBtnGradient: { height: 44, justifyContent: 'center', alignItems: 'center' },
    pinSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    gridHeader: {
        flexDirection: 'row', backgroundColor: 'rgba(79,70,229,0.15)',
        borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 4,
    },
    gridHeaderText: { color: colors.accentIndigo, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    gridRow: {
        flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
    },
    gridRowEven: { backgroundColor: 'rgba(255,255,255,0.02)' },
    gridCell: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
    statusBadge: { flex: 0.8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignItems: 'center' },
    badgePaid: { backgroundColor: 'rgba(16,185,129,0.15)' },
    badgePartial: { backgroundColor: 'rgba(245,158,11,0.15)' },
    badgeUnpaid: { backgroundColor: 'rgba(239,68,68,0.15)' },
    statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    statusTextPaid: { color: colors.accentEmerald },
    statusTextPartial: { color: colors.accentYellow },
    statusTextUnpaid: { color: colors.accentRed },
    emptyCard: {
        backgroundColor: colors.bgCard, borderRadius: 16, padding: 32,
        alignItems: 'center', borderWidth: 1, borderColor: colors.borderColor,
    },
    emptyEmoji: { fontSize: 32 },
    emptyText: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
    fab: {
        position: 'absolute', bottom: 28, alignSelf: 'center',
        borderRadius: 28, overflow: 'hidden', ...shadows.lg,
    },
    fabGradient: { paddingHorizontal: 32, paddingVertical: 16 },
    fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
