import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession, PaymentRecord, formatKES, formatDateTime, formatMonth,
    getTenantPayments,
} from '../lib/supabase';

interface Props { session: TenantSession; }

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', accent: '#10b981', danger: '#ef4444',
    text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
};

export default function HistoryScreen({ session }: Props) {
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await getTenantPayments(session.tenant_id);
            setPayments(data);
        } catch (err: any) {
            console.error('HistoryScreen load error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.tenant_id]);

    useEffect(() => { load(); }, [load]);
    const onRefresh = () => { setRefreshing(true); load(true); };

    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);

    if (loading) {
        return (
            <View style={s.loadingWrap}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={s.loadingText}>Loading history…</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <LinearGradient colors={['#4f46e5', '#6366f1']} style={s.header}>
                <Text style={s.headerTitle}>📜 Payment History</Text>
                <Text style={s.headerSub}>{payments.length} payment{payments.length !== 1 ? 's' : ''} • Total: {formatKES(totalPaid)}</Text>
            </LinearGradient>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={s.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {payments.length === 0 ? (
                    <View style={s.emptyBox}>
                        <Text style={s.emptyEmoji}>📭</Text>
                        <Text style={s.emptyTitle}>No Payments Yet</Text>
                        <Text style={s.emptySub}>Your payment history will appear here</Text>
                    </View>
                ) : (
                    <>
                        {/* Table Header */}
                        <View style={[s.row, s.tableHeader]}>
                            <Text style={[s.cell, s.headerCell, { flex: 2 }]}>Date / Time</Text>
                            <Text style={[s.cell, s.headerCell, { flex: 1.3 }]}>Month</Text>
                            <Text style={[s.cell, s.headerCell, { flex: 1.3 }]}>Amount</Text>
                            <Text style={[s.cell, s.headerCell, { flex: 1.8 }]}>Receipt</Text>
                        </View>

                        {payments.map((p, idx) => (
                            <View
                                key={p.payment_id}
                                style={[s.row, idx % 2 === 0 ? s.rowEven : s.rowOdd]}
                            >
                                <View style={[s.cell, { flex: 2 }]}>
                                    <Text style={s.dateText}>{formatDateTime(p.payment_date)}</Text>
                                    <Text style={s.methodText}>{p.payment_method}</Text>
                                </View>
                                <Text style={[s.cell, s.monthCell, { flex: 1.3 }]}>
                                    {p.billing_month ? formatMonth(p.billing_month) : '—'}
                                </Text>
                                <Text style={[s.cell, s.amountCell, { flex: 1.3 }]}>
                                    {formatKES(p.amount)}
                                </Text>
                                <View style={[s.cell, { flex: 1.8 }]}>
                                    <Text style={s.receiptText} numberOfLines={1}>
                                        {p.mpesa_receipt || p.reference_no || '—'}
                                    </Text>
                                    {p.mpesa_phone && (
                                        <Text style={s.phoneText}>📞 {p.mpesa_phone}</Text>
                                    )}
                                </View>
                            </View>
                        ))}

                        {/* Totals */}
                        <View style={s.totalsRow}>
                            <Text style={[s.cell, s.totalLabel, { flex: 2 }]}>Total Paid</Text>
                            <View style={[s.cell, { flex: 1.3 }]} />
                            <Text style={[s.cell, s.totalValue, { flex: 1.3 }]}>{formatKES(totalPaid)}</Text>
                            <View style={[s.cell, { flex: 1.8 }]} />
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    loadingWrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { color: C.sub, fontSize: 14 },
    header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16 },
    headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
    content: { padding: 12, paddingBottom: 40 },
    emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 8 },
    emptyEmoji: { fontSize: 48 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text },
    emptySub: { fontSize: 12, color: C.sub },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10 },
    tableHeader: { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 12, marginBottom: 4 },
    headerCell: { fontSize: 9, fontWeight: '800', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 0.5 },
    rowEven: { backgroundColor: C.card, borderRadius: 10, marginBottom: 3 },
    rowOdd: { backgroundColor: 'rgba(30,41,59,0.6)', borderRadius: 10, marginBottom: 3 },
    cell: { fontSize: 11, color: C.text },
    dateText: { fontSize: 10, color: C.text, fontWeight: '600' },
    methodText: { fontSize: 9, color: C.dim, marginTop: 2 },
    monthCell: { fontSize: 10, color: C.sub, fontWeight: '600' },
    amountCell: { fontSize: 12, color: C.accent, fontWeight: '800' },
    receiptText: { fontSize: 10, color: '#f59e0b', fontWeight: '700', fontFamily: 'monospace' },
    phoneText: { fontSize: 9, color: C.dim, marginTop: 2 },
    totalsRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10,
        backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: 12, marginTop: 8,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
    },
    totalLabel: { fontSize: 11, fontWeight: '900', color: C.text, textTransform: 'uppercase' },
    totalValue: { fontSize: 13, fontWeight: '900', color: C.accent },
});
