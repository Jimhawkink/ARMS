import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession, BillingRecord, formatKES, formatMonth,
    getTenantBilling, getUnpaidBilling, refreshTenantBalance,
} from '../lib/supabase';
import { updateSessionBalance } from '../lib/security';

interface Props {
    session: TenantSession;
    onPayRent: () => void;
    onSessionUpdate: (updated: TenantSession) => void;
}

const COLORS = {
    bg: '#0f172a', card: '#1e293b', cardBorder: '#334155',
    primary: '#6366f1', primaryDark: '#4f46e5', primaryLight: '#a5b4fc',
    accent: '#10b981', accentDark: '#059669',
    danger: '#ef4444', dangerBg: '#fef2f2',
    warning: '#f59e0b', warningBg: '#fffbeb',
    success: '#10b981', successBg: '#ecfdf5',
    text: '#f8fafc', textSub: '#94a3b8', textDim: '#64748b',
    gold: '#f59e0b',
    purple: '#8b5cf6',
};

function KPICard({ emoji, label, value, color, bg }: {
    emoji: string; label: string; value: string; color: string; bg: string;
}) {
    return (
        <View style={[styles.kpiCard, { borderLeftColor: color }]}>
            <View style={styles.kpiHeader}>
                <Text style={styles.kpiEmoji}>{emoji}</Text>
                <View style={[styles.kpiDot, { backgroundColor: color }]} />
            </View>
            <Text style={[styles.kpiValue, { color }]}>{value}</Text>
            <Text style={styles.kpiLabel}>{label}</Text>
        </View>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; text: string; emoji: string }> = {
        'Paid': { bg: '#ecfdf5', text: '#059669', emoji: '✅' },
        'Partial': { bg: '#fffbeb', text: '#b45309', emoji: '⏳' },
        'Unpaid': { bg: '#fef2f2', text: '#b91c1c', emoji: '❌' },
        'Unbilled': { bg: '#f8fafc', text: '#64748b', emoji: '⏸️' },
    };
    const style = map[status] || map['Unbilled'];
    return (
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
            <Text style={[styles.badgeText, { color: style.text }]}>{style.emoji} {status}</Text>
        </View>
    );
}

export default function DashboardScreen({ session, onPayRent, onSessionUpdate }: Props) {
    const [unpaidBills, setUnpaidBills] = useState<BillingRecord[]>([]);
    const [allBills, setAllBills] = useState<BillingRecord[]>([]);
    const [balance, setBalance] = useState(session.balance);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [unpaid, all, freshBalance] = await Promise.all([
                getUnpaidBilling(session.tenant_id),
                getTenantBilling(session.tenant_id),
                refreshTenantBalance(session.tenant_id),
            ]);
            setUnpaidBills(unpaid);
            setAllBills(all);
            setBalance(freshBalance);
            await updateSessionBalance(freshBalance);
        } catch (err: any) {
            console.error('Dashboard load error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.tenant_id]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = () => { setRefreshing(true); loadData(true); };

    const totalArrears = unpaidBills.reduce((s, b) => s + (b.balance || 0), 0);
    const paidCount = allBills.filter(b => b.status === 'Paid').length;
    const displayBills = showAll ? allBills : unpaidBills;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentBill = unpaidBills.find(b => b.billing_month === currentMonth);
    const arrearsOnly = totalArrears - (currentBill?.balance || 0);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading your account…</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero Profile Card ── */}
                <LinearGradient
                    colors={['#4f46e5', '#7c3aed', '#1e40af']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.profileCard}
                >
                    <View style={styles.profileDecor1} />
                    <View style={styles.profileDecor2} />
                    <View style={styles.profileRow}>
                        <View style={styles.avatarWrap}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>
                                    {session.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                                </Text>
                            </View>
                            <View style={styles.avatarOnline} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.profileName}>{session.tenant_name}</Text>
                            <Text style={styles.profileSub}>📞 {session.phone}</Text>
                            <Text style={styles.profileSub}>🪪 {session.id_number || 'N/A'}</Text>
                        </View>
                    </View>
                    <View style={styles.profileInfoRow}>
                        <View style={styles.profileChip}>
                            <Text style={styles.profileChipLabel}>🏠 Room</Text>
                            <Text style={styles.profileChipValue}>{session.unit_name}</Text>
                        </View>
                        <View style={styles.profileChip}>
                            <Text style={styles.profileChipLabel}>📍 Location</Text>
                            <Text style={styles.profileChipValue}>{session.location_name}</Text>
                        </View>
                        <View style={styles.profileChip}>
                            <Text style={styles.profileChipLabel}>📅 Move-In</Text>
                            <Text style={styles.profileChipValue}>
                                {session.move_in_date ? new Date(session.move_in_date).toLocaleDateString('en-KE', { month: 'short', year: '2-digit' }) : 'N/A'}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* ── KPI Cards ── */}
                <View style={styles.kpiGrid}>
                    <KPICard
                        emoji="💰" label="Monthly Rent"
                        value={formatKES(session.monthly_rent)}
                        color={COLORS.accent} bg={COLORS.successBg}
                    />
                    <KPICard
                        emoji="⚠️" label="Total Balance"
                        value={formatKES(balance)}
                        color={balance > 0 ? COLORS.danger : COLORS.accent}
                        bg={balance > 0 ? '#fef2f2' : '#ecfdf5'}
                    />
                    <KPICard
                        emoji="🕐" label="Past Arrears"
                        value={formatKES(Math.max(0, arrearsOnly))}
                        color={arrearsOnly > 0 ? COLORS.warning : COLORS.accent}
                        bg={arrearsOnly > 0 ? '#fffbeb' : '#ecfdf5'}
                    />
                    <KPICard
                        emoji="🔐" label="Deposit Paid"
                        value={formatKES(session.deposit_paid)}
                        color={COLORS.purple} bg="#f5f3ff"
                    />
                </View>

                {/* ── Pay Rent CTA ── */}
                {balance > 0 && (
                    <TouchableOpacity onPress={onPayRent} activeOpacity={0.85} style={{ marginBottom: 16 }}>
                        <LinearGradient
                            colors={['#10b981', '#059669', '#047857']}
                            style={styles.payCtaBtn}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <View style={styles.payCtaDecor} />
                            <Text style={styles.payCtaEmoji}>💳</Text>
                            <View>
                                <Text style={styles.payCtaText}>Pay Rent Now</Text>
                                <Text style={styles.payCtaSub}>Balance: {formatKES(balance)} outstanding</Text>
                            </View>
                            <Text style={styles.payCtaArrow}>→</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* ── Bills DataGrid ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>
                                {showAll ? '📋 All Bills' : '⚠️ Unpaid Bills'}
                            </Text>
                            <Text style={styles.sectionSub}>
                                {showAll
                                    ? `${allBills.length} total · ${paidCount} paid`
                                    : `${unpaidBills.length} unpaid bill${unpaidBills.length !== 1 ? 's' : ''}`}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowAll(p => !p)}
                            style={styles.toggleBtn}
                        >
                            <Text style={styles.toggleBtnText}>{showAll ? 'Unpaid Only' : 'View All'}</Text>
                        </TouchableOpacity>
                    </View>

                    {displayBills.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyEmoji}>🎉</Text>
                            <Text style={styles.emptyTitle}>All Clear!</Text>
                            <Text style={styles.emptySub}>No unpaid bills. Great work!</Text>
                        </View>
                    ) : (
                        <View style={styles.tableContainer}>
                            {/* Table Header */}
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.6 }]}>Month</Text>
                                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.2 }]}>Rent</Text>
                                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.2 }]}>Paid</Text>
                                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.2 }]}>Balance</Text>
                                <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.4 }]}>Status</Text>
                            </View>
                            {displayBills.map((bill, idx) => {
                                const isCurrentMonth = bill.billing_month === currentMonth;
                                return (
                                    <View
                                        key={bill.billing_id || bill.billing_month}
                                        style={[
                                            styles.tableRow,
                                            idx % 2 === 0 ? styles.rowEven : styles.rowOdd,
                                            isCurrentMonth && styles.rowCurrent,
                                        ]}
                                    >
                                        <View style={{ flex: 1.6 }}>
                                            <Text style={styles.monthText}>{formatMonth(bill.billing_month)}</Text>
                                            {isCurrentMonth && (
                                                <Text style={styles.currentTag}>Current</Text>
                                            )}
                                        </View>
                                        <Text style={[styles.tableCell, styles.amountText, { flex: 1.2 }]}>
                                            {formatKES(bill.rent_amount)}
                                        </Text>
                                        <Text style={[styles.tableCell, styles.paidText, { flex: 1.2 }]}>
                                            {formatKES(bill.amount_paid)}
                                        </Text>
                                        <Text style={[
                                            styles.tableCell, { flex: 1.2, fontWeight: '800' },
                                            { color: bill.balance > 0 ? COLORS.danger : COLORS.accent },
                                        ]}>
                                            {formatKES(bill.balance)}
                                        </Text>
                                        <View style={{ flex: 1.4 }}>
                                            <StatusBadge status={bill.status} />
                                        </View>
                                    </View>
                                );
                            })}
                            {/* Totals Row */}
                            <View style={styles.totalsRow}>
                                <Text style={[styles.tableCell, styles.totalLabel, { flex: 1.6 }]}>Total</Text>
                                <Text style={[styles.tableCell, styles.totalValue, { flex: 1.2 }]}>
                                    {formatKES(displayBills.reduce((s, b) => s + b.rent_amount, 0))}
                                </Text>
                                <Text style={[styles.tableCell, styles.totalValue, { flex: 1.2 }]}>
                                    {formatKES(displayBills.reduce((s, b) => s + b.amount_paid, 0))}
                                </Text>
                                <Text style={[styles.tableCell, styles.totalValueRed, { flex: 1.2 }]}>
                                    {formatKES(displayBills.reduce((s, b) => s + b.balance, 0))}
                                </Text>
                                <View style={{ flex: 1.4 }} />
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { color: COLORS.textSub, fontSize: 14, fontWeight: '500' },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 32 },

    // Profile Card
    profileCard: {
        borderRadius: 24, padding: 20, marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
    },
    profileDecor1: {
        position: 'absolute', top: -40, right: -40,
        width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)',
    },
    profileDecor2: {
        position: 'absolute', bottom: -30, left: -30,
        width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)',
    },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    avatarWrap: { position: 'relative' },
    avatar: {
        width: 56, height: 56, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 20, fontWeight: '900', color: '#fff' },
    avatarOnline: {
        position: 'absolute', bottom: -2, right: -2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: '#10b981', borderWidth: 2, borderColor: '#fff',
    },
    profileName: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 3 },
    profileSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 1 },
    profileInfoRow: { flexDirection: 'row', gap: 8 },
    profileChip: {
        flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 12, padding: 8, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    },
    profileChipLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', fontWeight: '600', marginBottom: 2 },
    profileChipValue: { fontSize: 11, color: '#fff', fontWeight: '800', textAlign: 'center' },

    // KPI Grid
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    kpiCard: {
        flex: 1, minWidth: '45%',
        backgroundColor: COLORS.card, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: COLORS.cardBorder,
        borderLeftWidth: 4,
    },
    kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    kpiEmoji: { fontSize: 20 },
    kpiDot: { width: 8, height: 8, borderRadius: 4 },
    kpiValue: { fontSize: 16, fontWeight: '900', marginBottom: 3 },
    kpiLabel: { fontSize: 10, color: COLORS.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Pay CTA
    payCtaBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 18, borderRadius: 20, overflow: 'hidden',
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    },
    payCtaDecor: {
        position: 'absolute', right: -20, top: -20,
        width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)',
    },
    payCtaEmoji: { fontSize: 28 },
    payCtaText: { fontSize: 16, fontWeight: '900', color: '#fff' },
    payCtaSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
    payCtaArrow: { marginLeft: 'auto', fontSize: 22, color: '#fff', fontWeight: '700' },

    // Section
    section: { backgroundColor: COLORS.card, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.cardBorder },
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
    sectionSub: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
    toggleBtn: { backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
    toggleBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primaryLight },

    // Empty
    emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
    emptySub: { fontSize: 12, color: COLORS.textSub },

    // Table
    tableContainer: {},
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
    tableHeader: { backgroundColor: 'rgba(99,102,241,0.15)', borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
    tableHeaderText: { fontSize: 10, fontWeight: '800', color: COLORS.primaryLight, textTransform: 'uppercase', letterSpacing: 0.5 },
    rowEven: { backgroundColor: 'transparent' },
    rowOdd: { backgroundColor: 'rgba(255,255,255,0.02)' },
    rowCurrent: { backgroundColor: 'rgba(99,102,241,0.08)' },
    tableCell: { fontSize: 11, color: COLORS.text, fontWeight: '500' },
    monthText: { fontSize: 11, color: COLORS.text, fontWeight: '700' },
    currentTag: { fontSize: 8, color: COLORS.primaryLight, fontWeight: '700', backgroundColor: 'rgba(99,102,241,0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginTop: 2 },
    amountText: { color: COLORS.textSub, fontSize: 11 },
    paidText: { color: COLORS.accent, fontSize: 11, fontWeight: '700' },
    badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 9, fontWeight: '800' },
    totalsRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10, paddingHorizontal: 12,
        backgroundColor: 'rgba(99,102,241,0.1)',
        borderTopWidth: 2, borderTopColor: 'rgba(99,102,241,0.3)',
    },
    totalLabel: { fontSize: 11, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5 },
    totalValue: { fontSize: 11, fontWeight: '800', color: COLORS.accent },
    totalValueRed: { fontSize: 11, fontWeight: '900', color: COLORS.danger },
});
