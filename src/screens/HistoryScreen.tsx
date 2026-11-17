import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    StatusBar,
    Platform,
    TouchableOpacity,
    TextInput,
    Clipboard,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession,
    PaymentRecord,
    formatKES,
    formatDateTime,
    getTenantPayments,
} from '../lib/supabase';

interface Props {
    session: TenantSession;
    onBack?: () => void;
}

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

export default function HistoryScreen({ session, onBack }: Props) {
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedReceipt, setCopiedReceipt] = useState<string | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await getTenantPayments(session.tenant_id);
            setPayments(data || []);
        } catch (err: any) {
            console.error('HistoryScreen load error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.tenant_id]);

    useEffect(() => {
        load();
    }, [load]);

    const onRefresh = () => {
        setRefreshing(true);
        load(true);
    };

    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);

    const filteredPayments = useMemo(() => {
        if (!searchQuery.trim()) return payments;
        const q = searchQuery.toLowerCase();
        return payments.filter(p =>
            (p.mpesa_receipt && p.mpesa_receipt.toLowerCase().includes(q)) ||
            (p.billing_month && p.billing_month.toLowerCase().includes(q)) ||
            (p.payment_method && p.payment_method.toLowerCase().includes(q)) ||
            (p.notes && p.notes.toLowerCase().includes(q))
        );
    }, [payments, searchQuery]);

    const copyReceipt = (code?: string) => {
        if (!code) return;
        Clipboard.setString(code);
        setCopiedReceipt(code);
        Alert.alert('Receipt Copied', `M-Pesa code ${code} copied to clipboard.`);
        setTimeout(() => setCopiedReceipt(null), 2500);
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Top Safe Header Bar */}
            <View style={styles.pinnedHeader}>
                <View style={styles.headerTopRow}>
                    {onBack && (
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={onBack}
                            style={styles.backBtn}
                        >
                            <Text style={styles.backText}>← Back</Text>
                        </TouchableOpacity>
                    )}
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Payment Statements</Text>
                        <Text style={styles.headerSub}>
                            {payments.length} transaction{payments.length !== 1 ? 's' : ''} • Total: {formatKES(totalPaid)}
                        </Text>
                    </View>
                    <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => load(true)}
                        style={styles.refreshBtn}
                    >
                        {refreshing ? (
                            <ActivityIndicator size="small" color="#10b981" />
                        ) : (
                            <Text style={styles.refreshIcon}>↻</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Search Bar inside Header */}
                <View style={styles.searchWrap}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        placeholder="Search by receipt, month, or notes..."
                        placeholderTextColor={COLORS.textDim}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={styles.searchInput}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Text style={styles.clearSearch}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Scrollable Statements List */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.accent}
                        colors={[COLORS.accent]}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Summary Stats Banner */}
                <View style={styles.statsCard}>
                    <LinearGradient
                        colors={['#16213e', '#0f172a']}
                        style={styles.statsGrad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.statsRow}>
                            <View style={styles.statCol}>
                                <Text style={styles.statLabel}>TOTAL RENT SETTLED</Text>
                                <Text style={styles.statValue}>{formatKES(totalPaid)}</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statCol}>
                                <Text style={styles.statLabel}>COMPLETED TRANSACTIONS</Text>
                                <Text style={[styles.statValue, { color: COLORS.neonGreen }]}>{payments.length}</Text>
                            </View>
                        </View>
                    </LinearGradient>
                </View>

                {loading ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={COLORS.accent} />
                        <Text style={styles.loadingText}>Fetching payment history...</Text>
                    </View>
                ) : filteredPayments.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyEmoji}>📜</Text>
                        <Text style={styles.emptyTitle}>
                            {searchQuery ? 'No Matching Records' : 'No Payment Records Yet'}
                        </Text>
                        <Text style={styles.emptySub}>
                            {searchQuery
                                ? 'Try searching by a different receipt code or month.'
                                : 'When rent payments are completed via M-Pesa or Buni, your official receipt records will appear here automatically.'}
                        </Text>
                    </View>
                ) : (
                    filteredPayments.map(p => {
                        const isAdvance = (p.notes && p.notes.toLowerCase().includes('advance')) ||
                            (p.notes && p.notes.toLowerCase().includes('overpayment'));
                        return (
                            <View key={p.payment_id} style={styles.paymentCard}>
                                <View style={styles.cardHeaderRow}>
                                    <View style={styles.receiptCol}>
                                        <View style={styles.receiptBadgeRow}>
                                            <Text style={styles.receiptLabel}>M-PESA RECEIPT</Text>
                                            {isAdvance && (
                                                <View style={styles.advanceBadge}>
                                                    <Text style={styles.advanceBadgeText}>ADVANCE PREPAYMENT</Text>
                                                </View>
                                            )}
                                        </View>
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => copyReceipt(p.mpesa_receipt || undefined)}
                                            style={styles.receiptTouchable}
                                        >
                                            <Text style={styles.receiptCode}>
                                                {p.mpesa_receipt || 'STK-' + p.payment_id}
                                            </Text>
                                            <Text style={styles.copyPill}>
                                                {copiedReceipt === p.mpesa_receipt ? '✓ Copied' : '❐ Copy'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.amountCol}>
                                        <Text style={styles.amountText}>{formatKES(p.amount)}</Text>
                                        <View style={styles.statusSuccessPill}>
                                            <Text style={styles.statusSuccessDot}>●</Text>
                                            <Text style={styles.statusSuccessText}>Verified</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.cardDivider} />

                                <View style={styles.cardMetaRow}>
                                    <View style={styles.metaCol}>
                                        <Text style={styles.metaLabel}>BILLING MONTH</Text>
                                        <Text style={styles.metaValue}>{p.billing_month || 'Current Rent'}</Text>
                                    </View>
                                    <View style={styles.metaCol}>
                                        <Text style={styles.metaLabel}>DATE & TIME</Text>
                                        <Text style={styles.metaValue}>{formatDateTime(p.created_at)}</Text>
                                    </View>
                                    <View style={styles.metaCol}>
                                        <Text style={styles.metaLabel}>GATEWAY</Text>
                                        <Text style={styles.metaValue}>{p.payment_method || 'M-Pesa Express'}</Text>
                                    </View>
                                </View>

                                {p.notes ? (
                                    <View style={styles.notesWrap}>
                                        <Text style={styles.notesText}>📝 {p.notes}</Text>
                                    </View>
                                ) : null}
                            </View>
                        );
                    })
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 50,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    backBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        paddingHorizontal: 13,
        paddingVertical: 7,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
    },
    backText: {
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
    refreshBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    refreshIcon: {
        color: COLORS.accent,
        fontSize: 18,
        fontWeight: '900',
    },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 14,
        paddingHorizontal: 12,
        marginTop: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        height: 40,
    },
    searchIcon: {
        fontSize: 13,
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: COLORS.text,
        fontSize: 13,
    },
    clearSearch: {
        color: COLORS.textDim,
        fontSize: 14,
        paddingHorizontal: 4,
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 16,
    },
    statsCard: {
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    statsGrad: {
        padding: 16,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    statCol: {
        flex: 1,
    },
    statDivider: {
        width: 1,
        height: 36,
        backgroundColor: COLORS.cardBorder,
        marginHorizontal: 12,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '900',
        color: COLORS.text,
    },
    loadingBox: {
        paddingVertical: 50,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        color: COLORS.textSub,
        fontSize: 13,
        fontWeight: '600',
    },
    emptyBox: {
        paddingVertical: 60,
        paddingHorizontal: 24,
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    emptyEmoji: {
        fontSize: 44,
        marginBottom: 12,
    },
    emptyTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
        marginBottom: 6,
    },
    emptySub: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    paymentCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    receiptCol: {
        flex: 1,
    },
    receiptBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    receiptLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
    },
    advanceBadge: {
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.3)',
    },
    advanceBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#38bdf8',
    },
    receiptTouchable: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    receiptCode: {
        fontSize: 15,
        fontWeight: '900',
        color: COLORS.text,
        letterSpacing: 0.5,
    },
    copyPill: {
        fontSize: 10,
        fontWeight: '700',
        color: COLORS.accent,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    amountCol: {
        alignItems: 'flex-end',
    },
    amountText: {
        fontSize: 17,
        fontWeight: '900',
        color: COLORS.neonGreen,
    },
    statusSuccessPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 3,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    statusSuccessDot: {
        fontSize: 8,
        color: COLORS.neonGreen,
    },
    statusSuccessText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#a7f3d0',
    },
    cardDivider: {
        height: 1,
        backgroundColor: COLORS.cardBorder,
        marginVertical: 12,
    },
    cardMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    metaCol: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: COLORS.textDim,
        letterSpacing: 0.6,
        marginBottom: 2,
    },
    metaValue: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.textSub,
    },
    notesWrap: {
        marginTop: 10,
        padding: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 8,
    },
    notesText: {
        fontSize: 11,
        color: COLORS.textSub,
        fontStyle: 'italic',
    },
});
