import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, ActivityIndicator, StatusBar, Platform,
    Modal, TextInput, Alert, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession, BillingRecord, formatKES, formatMonth,
    getTenantBilling, getUnpaidBilling, refreshTenantBalance, getTrueTotalBalance,
    getTenantActivePenalties, TenantPenaltyInfo,
    getTenantPrepaymentSummary, PrepaymentSummary,
    changeTenantPin,
} from '../lib/supabase';
import { updateSessionBalance } from '../lib/security';
import { setupNotifications, registerPushToken } from '../lib/notifications';

interface Props {
    session: TenantSession;
    onPayRent: () => void;
    onNavigate?: (tab: string) => void;
    onSessionUpdate: (updated: TenantSession) => void;
}

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: '#1e293b',
    primary: '#6366f1',
    primaryDark: '#4f46e5',
    primaryLight: '#a5b4fc',
    accent: '#10b981',
    accentDark: '#059669',
    neonGreen: '#00e676',
    danger: '#ef4444',
    warning: '#f59e0b',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
    gold: '#fbbf24',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 32;

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { bg: string; text: string; emoji: string }> = {
        'Paid': { bg: 'rgba(16,185,129,0.15)', text: '#34d399', emoji: '✅' },
        'Partial': { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', emoji: '⏳' },
        'Unpaid': { bg: 'rgba(239,68,68,0.15)', text: '#f87171', emoji: '❌' },
        'Unbilled': { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', emoji: '⏸️' },
    };
    const style = map[status] || map['Unbilled'];
    return (
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
            <Text style={[styles.badgeText, { color: style.text }]}>{style.emoji} {status}</Text>
        </View>
    );
}

export default function DashboardScreen({ session, onPayRent, onNavigate, onSessionUpdate }: Props) {
    const [unpaidBills, setUnpaidBills] = useState<BillingRecord[]>([]);
    const [allBills, setAllBills] = useState<BillingRecord[]>([]);
    const [balance, setBalance] = useState(session.balance);
    const [effectiveRent, setEffectiveRent] = useState(session.monthly_rent);
    const [penaltyInfo, setPenaltyInfo] = useState<TenantPenaltyInfo>({
        totalPenalty: 0, penaltyDays: 0, penaltyDates: [], rateLabel: '10%'
    });
    const [prepaymentInfo, setPrepaymentInfo] = useState<PrepaymentSummary>({
        hasPrepayment: false, totalAdvance: 0, coveredMonths: [], excessCredit: 0, monthsCount: 0
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAll, setShowAll] = useState(false);

    // M-Pesa Style Mask/Reveal Balance
    const [balanceMasked, setBalanceMasked] = useState(false);

    // Carousel Active Card Index
    const [activeCardIndex, setActiveCardIndex] = useState(0);

    // Modals
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [showPins, setShowPins] = useState(false);
    const [savingPin, setSavingPin] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    const [penaltyModalVisible, setPenaltyModalVisible] = useState(false);
    const [prepayModalVisible, setPrepayModalVisible] = useState(false);

    // Dynamic greeting based on time of day
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning,';
        if (hour < 17) return 'Good afternoon,';
        return 'Good evening,';
    }, []);

    // First name with fallback
    const firstName = useMemo(() => {
        const parts = (session.tenant_name || 'Tenant').trim().split(' ');
        return parts[0] || 'Tenant';
    }, [session.tenant_name]);

    const initials = useMemo(() => {
        const parts = (session.tenant_name || 'T').trim().split(' ').filter(Boolean);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return (parts[0]?.[0] || 'T').toUpperCase();
    }, [session.tenant_name]);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [unpaid, all, trueBalance, pen, prepay] = await Promise.all([
                getUnpaidBilling(session.tenant_id),
                getTenantBilling(session.tenant_id),
                getTrueTotalBalance(session.tenant_id),
                getTenantActivePenalties(session.tenant_id),
                getTenantPrepaymentSummary(session.tenant_id, session.monthly_rent),
            ]);
            setUnpaidBills(unpaid);
            setAllBills(all);
            setBalance(trueBalance.total);
            setEffectiveRent(trueBalance.effectiveRent);
            setPenaltyInfo(pen);
            setPrepaymentInfo(prepay);
            await updateSessionBalance(trueBalance.total);
        } catch (err: any) {
            console.error('Dashboard load error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.tenant_id, session.monthly_rent]);

    useEffect(() => { loadData(); }, [loadData]);

    useEffect(() => {
        setupNotifications()
            .then(granted => {
                if (granted) registerPushToken(session.tenant_id);
            })
            .catch(() => {});
    }, [session.tenant_id]);

    const onRefresh = () => { setRefreshing(true); loadData(true); };

    const totalArrears = unpaidBills.reduce((s, b) => s + (b.balance || 0), 0);
    const paidCount = allBills.filter(b => b.status === 'Paid').length;
    const displayBills = showAll ? allBills : unpaidBills;
    const currentMonth = new Date().toISOString().slice(0, 7);

    const totalDue = balance + penaltyInfo.totalPenalty;

    // PIN Change Handler
    const handleSavePin = async () => {
        setPinError(null);
        const curr = currentPin.trim();
        const next = newPin.trim();
        const conf = confirmPin.trim();

        if (!curr) { setPinError('Please enter your current PIN'); return; }
        if (!next) { setPinError('Please enter a new PIN'); return; }
        if (!/^\d{4,6}$/.test(next)) { setPinError('New PIN must be strictly 4 to 6 numeric digits'); return; }
        if (next !== conf) { setPinError('New PIN and Confirm PIN do not match'); return; }
        if (next === curr) { setPinError('New PIN cannot be the same as your current PIN'); return; }

        setSavingPin(true);
        try {
            const res = await changeTenantPin(session.tenant_id, curr, next, conf);
            if (!res.success) {
                setPinError(res.error || 'Failed to update PIN');
                return;
            }
            setPinModalVisible(false);
            Alert.alert(
                '✅ PIN Changed Successfully',
                'Your login PIN has been updated. Please remember your new PIN for future logins.',
                [{ text: 'OK' }]
            );
        } catch (err: any) {
            setPinError(err.message || 'Error updating PIN');
        } finally {
            setSavingPin(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Syncing account details…</Text>
            </View>
        );
    }

    return (
        <View style={styles.rootContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* ══════════════════════════════════════════════════════════════
                PINNED TOP HEADER BAR (OUTSIDE SCROLLVIEW)
                Fixed firmly at the top — Prevents ANY spilling into Status Bar!
            ══════════════════════════════════════════════════════════════ */}
            <View style={styles.topHeaderPinned}>
                <View style={styles.headerLeft}>
                    {/* Circle Avatar with Initials + Online Dot */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => onNavigate ? onNavigate('profile') : null}
                        style={styles.avatarWrap}
                    >
                        <LinearGradient
                            colors={['#4f46e5', '#7c3aed']}
                            style={styles.avatarGradient}
                        >
                            <Text style={styles.avatarText}>{initials}</Text>
                        </LinearGradient>
                        <View style={styles.onlineBadge} />
                    </TouchableOpacity>

                    {/* Greeting & Name */}
                    <View style={styles.greetingWrap}>
                        <Text style={styles.greetingSub}>{greeting}</Text>
                        <Text style={styles.greetingName} numberOfLines={1}>
                            {firstName} 👋
                        </Text>
                        <View style={styles.unitChip}>
                            <Text style={styles.unitChipText} numberOfLines={1}>
                                🏠 {session.unit_name} • {session.location_name}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Top Right Action Icons (Notifications + Sync) */}
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => onNavigate ? onNavigate('chat') : null}
                        style={styles.iconCircleBtn}
                    >
                        <Text style={styles.iconCircleEmoji}>🔔</Text>
                        <View style={styles.notifDot} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => loadData(true)}
                        style={styles.iconCircleBtn}
                    >
                        <Text style={[styles.iconCircleEmoji, refreshing && { transform: [{ rotate: '45deg' }] }]}>
                            🔄
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ══════════════════════════════════════════════════════════════
                SCROLLABLE BODY CONTENT
                Scrolls cleanly beneath the pinned top header without clipping
            ══════════════════════════════════════════════════════════════ */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.accent}
                        colors={[COLORS.accent, COLORS.primary]}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* ── 1. M-Pesa Style Horizontal Balance Cards ── */}
                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={e => {
                        const x = e.nativeEvent.contentOffset.x;
                        const idx = Math.round(x / CARD_WIDTH);
                        if (idx !== activeCardIndex) setActiveCardIndex(idx);
                    }}
                    scrollEventThrottle={16}
                    style={styles.carouselScroll}
                    contentContainerStyle={styles.carouselContainer}
                >
                    {/* CARD 1: Rent Outstanding / Total Due */}
                    <View style={[styles.mCard, { width: CARD_WIDTH }]}>
                        <LinearGradient
                            colors={['#16213e', '#0f172a']}
                            style={styles.mCardGrad}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            {/* Card Accent Neon Line */}
                            <View style={styles.mCardAccentLine} />

                            <View style={styles.mCardTopRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.mCardLabel}>Rent Outstanding</Text>
                                    <View style={styles.mCardLiveDot} />
                                </View>
                                {/* Eye Mask / Reveal Toggle */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setBalanceMasked(p => !p)}
                                    style={styles.eyeBtn}
                                >
                                    <Text style={styles.eyeText}>{balanceMasked ? '👁️ Show' : '🙈 Hide'}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Big Amount */}
                            <View style={styles.amountRow}>
                                <Text style={styles.mCardAmount}>
                                    {balanceMasked
                                        ? 'KES ••••••'
                                        : formatKES(totalDue > 0 ? totalDue : 0)}
                                </Text>
                                {totalDue > 0 && penaltyInfo.totalPenalty > 0 && !balanceMasked && (
                                    <View style={styles.penTag}>
                                        <Text style={styles.penTagText}>+10% Late Fee</Text>
                                    </View>
                                )}
                            </View>

                            <Text style={styles.mCardSub}>
                                {totalDue > 0
                                    ? `Due on 5th • Monthly Rent: ${formatKES(effectiveRent)}`
                                    : '🎉 All caught up! No outstanding balance due.'}
                            </Text>

                            {/* Action Button inside Card */}
                            <View style={styles.mCardActionRow}>
                                {totalDue > 0 ? (
                                    <TouchableOpacity
                                        activeOpacity={0.85}
                                        onPress={onPayRent}
                                        style={styles.mCardActionBtn}
                                    >
                                        <LinearGradient
                                            colors={['#10b981', '#059669']}
                                            style={styles.mCardActionGrad}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                        >
                                            <Text style={styles.mCardActionText}>💳 Pay Rent Now</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        activeOpacity={0.85}
                                        onPress={() => onNavigate ? onNavigate('history') : null}
                                        style={styles.mCardOutlineBtn}
                                    >
                                        <Text style={styles.mCardOutlineText}>View Statements →</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </LinearGradient>
                    </View>

                    {/* CARD 2: Monthly Lease & Room Info */}
                    <View style={[styles.mCard, { width: CARD_WIDTH }]}>
                        <LinearGradient
                            colors={['#1e1b4b', '#0f172a']}
                            style={styles.mCardGrad}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <View style={[styles.mCardAccentLine, { backgroundColor: '#818cf8' }]} />

                            <View style={styles.mCardTopRow}>
                                <Text style={[styles.mCardLabel, { color: '#c7d2fe' }]}>Monthly Lease Details</Text>
                                <Text style={{ fontSize: 14 }}>🏠</Text>
                            </View>

                            <View style={styles.amountRow}>
                                <Text style={styles.mCardAmount}>{formatKES(effectiveRent)}</Text>
                                <Text style={[styles.mCardSub, { marginTop: 8 }]}>/ month</Text>
                            </View>

                            <Text style={styles.mCardSub}>
                                Room: {session.unit_name} • Deposit Held: {formatKES(session.deposit_paid)}
                            </Text>

                            <View style={styles.mCardActionRow}>
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={() => onNavigate ? onNavigate('profile') : null}
                                    style={styles.mCardOutlineBtn}
                                >
                                    <Text style={styles.mCardOutlineText}>View Lease Details →</Text>
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* CARD 3: Prepayment & Advance (if any) */}
                    {prepaymentInfo.hasPrepayment && (
                        <View style={[styles.mCard, { width: CARD_WIDTH }]}>
                            <LinearGradient
                                colors={['#064e3b', '#0f172a']}
                                style={styles.mCardGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <View style={[styles.mCardAccentLine, { backgroundColor: '#34d399' }]} />

                                <View style={styles.mCardTopRow}>
                                    <Text style={[styles.mCardLabel, { color: '#a7f3d0' }]}>Rent Prepayment Active</Text>
                                    <View style={styles.penTag}>
                                        <Text style={[styles.penTagText, { color: '#34d399' }]}>
                                            {prepaymentInfo.monthsCount} Mo. Ahead
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.amountRow}>
                                    <Text style={[styles.mCardAmount, { color: '#34d399' }]}>
                                        +{formatKES(prepaymentInfo.totalAdvance)}
                                    </Text>
                                </View>

                                <Text style={styles.mCardSub} numberOfLines={1}>
                                    {prepaymentInfo.coveredMonths.length > 0
                                        ? `Covers ${prepaymentInfo.coveredMonths.map(m => m.monthName).join(', ')}`
                                        : 'Unallocated overpayment credit'}
                                </Text>

                                <View style={styles.mCardActionRow}>
                                    <TouchableOpacity
                                        activeOpacity={0.85}
                                        onPress={() => setPrepayModalVisible(true)}
                                        style={styles.mCardOutlineBtn}
                                    >
                                        <Text style={[styles.mCardOutlineText, { color: '#34d399' }]}>
                                            View Month Breakdown →
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </LinearGradient>
                        </View>
                    )}
                </ScrollView>

                {/* Carousel Indicator Dots */}
                <View style={styles.dotsRow}>
                    <View style={[styles.dot, activeCardIndex === 0 ? styles.dotActive : styles.dotInactive]} />
                    <View style={[styles.dot, activeCardIndex === 1 ? styles.dotActive : styles.dotInactive]} />
                    {prepaymentInfo.hasPrepayment && (
                        <View style={[styles.dot, activeCardIndex === 2 ? styles.dotActive : styles.dotInactive]} />
                    )}
                </View>

                {/* ── 2. ⚡ Late Penalty Alert Banner (if penalty > 0) ── */}
                {penaltyInfo.totalPenalty > 0 && (
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setPenaltyModalVisible(true)}
                        style={styles.penaltyBanner}
                    >
                        <LinearGradient
                            colors={['#3f1219', '#240a10']}
                            style={styles.penaltyGrad}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <View style={styles.penaltyIconCircle}>
                                <Text style={{ fontSize: 16 }}>⚡</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={styles.penaltyTitle}>10% Late Fee Applied</Text>
                                    <Text style={styles.penaltyAmountBadge}>+{formatKES(penaltyInfo.totalPenalty)}</Text>
                                </View>
                                <Text style={styles.penaltyDesc}>
                                    Rent unpaid by 5th. Tap to view late fee details.
                                </Text>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* ── 3. 💰 Prepayment / Overpayment Card (if active) ── */}
                {prepaymentInfo.hasPrepayment && (
                    <View style={styles.prepayBanner}>
                        <LinearGradient
                            colors={['#064e3b', '#022c22']}
                            style={styles.prepayGrad}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <View style={styles.prepayHeaderRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 16 }}>🎉</Text>
                                    <Text style={styles.prepayTitle}>Advance Rent Prepayment</Text>
                                </View>
                                <View style={styles.prepayMonthsBadge}>
                                    <Text style={styles.prepayMonthsText}>
                                        {prepaymentInfo.monthsCount} Month{prepaymentInfo.monthsCount > 1 ? 's' : ''} Ahead
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.prepayAmount}>
                                {formatKES(prepaymentInfo.totalAdvance)}
                            </Text>

                            <Text style={styles.prepayDesc}>
                                Spreading across future months:
                            </Text>

                            {/* Covered Months Pills */}
                            <View style={styles.monthPillsContainer}>
                                {prepaymentInfo.coveredMonths.map((m, idx) => (
                                    <View key={m.billing_month || idx} style={styles.monthPill}>
                                        <Text style={styles.monthPillText}>
                                            📅 {m.monthName}: {formatKES(m.amount_paid)} {m.isFull ? '✅ (100% Paid)' : `⏳ (Bal: ${formatKES(m.balance)})`}
                                        </Text>
                                    </View>
                                ))}
                                {prepaymentInfo.excessCredit > 0 && (
                                    <View style={[styles.monthPill, { borderColor: '#f59e0b' }]}>
                                        <Text style={[styles.monthPillText, { color: '#fde68a' }]}>
                                            🎁 Unallocated Credit: {formatKES(prepaymentInfo.excessCredit)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </LinearGradient>
                    </View>
                )}

                {/* ── 4. Quick Actions Grid (Exact 2x4 Layout from M-Pesa App) ── */}
                <View style={styles.quickActionsCard}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Quick Actions</Text>
                        <TouchableOpacity
                            onPress={() => onNavigate ? onNavigate('pay') : null}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.viewAllText}>Pay Rent &gt;</Text>
                        </TouchableOpacity>
                    </View>

                    {/* 2 Rows of 4 Circular Buttons */}
                    <View style={styles.quickGrid}>
                        {/* 1. Pay Rent */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={onPayRent}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#10b981' }]}>
                                <Text style={styles.quickEmoji}>💳</Text>
                            </View>
                            <Text style={styles.quickLabel}>Pay Rent</Text>
                        </TouchableOpacity>

                        {/* 2. Statements */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => onNavigate ? onNavigate('history') : null}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#3b82f6' }]}>
                                <Text style={styles.quickEmoji}>📜</Text>
                            </View>
                            <Text style={styles.quickLabel}>Statements</Text>
                        </TouchableOpacity>

                        {/* 3. Change PIN */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                                setCurrentPin('');
                                setNewPin('');
                                setConfirmPin('');
                                setPinError(null);
                                setPinModalVisible(true);
                            }}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#a855f7' }]}>
                                <Text style={styles.quickEmoji}>🔒</Text>
                            </View>
                            <Text style={styles.quickLabel}>Change PIN</Text>
                        </TouchableOpacity>

                        {/* 4. Messages / Chat */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => onNavigate ? onNavigate('chat') : null}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#f59e0b' }]}>
                                <Text style={styles.quickEmoji}>💬</Text>
                            </View>
                            <Text style={styles.quickLabel}>Chat Staff</Text>
                        </TouchableOpacity>

                        {/* 5. Prepayments */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setPrepayModalVisible(true)}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#06b6d4' }]}>
                                <Text style={styles.quickEmoji}>💰</Text>
                            </View>
                            <Text style={styles.quickLabel}>Advance</Text>
                        </TouchableOpacity>

                        {/* 6. Late Penalties */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setPenaltyModalVisible(true)}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#ef4444' }]}>
                                <Text style={styles.quickEmoji}>⚡</Text>
                            </View>
                            <Text style={styles.quickLabel}>10% Penalty</Text>
                        </TouchableOpacity>

                        {/* 7. Agreement */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => onNavigate ? onNavigate('profile') : null}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#6366f1' }]}>
                                <Text style={styles.quickEmoji}>📄</Text>
                            </View>
                            <Text style={styles.quickLabel}>Lease Info</Text>
                        </TouchableOpacity>

                        {/* 8. Sync Data */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => loadData(true)}
                            style={styles.quickItem}
                        >
                            <View style={[styles.quickCircle, { borderColor: '#64748b' }]}>
                                <Text style={styles.quickEmoji}>🔄</Text>
                            </View>
                            <Text style={styles.quickLabel}>Refresh</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── 5. Bills Ledger ── */}
                <View style={styles.billsCard}>
                    <View style={styles.sectionHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>
                                {showAll ? '📋 All Monthly Bills' : '⚠️ Outstanding Bills'}
                            </Text>
                            <Text style={styles.sectionSub}>
                                {showAll
                                    ? `${allBills.length} records · ${paidCount} settled`
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
                            <Text style={styles.emptyTitle}>All Bills Cleared!</Text>
                            <Text style={styles.emptySub}>No unpaid bills found on your account.</Text>
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

            {/* ══════════════════════════════════════════════════════════════
                MODALS
            ══════════════════════════════════════════════════════════════ */}

            {/* 🔒 CHANGE LOGIN PIN MODAL */}
            <Modal
                visible={pinModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => { if (!savingPin) setPinModalVisible(false); }}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>🔒 Change Login PIN</Text>
                                <Text style={styles.modalSub}>Enter your current PIN and choose a new 4-6 digit numeric PIN.</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setPinModalVisible(false)}
                                disabled={savingPin}
                                style={styles.modalCloseBtn}
                            >
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {pinError && (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>⚠️ {pinError}</Text>
                            </View>
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Current PIN</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter current PIN"
                                placeholderTextColor={COLORS.textDim}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry={!showPins}
                                value={currentPin}
                                onChangeText={setCurrentPin}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>New PIN (4 to 6 Digits)</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Enter new numeric PIN"
                                placeholderTextColor={COLORS.textDim}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry={!showPins}
                                value={newPin}
                                onChangeText={setNewPin}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Confirm New PIN</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Re-enter new PIN"
                                placeholderTextColor={COLORS.textDim}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry={!showPins}
                                value={confirmPin}
                                onChangeText={setConfirmPin}
                            />
                        </View>

                        <TouchableOpacity
                            onPress={() => setShowPins(p => !p)}
                            style={styles.toggleShowBtn}
                        >
                            <Text style={styles.toggleShowText}>
                                {showPins ? '🙈 Hide Numbers' : '👁️ Show Numbers'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleSavePin}
                            disabled={savingPin}
                            activeOpacity={0.85}
                            style={[styles.submitPinBtn, savingPin && { opacity: 0.7 }]}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={styles.submitPinGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {savingPin ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Text style={{ fontSize: 16 }}>💾</Text>
                                        <Text style={styles.submitPinText}>Update & Save PIN</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ⚡ 10% LATE FEE BREAKDOWN MODAL */}
            <Modal
                visible={penaltyModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setPenaltyModalVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>⚡ 10% Late Rent Penalty</Text>
                                <Text style={styles.modalSub}>Applied automatically on the 6th of the month.</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setPenaltyModalVisible(false)}
                                style={styles.modalCloseBtn}
                            >
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBodyRow}>
                            <Text style={styles.modalBodyLabel}>Unpaid Rent:</Text>
                            <Text style={styles.modalBodyVal}>{formatKES(balance)}</Text>
                        </View>
                        <View style={styles.modalBodyRow}>
                            <Text style={styles.modalBodyLabel}>⚡ 10% Late Fee:</Text>
                            <Text style={[styles.modalBodyVal, { color: '#f87171' }]}>
                                +{formatKES(penaltyInfo.totalPenalty)}
                            </Text>
                        </View>
                        <View style={[styles.modalBodyRow, { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8, marginTop: 4 }]}>
                            <Text style={[styles.modalBodyLabel, { color: '#fff', fontWeight: '800' }]}>Total Due:</Text>
                            <Text style={[styles.modalBodyVal, { color: '#fbbf24', fontSize: 16, fontWeight: '900' }]}>
                                {formatKES(totalDue)}
                            </Text>
                        </View>

                        <Text style={[styles.modalSub, { marginTop: 12, lineHeight: 16 }]}>
                            ℹ️ Per management policy, rent is due on or before the 5th of each month. A flat 10% penalty applies to any outstanding balance remaining on the 6th.
                        </Text>

                        <TouchableOpacity
                            onPress={() => {
                                setPenaltyModalVisible(false);
                                onPayRent();
                            }}
                            activeOpacity={0.85}
                            style={[styles.submitPinBtn, { marginTop: 16 }]}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={styles.submitPinGrad}
                            >
                                <Text style={styles.submitPinText}>Pay Total Due ({formatKES(totalDue)}) Now</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 💰 PREPAYMENT BREAKDOWN MODAL */}
            <Modal
                visible={prepayModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setPrepayModalVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>🎉 Rent Prepayment & Advance</Text>
                                <Text style={styles.modalSub}>
                                    Total Advance: {formatKES(prepaymentInfo.totalAdvance)}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setPrepayModalVisible(false)}
                                style={styles.modalCloseBtn}
                            >
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Months Covered by Advance Rent:</Text>

                        {prepaymentInfo.coveredMonths.length === 0 ? (
                            <Text style={[styles.modalSub, { marginBottom: 12 }]}>
                                You have {formatKES(prepaymentInfo.excessCredit)} unallocated credit on your account that will automatically offset your next bill.
                            </Text>
                        ) : (
                            prepaymentInfo.coveredMonths.map((m, idx) => (
                                <View key={m.billing_month || idx} style={styles.monthPill}>
                                    <Text style={styles.monthPillText}>
                                        📅 {m.monthName} — Paid: {formatKES(m.amount_paid)} {m.isFull ? '✅ (100% Fully Settled)' : `⏳ (Remaining: ${formatKES(m.balance)})`}
                                    </Text>
                                </View>
                            ))
                        )}

                        {prepaymentInfo.excessCredit > 0 && (
                            <View style={[styles.monthPill, { borderColor: '#f59e0b', marginTop: 8 }]}>
                                <Text style={[styles.monthPillText, { color: '#fde68a' }]}>
                                    🎁 Extra Credit: {formatKES(prepaymentInfo.excessCredit)}
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={() => setPrepayModalVisible(false)}
                            style={[styles.submitPinBtn, { marginTop: 16 }]}
                        >
                            <LinearGradient
                                colors={['#6366f1', '#4f46e5']}
                                style={styles.submitPinGrad}
                            >
                                <Text style={styles.submitPinText}>Close Breakdown</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    rootContainer: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: COLORS.bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        color: COLORS.textSub,
        fontSize: 14,
        fontWeight: '600',
    },

    // ── PINNED TOP HEADER BAR (OUTSIDE SCROLLVIEW) ──
    topHeaderPinned: {
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 48,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: COLORS.bg,
        borderBottomWidth: 1,
        borderBottomColor: '#131d33',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 50,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    avatarWrap: {
        position: 'relative',
    },
    avatarGradient: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    avatarText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '900',
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLORS.accent,
        borderWidth: 2,
        borderColor: COLORS.bg,
    },
    greetingWrap: {
        flex: 1,
    },
    greetingSub: {
        fontSize: 11,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    greetingName: {
        fontSize: 17,
        fontWeight: '900',
        color: COLORS.text,
        letterSpacing: -0.3,
    },
    unitChip: {
        marginTop: 2,
    },
    unitChipText: {
        fontSize: 10,
        fontWeight: '700',
        color: COLORS.primaryLight,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconCircleBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#162035',
        borderWidth: 1,
        borderColor: '#26344f',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    iconCircleEmoji: {
        fontSize: 15,
    },
    notifDot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },

    // ── SCROLLVIEW BODY ──
    scroll: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 40,
    },

    // ── M-PESA STYLE BALANCE CARDS CAROUSEL ──
    carouselScroll: {
        marginBottom: 8,
    },
    carouselContainer: {
        gap: 12,
    },
    mCard: {
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(16,185,129,0.3)',
    },
    mCardGrad: {
        padding: 18,
        position: 'relative',
    },
    mCardAccentLine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: COLORS.accent,
    },
    mCardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    mCardLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: '#a7f3d0',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    mCardLiveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.accent,
    },
    eyeBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    eyeText: {
        fontSize: 11,
        color: '#f8fafc',
        fontWeight: '700',
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 4,
    },
    mCardAmount: {
        fontSize: 30,
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: -0.5,
    },
    penTag: {
        backgroundColor: 'rgba(239,68,68,0.2)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.4)',
    },
    penTagText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#fca5a5',
    },
    mCardSub: {
        fontSize: 11,
        color: COLORS.textSub,
        fontWeight: '600',
        lineHeight: 15,
    },
    mCardActionRow: {
        marginTop: 16,
    },
    mCardActionBtn: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    mCardActionGrad: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mCardActionText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#ffffff',
    },
    mCardOutlineBtn: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignSelf: 'flex-start',
    },
    mCardOutlineText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#e2e8f0',
    },

    // Dots
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 16,
    },
    dot: {
        height: 4,
        borderRadius: 2,
    },
    dotActive: {
        width: 20,
        backgroundColor: COLORS.accent,
    },
    dotInactive: {
        width: 6,
        backgroundColor: '#334155',
    },

    // ── 2. LATE PENALTY BANNER ──
    penaltyBanner: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    penaltyGrad: {
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    penaltyIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(239,68,68,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    penaltyTitle: {
        fontSize: 13,
        fontWeight: '900',
        color: '#f87171',
    },
    penaltyAmountBadge: {
        fontSize: 12,
        fontWeight: '900',
        color: '#fbbf24',
    },
    penaltyDesc: {
        fontSize: 11,
        color: '#cbd5e1',
        marginTop: 2,
    },

    // ── 3. PREPAYMENT BANNER ──
    prepayBanner: {
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 14,
        borderWidth: 1.5,
        borderColor: '#10b981',
    },
    prepayGrad: {
        padding: 14,
    },
    prepayHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    prepayTitle: {
        fontSize: 13,
        fontWeight: '900',
        color: '#a7f3d0',
    },
    prepayMonthsBadge: {
        backgroundColor: 'rgba(16,185,129,0.25)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.5)',
    },
    prepayMonthsText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#6ee7b7',
    },
    prepayAmount: {
        fontSize: 22,
        fontWeight: '900',
        color: '#ffffff',
        marginTop: 2,
    },
    prepayDesc: {
        fontSize: 11,
        color: '#e2e8f0',
        marginTop: 4,
        marginBottom: 8,
    },
    monthPillsContainer: {
        gap: 6,
    },
    monthPill: {
        backgroundColor: 'rgba(0,0,0,0.35)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    monthPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#f8fafc',
    },

    // ── 4. QUICK ACTIONS CARD (M-PESA 2x4 GRID) ──
    quickActionsCard: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: COLORS.text,
    },
    sectionSub: {
        fontSize: 11,
        color: COLORS.textSub,
        marginTop: 2,
    },
    viewAllText: {
        fontSize: 12,
        fontWeight: '800',
        color: COLORS.accent,
    },
    quickGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 14,
    },
    quickItem: {
        width: '23%',
        alignItems: 'center',
    },
    quickCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#0a0f1d',
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    quickEmoji: {
        fontSize: 20,
    },
    quickLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: COLORS.textSub,
        textAlign: 'center',
    },

    // ── 5. BILLS TABLE ──
    billsCard: {
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        marginBottom: 20,
    },
    toggleBtn: {
        backgroundColor: '#1e293b',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#334155',
    },
    toggleBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.text,
    },
    emptyBox: {
        alignItems: 'center',
        paddingVertical: 32,
        gap: 6,
    },
    emptyEmoji: {
        fontSize: 36,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: COLORS.text,
    },
    emptySub: {
        fontSize: 12,
        color: COLORS.textSub,
    },
    tableContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    tableHeader: {
        backgroundColor: '#0a0f1d',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
    },
    tableHeaderText: {
        fontSize: 9,
        fontWeight: '900',
        color: COLORS.primaryLight,
        textTransform: 'uppercase',
    },
    tableCell: {
        fontSize: 11,
        color: COLORS.text,
    },
    rowEven: {
        backgroundColor: '#131b2e',
    },
    rowOdd: {
        backgroundColor: '#0f172a',
    },
    rowCurrent: {
        borderLeftWidth: 3,
        borderLeftColor: COLORS.accent,
    },
    monthText: {
        fontSize: 11,
        fontWeight: '800',
        color: COLORS.text,
    },
    currentTag: {
        fontSize: 9,
        color: COLORS.accent,
        fontWeight: '700',
    },
    amountText: {
        fontSize: 11,
        color: COLORS.textSub,
    },
    paidText: {
        fontSize: 11,
        color: COLORS.accent,
        fontWeight: '700',
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '800',
    },
    totalsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        backgroundColor: '#0a0f1d',
        borderTopWidth: 1,
        borderTopColor: COLORS.cardBorder,
    },
    totalLabel: {
        fontSize: 11,
        fontWeight: '900',
        color: COLORS.text,
        textTransform: 'uppercase',
    },
    totalValue: {
        fontSize: 11,
        fontWeight: '800',
        color: COLORS.text,
    },
    totalValueRed: {
        fontSize: 11,
        fontWeight: '900',
        color: COLORS.danger,
    },

    // ── MODAL STYLES ──
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: COLORS.text,
    },
    modalSub: {
        fontSize: 11,
        color: COLORS.textSub,
        marginTop: 2,
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#1e293b',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCloseText: {
        fontSize: 14,
        fontWeight: '900',
        color: COLORS.textSub,
    },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
        borderRadius: 12,
        padding: 10,
        marginBottom: 12,
    },
    errorText: {
        color: '#f87171',
        fontSize: 12,
        fontWeight: '600',
    },
    inputGroup: {
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.textSub,
        marginBottom: 6,
    },
    textInput: {
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 16,
        color: COLORS.text,
        fontWeight: '700',
        letterSpacing: 2,
    },
    toggleShowBtn: {
        alignSelf: 'flex-end',
        paddingVertical: 4,
        paddingHorizontal: 6,
        marginBottom: 14,
    },
    toggleShowText: {
        fontSize: 12,
        color: COLORS.accent,
        fontWeight: '700',
    },
    submitPinBtn: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    submitPinGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    submitPinText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#fff',
    },
    modalBodyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    modalBodyLabel: {
        fontSize: 13,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    modalBodyVal: {
        fontSize: 14,
        color: COLORS.text,
        fontWeight: '800',
    },
});
