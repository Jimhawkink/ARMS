import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    StatusBar,
    RefreshControl,
    Animated,
    Dimensions,
    Modal,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    StaffSession,
    TenantSearchResult,
    StatementEntry,
    formatKES,
    formatDateTime,
    getAllLocations,
    searchTenants,
    getTenantStatement,
} from '../lib/supabase';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
    staff: StaffSession;
    onCollectRent?: (tenant: TenantSearchResult) => void;
}

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    primary: '#6366f1',
    primaryLight: '#a5b4fc',
    accent: '#10b981',
    neonGreen: '#00e676',
    danger: '#ef4444',
    warning: '#f59e0b',
    gold: '#fbbf24',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
    purple: '#8b5cf6',
};

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; color: string }> = {
        Paid: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
        Partial: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
        Unpaid: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
    };
    const s = map[status] || { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748b' };
    return (
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
            <Text style={[styles.badgeText, { color: s.color }]}>{status}</Text>
        </View>
    );
}

function BalanceChip({ balance }: { balance: number }) {
    const isOwed = balance > 0;
    return (
        <View style={[styles.balChip, { backgroundColor: isOwed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
            <Text style={[styles.balChipText, { color: isOwed ? COLORS.danger : COLORS.neonGreen }]}>
                {isOwed ? '⚠️ ' : '✓ '}{formatKES(Math.abs(balance))}
            </Text>
        </View>
    );
}

function ArrearsBadge({ balance }: { balance: number }) {
    if (balance <= 0) return null;
    let label = '';
    let bg = '';
    let color = '';
    if (balance >= 10000) {
        label = '🔴 HIGH ARREARS';
        bg = 'rgba(239, 68, 68, 0.18)';
        color = '#ef4444';
    } else if (balance >= 5000) {
        label = '🟡 MED ARREARS';
        bg = 'rgba(245, 158, 11, 0.18)';
        color = '#f59e0b';
    } else {
        label = '🟢 LOW';
        bg = 'rgba(16, 185, 129, 0.15)';
        color = '#10b981';
    }
    return (
        <View style={[styles.arrearsBadgeWrap, { backgroundColor: bg }]}>
            <Text style={[styles.arrearsBadgeText, { color }]}>{label}</Text>
        </View>
    );
}

function TimelineEntryItem({ entry, isLast }: { entry: StatementEntry; isLast: boolean }) {
    const isPayment = entry.type === 'payment';
    return (
        <View style={styles.timelineRow}>
            <View style={styles.timelineDotCol}>
                <View style={[styles.timelineDot, { backgroundColor: isPayment ? COLORS.accent : COLORS.danger }]} />
                {!isLast && <View style={styles.timelineLine} />}
            </View>
            <View style={[styles.timelineCard, { borderLeftColor: isPayment ? COLORS.accent : COLORS.danger }]}>
                <View style={styles.timelineCardTop}>
                    <Text style={styles.timelineDesc} numberOfLines={1}>{entry.description}</Text>
                    {entry.status && <StatusBadge status={entry.status} />}
                </View>
                <Text style={styles.timelineDate}>
                    {new Date(entry.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <View style={styles.timelineAmounts}>
                    {entry.debit > 0 && (
                        <Text style={styles.timelineDebit}>-{formatKES(entry.debit)}</Text>
                    )}
                    {entry.credit > 0 && (
                        <Text style={styles.timelineCredit}>+{formatKES(entry.credit)}</Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.timelineBal, { color: entry.balance > 0 ? COLORS.danger : COLORS.neonGreen }]}>
                        Balance: {formatKES(entry.balance)}
                    </Text>
                </View>
                {entry.receipt ? (
                    <Text style={styles.timelineReceipt} numberOfLines={1}>🧾 {entry.receipt}</Text>
                ) : null}
            </View>
        </View>
    );
}

type AmountMode = 'none' | 'above' | 'below' | 'between';

interface AmountFilter {
    mode: AmountMode;
    value1: string;
    value2: string;
}

export default function TenantSearchScreen({ staff, onCollectRent }: Props) {
    const [query, setQuery] = useState('');
    const [locationFilter, setLocationFilter] = useState<number | null>(null);
    const [locations, setLocations] = useState<{ location_id: number; location_name: string }[]>([]);
    const [results, setResults] = useState<TenantSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [amountFilter, setAmountFilter] = useState<AmountFilter>({ mode: 'none', value1: '', value2: '' });
    const [showAmountFilter, setShowAmountFilter] = useState(false);

    // Detail view state
    const [detailTenant, setDetailTenant] = useState<TenantSearchResult | null>(null);
    const [detailEntries, setDetailEntries] = useState<StatementEntry[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [freshBalance, setFreshBalance] = useState(0);

    const slideAnim = useRef(new Animated.Value(SCREEN_W)).current;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        getAllLocations().then(setLocations);
        doSearch('', null);
    }, []);

    const doSearch = useCallback(async (q: string, locId: number | null, silent = false) => {
        if (!silent) setLoading(true);
        const data = await searchTenants(q, locId);
        setResults(data || []);
        setLoading(false);
        setRefreshing(false);
    }, []);

    const applyAmountFilter = useCallback((data: TenantSearchResult[]): TenantSearchResult[] => {
        const { mode, value1, value2 } = amountFilter;
        if (mode === 'none' || !value1) return data;
        const v1 = parseFloat(value1) || 0;
        const v2 = parseFloat(value2) || 0;
        return data.filter(t => {
            const bal = t.balance;
            if (mode === 'above') return bal >= v1;
            if (mode === 'below') return bal > 0 && bal <= v1;
            if (mode === 'between') return bal >= v1 && (value2 ? bal <= v2 : true);
            return true;
        });
    }, [amountFilter]);

    const handleQueryChange = (text: string) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(text, locationFilter), 350);
    };

    const handleLocationFilter = (locId: number | null) => {
        setLocationFilter(locId);
        doSearch(query, locId);
    };

    const clearAmountFilter = () => setAmountFilter({ mode: 'none', value1: '', value2: '' });
    const isAmountFilterActive = amountFilter.mode !== 'none' && amountFilter.value1 !== '';
    const displayedResults = applyAmountFilter(results);

    const handleTenantTap = async (tenant: TenantSearchResult) => {
        setDetailTenant(tenant);
        setFreshBalance(tenant.balance);
        setDetailLoading(true);
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        const { tenant: fresh, entries } = await getTenantStatement(tenant.tenant_id);
        if (fresh) {
            setDetailTenant(fresh);
            setFreshBalance(fresh.balance);
        }
        setDetailEntries(entries || []);
        setDetailLoading(false);
    };

    const handleBack = () => {
        Animated.timing(slideAnim, { toValue: SCREEN_W, duration: 220, useNativeDriver: true }).start(() => {
            setDetailTenant(null);
            setDetailEntries([]);
            setDetailLoading(false);
        });
    };

    const onRefresh = () => {
        setRefreshing(true);
        doSearch(query, locationFilter, true);
    };

    // ── DETAIL / STATEMENT SLIDE-IN VIEW ───────────────────────────────
    const renderDetail = () => {
        if (!detailTenant) return null;
        const t = detailTenant;
        const initials = t.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const isLandlord = staff.role === 'landlord';

        return (
            <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: slideAnim }], backgroundColor: COLORS.bg, zIndex: 99 }]}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

                {/* Pinned Detail Safe Header */}
                <View style={styles.pinnedHeader}>
                    <TouchableOpacity onPress={handleBack} activeOpacity={0.75} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back to List</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle} numberOfLines={1}>{t.tenant_name}</Text>
                        <Text style={styles.headerSub} numberOfLines={1}>Unit {t.unit_name} • {t.location_name}</Text>
                    </View>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false}>
                    {/* Tenant Dossier Hero Card */}
                    <LinearGradient colors={['#16213e', '#0f172a']} style={styles.detailHeroCard}>
                        <View style={styles.detailHeroTopRow}>
                            <View style={styles.detailAvatar}>
                                <Text style={styles.detailAvatarText}>{initials}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.detailTenantName}>{t.tenant_name}</Text>
                                <Text style={styles.detailContactSub}>📱 {t.phone || 'No phone'}</Text>
                                <Text style={styles.detailContactSub}>🪪 ID: {t.id_number || 'N/A'}</Text>
                            </View>
                            <View style={styles.roleTag}>
                                <Text style={styles.roleTagText}>
                                    {isLandlord ? 'LANDLORD' : 'CARETAKER'}
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>

                    {/* KPI Strip */}
                    <View style={styles.kpiCard}>
                        <View style={styles.kpiItem}>
                            <Text style={styles.kpiLabel}>MONTHLY RENT</Text>
                            <Text style={styles.kpiValue}>{formatKES(t.monthly_rent)}</Text>
                        </View>
                        <View style={styles.kpiDivider} />
                        <View style={styles.kpiItem}>
                            <Text style={styles.kpiLabel}>BALANCE DUE</Text>
                            <Text style={[styles.kpiValue, { color: freshBalance > 0 ? COLORS.danger : COLORS.neonGreen }]}>
                                {formatKES(freshBalance)}
                            </Text>
                        </View>
                        <View style={styles.kpiDivider} />
                        <View style={styles.kpiItem}>
                            <Text style={styles.kpiLabel}>DEPOSIT</Text>
                            <Text style={[styles.kpiValue, { color: COLORS.purple }]}>{formatKES(t.deposit_paid)}</Text>
                        </View>
                    </View>

                    {/* Landlord Action: Collect Rent Button */}
                    {isLandlord && onCollectRent && (
                        <TouchableOpacity
                            onPress={() => {
                                handleBack();
                                onCollectRent(t);
                            }}
                            activeOpacity={0.85}
                            style={styles.collectActionBtn}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669', '#047857']}
                                style={styles.collectActionGrad}
                            >
                                <Text style={{ fontSize: 20 }}>💳</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.collectActionTitle}>Collect Rent via M-Pesa STK</Text>
                                    <Text style={styles.collectActionSub}>Prompt {t.tenant_name.split(' ')[0]}'s phone directly</Text>
                                </View>
                                <Text style={styles.collectActionArrow}>→</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {/* Statement Timeline Header */}
                    <View style={styles.statementSectionHeader}>
                        <Text style={styles.statementSectionTitle}>STATEMENT LEDGER</Text>
                        <Text style={styles.statementSectionSub}>{detailEntries.length} entries</Text>
                    </View>

                    {detailLoading ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator size="small" color={COLORS.accent} />
                            <Text style={styles.loadingText}>Fetching statement history...</Text>
                        </View>
                    ) : detailEntries.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyIcon}>📜</Text>
                            <Text style={styles.emptyTitle}>No Statement Records</Text>
                            <Text style={styles.emptySub}>No transaction ledger found for this tenant.</Text>
                        </View>
                    ) : (
                        detailEntries.map((e, idx) => (
                            <TimelineEntryItem
                                key={idx}
                                entry={e}
                                isLast={idx === detailEntries.length - 1}
                            />
                        ))
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            </Animated.View>
        );
    };

    // ── MAIN TENANTS DIRECTORY VIEW ────────────────────────────────────
    const isLandlord = staff.role === 'landlord';

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Safe Top Header Bar */}
            <View style={styles.pinnedHeader}>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>
                        {isLandlord ? '🏛️ Landlord Portal' : '👔 Caretaker Portal'}
                    </Text>
                    <Text style={styles.headerSub}>
                        {staff.staff_name} • {isLandlord ? 'Full Access & Collections' : 'Tenant Inspection'}
                    </Text>
                </View>
                <TouchableOpacity onPress={() => doSearch(query, locationFilter, false)} style={styles.refreshIconBtn}>
                    <Text style={styles.refreshIconText}>↻</Text>
                </TouchableOpacity>
            </View>

            {/* Search & Location Filter Bar */}
            <View style={styles.searchStrip}>
                <View style={styles.searchBar}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        value={query}
                        onChangeText={handleQueryChange}
                        placeholder="Search name, phone, room, or location..."
                        placeholderTextColor={COLORS.textDim}
                    />
                    {!!query && (
                        <TouchableOpacity onPress={() => { setQuery(''); doSearch('', locationFilter); }}>
                            <Text style={styles.clearSearch}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Locations Horizontal Chips */}
                {locations.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locScroll}>
                        <TouchableOpacity
                            onPress={() => handleLocationFilter(null)}
                            style={[styles.locChip, locationFilter === null && styles.locChipActive]}
                        >
                            <Text style={[styles.locChipText, locationFilter === null && styles.locChipTextActive]}>
                                All Properties
                            </Text>
                        </TouchableOpacity>
                        {locations.map(l => (
                            <TouchableOpacity
                                key={l.location_id}
                                onPress={() => handleLocationFilter(l.location_id)}
                                style={[styles.locChip, locationFilter === l.location_id && styles.locChipActive]}
                            >
                                <Text style={[styles.locChipText, locationFilter === l.location_id && styles.locChipTextActive]}>
                                    📍 {l.location_name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* Tenants List */}
            {loading ? (
                <View style={styles.centerFlex}>
                    <ActivityIndicator size="large" color={COLORS.accent} />
                    <Text style={styles.loadingText}>Loading tenants...</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.accent}
                        />
                    }
                >
                    <View style={styles.listStatsHeader}>
                        <Text style={styles.listStatsText}>
                            {displayedResults.length} TENANT{displayedResults.length !== 1 ? 'S' : ''} LISTED
                        </Text>
                    </View>

                    {displayedResults.length === 0 ? (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyIcon}>🔍</Text>
                            <Text style={styles.emptyTitle}>No Tenants Found</Text>
                            <Text style={styles.emptySub}>
                                {query ? 'Try a different search query or clear property filter.' : 'No active tenants recorded.'}
                            </Text>
                        </View>
                    ) : (
                        displayedResults.map(t => {
                            const initials = t.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                            return (
                                <TouchableOpacity
                                    key={t.tenant_id}
                                    activeOpacity={0.75}
                                    onPress={() => handleTenantTap(t)}
                                    style={styles.tenantCard}
                                >
                                    <View style={styles.tenantAvatar}>
                                        <Text style={styles.tenantAvatarText}>{initials}</Text>
                                    </View>
                                    <View style={styles.tenantBody}>
                                        <View style={styles.tenantTopRow}>
                                            <Text style={styles.tenantName} numberOfLines={1}>{t.tenant_name}</Text>
                                            <BalanceChip balance={t.balance} />
                                        </View>
                                        <Text style={styles.tenantUnit} numberOfLines={1}>
                                            🚪 Unit {t.unit_name} • 📍 {t.location_name}
                                        </Text>
                                        <View style={styles.tenantBottomRow}>
                                            <Text style={styles.tenantPhone}>📱 {t.phone || 'No phone'}</Text>
                                            <ArrearsBadge balance={t.balance} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}

            {/* Slide-In Detail Statement View */}
            {renderDetail()}
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
    refreshIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    refreshIconText: {
        color: COLORS.accent,
        fontSize: 18,
        fontWeight: '900',
    },
    searchStrip: {
        backgroundColor: '#0d1527',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 42,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        marginBottom: 10,
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
    locScroll: {
        gap: 8,
    },
    locChip: {
        backgroundColor: COLORS.card,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    locChipActive: {
        borderColor: COLORS.accent,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    locChipText: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '700',
    },
    locChipTextActive: {
        color: COLORS.accent,
        fontWeight: '900',
    },
    centerFlex: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 12,
    },
    loadingText: {
        color: COLORS.textSub,
        fontSize: 13,
        fontWeight: '600',
    },
    listContent: {
        padding: 16,
    },
    listStatsHeader: {
        marginBottom: 10,
    },
    listStatsText: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
    },
    emptyBox: {
        paddingVertical: 50,
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    emptyIcon: {
        fontSize: 40,
        marginBottom: 10,
    },
    emptyTitle: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: '900',
        marginBottom: 4,
    },
    emptySub: {
        color: COLORS.textSub,
        fontSize: 12,
        textAlign: 'center',
    },
    tenantCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        padding: 14,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    tenantAvatar: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    tenantAvatarText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
    },
    tenantBody: {
        flex: 1,
    },
    tenantTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
    },
    tenantName: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: '800',
        flex: 1,
    },
    tenantUnit: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 4,
    },
    tenantBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    tenantPhone: {
        color: COLORS.textDim,
        fontSize: 11,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '900',
    },
    balChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    balChipText: {
        fontSize: 11,
        fontWeight: '900',
    },
    arrearsBadgeWrap: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    arrearsBadgeText: {
        fontSize: 8,
        fontWeight: '900',
    },
    detailScrollContent: {
        padding: 16,
    },
    detailHeroCard: {
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    detailHeroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    detailAvatar: {
        width: 50,
        height: 50,
        borderRadius: 16,
        backgroundColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailAvatarText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
    },
    detailTenantName: {
        color: COLORS.text,
        fontSize: 17,
        fontWeight: '900',
        marginBottom: 2,
    },
    detailContactSub: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '600',
    },
    roleTag: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    roleTagText: {
        color: COLORS.textDim,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    kpiCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    kpiItem: {
        flex: 1,
        alignItems: 'center',
    },
    kpiDivider: {
        width: 1,
        height: 30,
        backgroundColor: COLORS.cardBorder,
    },
    kpiLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.6,
        marginBottom: 2,
    },
    kpiValue: {
        fontSize: 14,
        fontWeight: '900',
        color: COLORS.text,
    },
    collectActionBtn: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 18,
    },
    collectActionGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    collectActionTitle: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
    },
    collectActionSub: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 11,
        fontWeight: '600',
    },
    collectActionArrow: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
    },
    statementSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 2,
    },
    statementSectionTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: COLORS.textDim,
        letterSpacing: 0.8,
    },
    statementSectionSub: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.accent,
    },
    loadingBox: {
        paddingVertical: 30,
        alignItems: 'center',
        gap: 8,
    },
    timelineRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    timelineDotCol: {
        width: 24,
        alignItems: 'center',
    },
    timelineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 12,
    },
    timelineLine: {
        flex: 1,
        width: 2,
        backgroundColor: COLORS.cardBorder,
        marginVertical: 4,
    },
    timelineCard: {
        flex: 1,
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        borderLeftWidth: 3,
        marginLeft: 8,
    },
    timelineCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    timelineDesc: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: '700',
        flex: 1,
    },
    timelineDate: {
        color: COLORS.textDim,
        fontSize: 10,
        marginBottom: 6,
    },
    timelineAmounts: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    timelineDebit: {
        color: COLORS.danger,
        fontSize: 12,
        fontWeight: '800',
    },
    timelineCredit: {
        color: COLORS.neonGreen,
        fontSize: 12,
        fontWeight: '800',
    },
    timelineBal: {
        fontSize: 11,
        fontWeight: '700',
    },
    timelineReceipt: {
        color: COLORS.accent,
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
    },
});
