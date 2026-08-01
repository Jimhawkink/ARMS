import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, StatusBar, RefreshControl,
    Animated, Dimensions, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    StaffSession, TenantSearchResult, StatementEntry,
    formatKES, formatMonth, formatDateTime,
    getAllLocations, searchTenants, getTenantStatement,
    refreshTenantBalance,
} from '../lib/supabase';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
    staff: StaffSession;
    onCollectRent?: (tenant: TenantSearchResult) => void; // only passed for landlord
}

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', primaryLight: '#a5b4fc', primaryDark: '#4f46e5',
    accent: '#10b981', accentDark: '#059669',
    danger: '#ef4444', warning: '#f59e0b',
    text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
    gold: '#f59e0b', purple: '#8b5cf6',
};

// ─── Status Badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; color: string }> = {
        'Paid':    { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
        'Partial': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        'Unpaid':  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    };
    const s = map[status] || { bg: 'rgba(100,116,139,0.15)', color: '#64748b' };
    return (
        <View style={[st.badge, { backgroundColor: s.bg }]}>
            <Text style={[st.badgeText, { color: s.color }]}>{status}</Text>
        </View>
    );
}

// ─── Balance Chip ─────────────────────────────────────────────
function BalanceChip({ balance }: { balance: number }) {
    const isOwed = balance > 0;
    return (
        <View style={[st.balChip, { backgroundColor: isOwed ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)' }]}>
            <Text style={[st.balChipText, { color: isOwed ? C.danger : C.accent }]}>
                {isOwed ? '⚠️ ' : '✅ '}{formatKES(Math.abs(balance))}
            </Text>
        </View>
    );
}

// ─── Arrears Severity Badge ───────────────────────────────────
function ArrearsBadge({ balance }: { balance: number }) {
    if (balance <= 0) return null;
    let label = ''; let bg = ''; let color = '';
    if (balance >= 10000)     { label = '🔴 HIGH'; bg = 'rgba(239,68,68,0.18)'; color = '#ef4444'; }
    else if (balance >= 5000) { label = '🟡 MED';  bg = 'rgba(245,158,11,0.18)'; color = '#f59e0b'; }
    else                      { label = '🟢 LOW';  bg = 'rgba(16,185,129,0.15)'; color = '#10b981'; }
    return (
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: bg, alignSelf: 'flex-start', marginTop: 3 }}>
            <Text style={{ fontSize: 8, fontWeight: '900', color }}>{label}</Text>
        </View>
    );
}

// ─── Statement Timeline Entry ─────────────────────────────────
function TimelineEntry({ entry, isLast }: { entry: StatementEntry; isLast: boolean }) {
    const isPayment = entry.type === 'payment';
    return (
        <View style={st.timelineRow}>
            {/* Left dot + line */}
            <View style={st.timelineDotCol}>
                <View style={[st.timelineDot, { backgroundColor: isPayment ? C.accent : C.danger }]} />
                {!isLast && <View style={st.timelineLine} />}
            </View>
            {/* Content */}
            <View style={[st.timelineCard, { borderLeftColor: isPayment ? C.accent : C.danger }]}>
                <View style={st.timelineCardTop}>
                    <Text style={st.timelineDesc} numberOfLines={1}>{entry.description}</Text>
                    {entry.status && <StatusBadge status={entry.status} />}
                </View>
                <Text style={st.timelineDate}>
                    {new Date(entry.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <View style={st.timelineAmounts}>
                    {entry.debit > 0 && (
                        <Text style={st.timelineDebit}>-{formatKES(entry.debit)}</Text>
                    )}
                    {entry.credit > 0 && (
                        <Text style={st.timelineCredit}>+{formatKES(entry.credit)}</Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={[st.timelineBal, { color: entry.balance > 0 ? C.danger : C.accent }]}>
                        Balance: {formatKES(entry.balance)}
                    </Text>
                </View>
                {entry.receipt ? (
                    <Text style={st.timelineReceipt} numberOfLines={1}>🧾 {entry.receipt}</Text>
                ) : null}
            </View>
        </View>
    );
}

type AmountMode = 'none' | 'above' | 'below' | 'between';

interface AmountFilter {
    mode: AmountMode;
    value1: string; // primary amount
    value2: string; // upper bound for 'between'
}

// ─── Main Component ───────────────────────────────────────────
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

    // Load locations once
    useEffect(() => {
        getAllLocations().then(setLocations);
        doSearch('', null);
    }, []);

    const doSearch = useCallback(async (q: string, locId: number | null, silent = false) => {
        if (!silent) setLoading(true);
        const data = await searchTenants(q, locId);
        setResults(data);
        setLoading(false);
        setRefreshing(false);
    }, []);

    // Apply amount/balance filter to displayed results
    const applyAmountFilter = useCallback((data: TenantSearchResult[]): TenantSearchResult[] => {
        const { mode, value1, value2 } = amountFilter;
        if (mode === 'none' || !value1) return data;
        const v1 = parseFloat(value1) || 0;
        const v2 = parseFloat(value2) || 0;
        return data.filter(t => {
            const bal = t.balance;
            if (mode === 'above')   return bal >= v1;
            if (mode === 'below')   return bal > 0 && bal <= v1;
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
            // Update detailTenant with corrected data:
            // - balance = true total (includes unbilled virtual months)
            // - monthly_rent = effective rent (vacation-adjusted)
            // This makes the KPI strip match the tenant's own dashboard
            setDetailTenant(fresh);
            setFreshBalance(fresh.balance);
        }
        setDetailEntries(entries);
        setDetailLoading(false);
    };

    const handleBack = () => {
        Animated.timing(slideAnim, { toValue: SCREEN_W, duration: 220, useNativeDriver: true }).start(() => {
            setDetailTenant(null);
            setDetailEntries([]);
            setDetailLoading(false);
        });
    };

    const onRefresh = () => { setRefreshing(true); doSearch(query, locationFilter, true); };

    // ── DETAIL / STATEMENT VIEW ───────────────────────────────
    const renderDetail = () => {
        if (!detailTenant) return null;
        const t = detailTenant;
        const initials = t.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const isLandlord = staff.role === 'landlord';
        const totalDebits = detailEntries.reduce((s, e) => s + e.debit, 0);
        const totalCredits = detailEntries.reduce((s, e) => s + e.credit, 0);

        return (
            <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: slideAnim }], backgroundColor: C.bg, zIndex: 99 }]}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg} />
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {/* ── Header ── */}
                    <LinearGradient colors={['#4f46e5', '#7c3aed', '#1e3a8a']} style={st.detailHeader}>
                        <TouchableOpacity onPress={handleBack} style={st.backBtn}>
                            <Text style={st.backText}>← Back</Text>
                        </TouchableOpacity>
                        <View style={st.detailHeroRow}>
                            <View style={st.detailAvatar}>
                                <Text style={st.detailAvatarText}>{initials}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={st.detailName}>{t.tenant_name}</Text>
                                <Text style={st.detailSub}>📞 {t.phone || 'N/A'}</Text>
                                <Text style={st.detailSub}>🪪 {t.id_number || 'N/A'}</Text>
                            </View>
                        </View>
                        <View style={st.detailChips}>
                            <View style={st.detailChip}>
                                <Text style={st.detailChipLabel}>🏠 Unit</Text>
                                <Text style={st.detailChipValue}>{t.unit_name}</Text>
                            </View>
                            <View style={st.detailChip}>
                                <Text style={st.detailChipLabel}>📍 Location</Text>
                                <Text style={st.detailChipValue}>{t.location_name}</Text>
                            </View>
                            <View style={st.detailChip}>
                                <Text style={st.detailChipLabel}>📅 Move-In</Text>
                                <Text style={st.detailChipValue}>
                                    {t.move_in_date ? new Date(t.move_in_date).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' }) : 'N/A'}
                                </Text>
                            </View>
                        </View>
                        {/* Role badge */}
                        <View style={st.roleBadge}>
                            <Text style={st.roleBadgeText}>
                                {staff.role === 'caretaker' ? '👁️ Read-Only View' : '🏛️ Landlord View'}
                            </Text>
                        </View>
                    </LinearGradient>

                    {/* ── KPI Strip ── */}
                    <View style={st.kpiStrip}>
                        <View style={st.kpiItem}>
                            <Text style={st.kpiEmoji}>💰</Text>
                            <Text style={st.kpiVal}>{formatKES(t.monthly_rent)}</Text>
                            <Text style={st.kpiLbl}>Monthly Rent</Text>
                        </View>
                        <View style={[st.kpiItem, st.kpiDivider]}>
                            <Text style={st.kpiEmoji}>⚠️</Text>
                            <Text style={[st.kpiVal, { color: freshBalance > 0 ? C.danger : C.accent }]}>
                                {formatKES(freshBalance)}
                            </Text>
                            <Text style={st.kpiLbl}>Balance Due</Text>
                        </View>
                        <View style={st.kpiItem}>
                            <Text style={st.kpiEmoji}>🔐</Text>
                            <Text style={[st.kpiVal, { color: C.purple }]}>{formatKES(t.deposit_paid)}</Text>
                            <Text style={st.kpiLbl}>Deposit Paid</Text>
                        </View>
                    </View>

                    {/* ── Summary Row ── */}
                    <View style={st.summaryRow}>
                        <View style={st.summaryItem}>
                            <Text style={st.summaryLabel}>Total Charged</Text>
                            <Text style={[st.summaryVal, { color: C.danger }]}>{formatKES(totalDebits)}</Text>
                        </View>
                        <View style={[st.summaryItem, { borderLeftWidth: 1, borderLeftColor: C.border }]}>
                            <Text style={st.summaryLabel}>Total Paid</Text>
                            <Text style={[st.summaryVal, { color: C.accent }]}>{formatKES(totalCredits)}</Text>
                        </View>
                        <View style={[st.summaryItem, { borderLeftWidth: 1, borderLeftColor: C.border }]}>
                            <Text style={st.summaryLabel}>Transactions</Text>
                            <Text style={[st.summaryVal, { color: C.primaryLight }]}>{detailEntries.length}</Text>
                        </View>
                    </View>

                    {/* ── Statement Timeline ── */}
                    <View style={st.timelineSection}>
                        <Text style={st.timelineTitle}>📊 Account Statement</Text>
                        <Text style={st.timelineSub}>Full transaction history · Chronological</Text>

                        {detailLoading ? (
                            <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
                                <ActivityIndicator size="large" color={C.primary} />
                                <Text style={{ color: C.sub, fontSize: 13 }}>Loading statement…</Text>
                            </View>
                        ) : detailEntries.length === 0 ? (
                            <View style={st.emptyTimeline}>
                                <Text style={{ fontSize: 36 }}>📭</Text>
                                <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>No Records Yet</Text>
                                <Text style={{ color: C.sub, fontSize: 12 }}>No billing or payment history found</Text>
                            </View>
                        ) : (
                            <View style={st.timeline}>
                                {detailEntries.map((entry, idx) => (
                                    <TimelineEntry
                                        key={`${entry.type}-${entry.date}-${idx}`}
                                        entry={entry}
                                        isLast={idx === detailEntries.length - 1}
                                    />
                                ))}
                                {/* Final balance chip */}
                                <View style={st.finalBalRow}>
                                    <Text style={st.finalBalLabel}>Current Balance</Text>
                                    <Text style={[st.finalBalValue, { color: freshBalance > 0 ? C.danger : C.accent }]}>
                                        {formatKES(freshBalance)}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* ── Landlord: Collect Rent Button ── */}
                    {isLandlord && onCollectRent && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 }}>
                            <TouchableOpacity
                                onPress={() => onCollectRent(t)}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={['#10b981', '#059669', '#047857']}
                                    style={st.collectBtn}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                >
                                    <View style={st.collectBtnDecor} />
                                    <Text style={{ fontSize: 24 }}>💳</Text>
                                    <View>
                                        <Text style={st.collectBtnTitle}>Collect Rent via M-Pesa</Text>
                                        <Text style={st.collectBtnSub}>
                                            Push STK to {t.tenant_name.split(' ')[0]}'s phone
                                        </Text>
                                    </View>
                                    <Text style={st.collectBtnArrow}>→</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </Animated.View>
        );
    };

    // ── SEARCH LIST VIEW ──────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />

            {/* Header */}
            <LinearGradient colors={['#4f46e5', '#6366f1']} style={st.header}>
                <Text style={st.headerTitle}>
                    {staff.role === 'caretaker' ? '👔 Caretaker Portal' : '🏛️ Landlord Portal'}
                </Text>
                <Text style={st.headerSub}>
                    {staff.staff_name} · {staff.role === 'caretaker' ? 'Read-Only Access' : 'Full Access'}
                </Text>
            </LinearGradient>

            {/* Search Bar */}
            <View style={st.searchWrap}>
                <View style={st.searchBar}>
                    <Text style={st.searchIcon}>🔍</Text>
                    <TextInput
                        style={st.searchInput}
                        value={query}
                        onChangeText={handleQueryChange}
                        placeholder="Search by name, phone, unit, location…"
                        placeholderTextColor={C.dim}
                        autoCapitalize="none"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => { setQuery(''); doSearch('', locationFilter); }}>
                            <Text style={{ color: C.dim, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Location Filter Chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={st.filterRow}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}
            >
                <TouchableOpacity
                    style={[st.filterChip, locationFilter === null && st.filterChipActive]}
                    onPress={() => handleLocationFilter(null)}
                >
                    <Text style={[st.filterChipText, locationFilter === null && st.filterChipTextActive]}>
                        🌍 All
                    </Text>
                </TouchableOpacity>
                {locations.map(loc => (
                    <TouchableOpacity
                        key={loc.location_id}
                        style={[st.filterChip, locationFilter === loc.location_id && st.filterChipActive]}
                        onPress={() => handleLocationFilter(loc.location_id)}
                    >
                        <Text style={[st.filterChipText, locationFilter === loc.location_id && st.filterChipTextActive]}>
                            📍 {loc.location_name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* ── Balance / Arrears Amount Filter ── */}
            <View style={st.amountFilterWrap}>
                <TouchableOpacity
                    style={[st.amountFilterToggle, isAmountFilterActive && st.amountFilterToggleActive]}
                    onPress={() => setShowAmountFilter(v => !v)}
                >
                    <Text style={st.amountFilterToggleText}>
                        💰 Balance Filter {isAmountFilterActive ? `(${amountFilter.mode} KES ${amountFilter.value1}${amountFilter.mode === 'between' ? `–${amountFilter.value2}` : ''})` : ''}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 12 }}>{showAmountFilter ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {showAmountFilter && (
                    <View style={st.amountFilterPanel}>
                        {/* Mode selector */}
                        <View style={st.amountModeRow}>
                            {(['none', 'above', 'below', 'between'] as AmountMode[]).map(mode => {
                                const labels: Record<AmountMode, string> = {
                                    none: '🚫 Clear', above: '↑ Above', below: '↓ Below', between: '↔ Between',
                                };
                                const isActive = amountFilter.mode === mode;
                                return (
                                    <TouchableOpacity
                                        key={mode}
                                        style={[st.amountModeBtn, isActive && st.amountModeBtnActive]}
                                        onPress={() => {
                                            if (mode === 'none') clearAmountFilter();
                                            else setAmountFilter(f => ({ ...f, mode }));
                                        }}
                                    >
                                        <Text style={[st.amountModeBtnText, isActive && st.amountModeBtnTextActive]}>
                                            {labels[mode]}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Amount inputs */}
                        {amountFilter.mode !== 'none' && (
                            <View style={st.amountInputRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.amountInputLabel}>
                                        {amountFilter.mode === 'above' ? 'Min Balance (KES)'
                                            : amountFilter.mode === 'below' ? 'Max Balance (KES)'
                                            : 'From (KES)'}
                                    </Text>
                                    <TextInput
                                        style={st.amountInput}
                                        value={amountFilter.value1}
                                        onChangeText={v => setAmountFilter(f => ({ ...f, value1: v.replace(/[^0-9]/g, '') }))}
                                        placeholder="e.g. 5000"
                                        placeholderTextColor={C.dim}
                                        keyboardType="numeric"
                                    />
                                </View>
                                {amountFilter.mode === 'between' && (
                                    <View style={{ flex: 1 }}>
                                        <Text style={st.amountInputLabel}>To (KES)</Text>
                                        <TextInput
                                            style={st.amountInput}
                                            value={amountFilter.value2}
                                            onChangeText={v => setAmountFilter(f => ({ ...f, value2: v.replace(/[^0-9]/g, '') }))}
                                            placeholder="e.g. 20000"
                                            placeholderTextColor={C.dim}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Quick presets */}
                        <Text style={[st.amountInputLabel, { marginBottom: 6 }]}>Quick Presets:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {[
                                    { label: '> 0 (Any Arrears)', mode: 'above' as AmountMode, v1: '1' },
                                    { label: '> 5,000', mode: 'above' as AmountMode, v1: '5000' },
                                    { label: '> 10,000', mode: 'above' as AmountMode, v1: '10000' },
                                    { label: '> 20,000', mode: 'above' as AmountMode, v1: '20000' },
                                    { label: '1K–5K', mode: 'between' as AmountMode, v1: '1000', v2: '5000' },
                                    { label: '5K–10K', mode: 'between' as AmountMode, v1: '5000', v2: '10000' },
                                ].map((p, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={st.presetChip}
                                        onPress={() => setAmountFilter({ mode: p.mode, value1: p.v1, value2: p.v2 || '' })}
                                    >
                                        <Text style={st.presetChipText}>{p.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                )}
            </View>

            {/* Results */}
            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                    <ActivityIndicator size="large" color={C.primary} />
                    <Text style={{ color: C.sub }}>Searching tenants…</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {results.length === 0 ? (
                        <View style={st.empty}>
                            <Text style={{ fontSize: 40 }}>🔍</Text>
                            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>No Tenants Found</Text>
                            <Text style={{ color: C.sub, fontSize: 12, textAlign: 'center' }}>
                                {query ? `No results for "${query}"` : 'No active tenants found'}
                            </Text>
                        </View>
                    ) : (
                        <>
                            <Text style={st.countLabel}>
                                {displayedResults.length} tenant{displayedResults.length !== 1 ? 's' : ''}
                                {isAmountFilterActive ? ` · Balance filter active` : ''}
                                {results.length !== displayedResults.length ? ` (of ${results.length} total)` : ''}
                            </Text>
                            {displayedResults.map(t => {
                                const initials = t.tenant_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                                return (
                                    <TouchableOpacity
                                        key={t.tenant_id}
                                        onPress={() => handleTenantTap(t)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={st.tenantCard}>
                                            {/* Avatar */}
                                            <LinearGradient
                                                colors={['#4f46e5', '#7c3aed']}
                                                style={st.cardAvatar}
                                            >
                                                <Text style={st.cardAvatarText}>{initials}</Text>
                                            </LinearGradient>

                                            {/* Info */}
                                            <View style={{ flex: 1 }}>
                                                <Text style={st.cardName}>{t.tenant_name}</Text>
                                                <Text style={st.cardSub}>📞 {t.phone || 'N/A'}  •  🏠 {t.unit_name}</Text>
                                                <Text style={st.cardSub}>📍 {t.location_name}</Text>
                                                <ArrearsBadge balance={t.balance} />
                                            </View>

                                            {/* Balance + Arrow */}
                                            <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                                <BalanceChip balance={t.balance} />
                                                <Text style={{ color: C.dim, fontSize: 16 }}>›</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </>
                    )}
                </ScrollView>
            )}

            {/* Detail overlay (slides in from right) */}
            {detailTenant && renderDetail()}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────
const st = StyleSheet.create({
    header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

    searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.card, borderRadius: 16,
        borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    searchIcon: { fontSize: 16, marginRight: 8 },
    searchInput: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500' },

    filterRow: { maxHeight: 54 },

    filterChip: {
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    },
    filterChipActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: C.primary },
    filterChipText: { fontSize: 12, color: C.sub, fontWeight: '600' },
    filterChipTextActive: { color: C.primaryLight, fontWeight: '800' },

    countLabel: { fontSize: 11, color: C.dim, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

    tenantCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: C.card, borderRadius: 18,
        borderWidth: 1, borderColor: C.border,
        padding: 14, marginBottom: 8,
    },
    cardAvatar: {
        width: 48, height: 48, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    cardAvatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
    cardName: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 3 },
    cardSub: { fontSize: 11, color: C.sub, marginBottom: 1 },

    balChip: {
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
    },
    balChipText: { fontSize: 10, fontWeight: '800' },

    badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 9, fontWeight: '800' },

    empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },

    // ── Detail / Statement View ──
    detailHeader: {
        paddingTop: 48, paddingBottom: 20, paddingHorizontal: 16,
        overflow: 'hidden',
    },
    backBtn: { marginBottom: 12 },
    backText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
    detailHeroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    detailAvatar: {
        width: 60, height: 60, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },
    detailAvatarText: { fontSize: 22, fontWeight: '900', color: '#fff' },
    detailName: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 3 },
    detailSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginBottom: 1 },
    detailChips: { flexDirection: 'row', gap: 8 },
    detailChip: {
        flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 12, padding: 8, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    },
    detailChipLabel: { fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 2 },
    detailChipValue: { fontSize: 11, color: '#fff', fontWeight: '800', textAlign: 'center' },

    roleBadge: {
        alignSelf: 'flex-start', marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    },
    roleBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },

    kpiStrip: {
        flexDirection: 'row', backgroundColor: C.card,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    kpiItem: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 3 },
    kpiDivider: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border },
    kpiEmoji: { fontSize: 18 },
    kpiVal: { fontSize: 13, fontWeight: '900', color: C.text },
    kpiLbl: { fontSize: 9, color: C.dim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

    summaryRow: {
        flexDirection: 'row', backgroundColor: 'rgba(99,102,241,0.08)',
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    summaryLabel: { fontSize: 9, color: C.dim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    summaryVal: { fontSize: 13, fontWeight: '900' },

    timelineSection: { padding: 16 },
    timelineTitle: { fontSize: 16, fontWeight: '900', color: C.text, marginBottom: 2 },
    timelineSub: { fontSize: 11, color: C.dim, marginBottom: 16 },

    timeline: { gap: 0 },

    timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 2 },
    timelineDotCol: { alignItems: 'center', paddingTop: 14, width: 20 },
    timelineDot: { width: 12, height: 12, borderRadius: 6 },
    timelineLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 4, marginBottom: -4, minHeight: 20 },

    timelineCard: {
        flex: 1, backgroundColor: C.card,
        borderRadius: 14, padding: 12, marginBottom: 8,
        borderLeftWidth: 3, borderWidth: 1, borderColor: C.border,
    },
    timelineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    timelineDesc: { fontSize: 12, fontWeight: '700', color: C.text, flex: 1 },
    timelineDate: { fontSize: 10, color: C.dim, marginBottom: 6 },
    timelineAmounts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timelineDebit: { fontSize: 12, color: C.danger, fontWeight: '800' },
    timelineCredit: { fontSize: 12, color: C.accent, fontWeight: '800' },
    timelineBal: { fontSize: 10, fontWeight: '700' },
    timelineReceipt: { fontSize: 9, color: C.gold, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },

    finalBalRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)', marginTop: 8,
    },
    finalBalLabel: { fontSize: 13, fontWeight: '800', color: C.text },
    finalBalValue: { fontSize: 16, fontWeight: '900' },

    emptyTimeline: { alignItems: 'center', paddingVertical: 40, gap: 8 },

    collectBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 20, borderRadius: 22, overflow: 'hidden',
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    },
    collectBtnDecor: {
        position: 'absolute', right: -20, top: -20,
        width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)',
    },
    collectBtnTitle: { fontSize: 16, fontWeight: '900', color: '#fff' },
    collectBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    collectBtnArrow: { marginLeft: 'auto', fontSize: 22, color: '#fff', fontWeight: '700' },

    // ── Amount / Balance Filter ───────────────────────────────────
    amountFilterWrap: { paddingHorizontal: 16, paddingBottom: 4 },
    amountFilterToggle: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: C.card, borderRadius: 14,
        borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 14, paddingVertical: 10,
        marginBottom: 4,
    },
    amountFilterToggleActive: {
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.08)',
    },
    amountFilterToggleText: { fontSize: 12, color: C.sub, fontWeight: '700', flex: 1 },
    amountFilterPanel: {
        backgroundColor: C.card, borderRadius: 14,
        borderWidth: 1, borderColor: C.border,
        padding: 14, marginBottom: 8, gap: 10,
    },
    amountModeRow: { flexDirection: 'row', gap: 6 },
    amountModeBtn: {
        flex: 1, paddingVertical: 8,
        borderRadius: 10, alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1, borderColor: C.border,
    },
    amountModeBtnActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: C.primary },
    amountModeBtnText: { fontSize: 10, color: C.dim, fontWeight: '700' },
    amountModeBtnTextActive: { color: C.primaryLight, fontWeight: '900' },
    amountInputRow: { flexDirection: 'row', gap: 10 },
    amountInputLabel: { fontSize: 10, color: C.dim, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    amountInput: {
        backgroundColor: '#0f172a', borderRadius: 12,
        borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 12, paddingVertical: 10,
        fontSize: 16, fontWeight: '800', color: C.text,
        textAlign: 'center',
    },
    presetChip: {
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
        backgroundColor: 'rgba(245,158,11,0.1)',
        borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    },
    presetChipText: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },
});
