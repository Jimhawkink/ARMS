import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl, ActivityIndicator, StatusBar, Image, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TenantSession, BillingRecord, PaymentRecord, formatKES, formatMonth,
    getTenantBilling, getUnpaidBilling, getTrueTotalBalance,
    getTenantActivePenalties, getTenantPayments, TenantPenaltyInfo,
} from '../lib/supabase';
import { updateSessionBalance } from '../lib/security';
import { setupNotifications, registerPushToken } from '../lib/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    session: TenantSession;
    onPayRent: () => void;
    onSessionUpdate: (updated: TenantSession) => void;
    onNavigateTab?: (tab: 'home' | 'pay' | 'history' | 'chat' | 'profile') => void;
    unreadCount?: number;
}

const ASSETS = {
    villa: require('../../assets/dashboard/hero_villa_clean.png'),
    logo: require('../../assets/dashboard/arms_logo.png'),
    goldCoins: require('../../assets/dashboard/gold_coins.png'),
    warning: require('../../assets/dashboard/penalty_warning.png'),
};

function StatusBadge({ status }: { status: string }) {
    if (status === 'Paid') {
        return (
            <View style={[styles.badge, styles.badgePaid]}>
                <Text style={styles.badgeTextPaid}>✅ Paid</Text>
            </View>
        );
    }
    if (status === 'Partial') {
        return (
            <View style={[styles.badge, styles.badgePartial]}>
                <Text style={styles.badgeTextPartial}>⏳ Partial</Text>
            </View>
        );
    }
    return (
        <View style={[styles.badge, styles.badgeUnpaid]}>
            <Text style={styles.badgeTextUnpaid}>⚠️ Unpaid</Text>
        </View>
    );
}

export default function DashboardScreen({
    session,
    onPayRent,
    onSessionUpdate,
    onNavigateTab,
    unreadCount = 0,
}: Props) {
    const [unpaidBills, setUnpaidBills] = useState<BillingRecord[]>([]);
    const [allBills, setAllBills] = useState<BillingRecord[]>([]);
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [balance, setBalance] = useState(session.balance);
    const [effectiveRent, setEffectiveRent] = useState(session.monthly_rent);
    const [penaltyInfo, setPenaltyInfo] = useState<TenantPenaltyInfo>({
        totalPenalty: 0,
        penaltyDays: 0,
        penaltyDates: [],
        dailyRate: 100,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [chartRange, setChartRange] = useState<'6M' | '3M' | '1M'>('6M');
    const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [unpaid, all, trueBalance, pen, pmts] = await Promise.all([
                getUnpaidBilling(session.tenant_id),
                getTenantBilling(session.tenant_id),
                getTrueTotalBalance(session.tenant_id),
                getTenantActivePenalties(session.tenant_id),
                getTenantPayments(session.tenant_id),
            ]);
            setUnpaidBills(unpaid);
            setAllBills(all);
            setBalance(trueBalance.total);
            setEffectiveRent(trueBalance.effectiveRent);
            setPenaltyInfo(pen);
            setPayments(pmts || []);
            await updateSessionBalance(trueBalance.total);
        } catch (err: any) {
            console.error('Dashboard load error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [session.tenant_id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        setupNotifications()
            .then(granted => {
                if (granted) registerPushToken(session.tenant_id);
            })
            .catch(() => {});
    }, [session.tenant_id]);

    const onRefresh = () => {
        setRefreshing(true);
        loadData(true);
    };

    // Derived values
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const totalArrears = unpaidBills.reduce((s, b) => s + (b.balance || 0), 0);
    const currentBill = unpaidBills.find(b => b.billing_month === currentMonthStr);
    const arrearsOnly = totalArrears - (currentBill?.balance || 0);
    const totalDue = balance + penaltyInfo.totalPenalty;
    const hasPenalty = penaltyInfo.totalPenalty > 0;

    const displayBills = showAll ? allBills : unpaidBills;

    const formattedMoveIn = useMemo(() => {
        if (!session.move_in_date) return 'Apr 1';
        try {
            const d = new Date(session.move_in_date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return 'Apr 1';
        }
    }, [session.move_in_date]);

    // ── REAL PAYMENT TREND DATA FROM DATABASE ────────────────
    const trendData = useMemo(() => {
        const monthsCount = chartRange === '1M' ? 1 : chartRange === '3M' ? 3 : 6;
        const now = new Date();
        const result: { monthKey: string; label: string; amount: number }[] = [];

        for (let i = monthsCount - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-US', { month: 'short' });

            // 1. Calculate from real payments in arms_payments
            let monthPaid = 0;
            if (payments && payments.length > 0) {
                monthPaid = payments
                    .filter(p => {
                        const pDate = p.payment_date || p.created_at || '';
                        return pDate.startsWith(monthKey);
                    })
                    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
            }

            // 2. If no payment timestamp match, check billing record amount_paid
            if (monthPaid === 0 && allBills && allBills.length > 0) {
                const bill = allBills.find(b => b.billing_month === monthKey);
                if (bill && bill.amount_paid > 0) {
                    monthPaid = Number(bill.amount_paid) || 0;
                }
            }

            result.push({ monthKey, label, amount: monthPaid });
        }

        return result;
    }, [payments, allBills, chartRange]);

    const totalRangePayments = useMemo(() => {
        return trendData.reduce((s, m) => s + m.amount, 0);
    }, [trendData]);

    const maxChartAmount = useMemo(() => {
        const peak = Math.max(...trendData.map(d => d.amount), effectiveRent || 4500);
        return peak > 0 ? peak : 4500;
    }, [trendData, effectiveRent]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={styles.loadingText}>Loading your account…</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* ══════════════════════════════════════════════════════
                    1. TOP HERO HEADER (Preserved as requested)
                ══════════════════════════════════════════════════════ */}
                <View style={styles.heroWrapper}>
                    <LinearGradient
                        colors={['#022c22', '#064e3b', '#047857']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroBackground}
                    >
                        {/* Luxury Villa Visual */}
                        <Image
                            source={ASSETS.villa}
                            style={styles.heroVillaImage}
                            resizeMode="cover"
                        />
                        <LinearGradient
                            colors={['rgba(2,44,34,0.95)', 'rgba(4,120,87,0.7)', 'rgba(2,44,34,0.1)']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={StyleSheet.absoluteFillObject}
                        />

                        {/* Top Row: App Logo, Name, Phone & Notification Bell */}
                        <View style={styles.heroTopRow}>
                            <Image source={ASSETS.logo} style={styles.heroLogo} />

                            <View style={styles.heroTenantInfo}>
                                <Text style={styles.heroTenantName} numberOfLines={1}>
                                    {session.tenant_name.toUpperCase()}
                                </Text>
                                <Text style={styles.heroTenantPhone}>
                                    📞 {session.phone}
                                </Text>
                                <View style={styles.heroMemberBadge}>
                                    <Text style={styles.heroMemberText}>👑 Premium Member</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.bellBtn}
                                activeOpacity={0.8}
                                onPress={() => onNavigateTab?.('chat')}
                            >
                                <Text style={styles.bellIcon}>🔔</Text>
                                {unreadCount > 0 && (
                                    <View style={styles.bellBadge}>
                                        <Text style={styles.bellBadgeText}>
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Quick Chips Row: Room, Location, Move-In */}
                        <View style={styles.heroChipsRow}>
                            <View style={styles.heroChip}>
                                <Text style={styles.heroChipLabel}>🛏️ Room</Text>
                                <Text style={styles.heroChipValue} numberOfLines={1}>
                                    {session.unit_name ? `ROOM ${session.unit_name.replace(/room/i, '').trim()}` : 'ROOM 28'}
                                </Text>
                            </View>

                            <View style={styles.heroChip}>
                                <Text style={styles.heroChipLabel}>📍 Location</Text>
                                <Text style={styles.heroChipValue} numberOfLines={1}>
                                    {session.location_name || 'HIGHRISE'}
                                </Text>
                            </View>

                            <View style={styles.heroChip}>
                                <Text style={styles.heroChipLabel}>📅 Move-In</Text>
                                <Text style={styles.heroChipValue} numberOfLines={1}>
                                    {formattedMoveIn}
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                </View>

                {/* ══════════════════════════════════════════════════════
                    2. LATE RENT PENALTY (Organized, Slim & Sleek - Image 3 Style)
                ══════════════════════════════════════════════════════ */}
                {hasPenalty ? (
                    <LinearGradient
                        colors={['#e11d48', '#be123c', '#9f1239']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0.8 }}
                        style={styles.slimPenaltyCard}
                    >
                        <View style={styles.slimPenaltyRow}>
                            {/* Left Warning Icon Circle */}
                            <View style={styles.slimWarningCircle}>
                                <Text style={{ fontSize: 24 }}>⚠️</Text>
                            </View>

                            {/* Middle Information */}
                            <View style={styles.slimPenaltyCenter}>
                                <Text style={styles.slimPenaltyTitle}>Late Rent Penalty Applied</Text>
                                <Text style={styles.slimPenaltySub} numberOfLines={1}>
                                    Daily penalty of KES {penaltyInfo.dailyRate || 100}/day applied from 6th of the month.
                                </Text>
                                <View style={styles.slimPenaltyStatsRow}>
                                    <Text style={styles.slimStatLabel}>Unpaid Rent: </Text>
                                    <Text style={styles.slimStatBold}>{formatKES(balance)}</Text>
                                    <View style={styles.slimStatDivider} />
                                    <Text style={styles.slimStatLabel}>Accrued Penalty: </Text>
                                    <Text style={[styles.slimStatBold, { color: '#fecdd3' }]}>
                                        +{formatKES(penaltyInfo.totalPenalty)}
                                    </Text>
                                </View>
                            </View>

                            {/* Right Action & Badge */}
                            <View style={styles.slimPenaltyRight}>
                                <View style={styles.slimDaysBadge}>
                                    <Text style={styles.slimDaysText}>
                                        ⏰ {penaltyInfo.penaltyDays || 6} Days Overdue
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    style={styles.slimActionBtn}
                                    activeOpacity={0.85}
                                    onPress={onPayRent}
                                >
                                    <Text style={styles.slimActionBtnText}>View Details →</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </LinearGradient>
                ) : balance > 0 ? (
                    /* Current Rent Due Banner */
                    <LinearGradient
                        colors={['#1e293b', '#0f172a']}
                        style={[styles.slimPenaltyCard, { borderColor: '#3b82f6' }]}
                    >
                        <View style={styles.slimPenaltyRow}>
                            <View style={[styles.slimWarningCircle, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
                                <Text style={{ fontSize: 22 }}>💳</Text>
                            </View>
                            <View style={styles.slimPenaltyCenter}>
                                <Text style={styles.slimPenaltyTitle}>Current Rent Due</Text>
                                <Text style={styles.slimPenaltySub}>Pay before the 6th to keep your account clear.</Text>
                                <Text style={[styles.slimStatBold, { color: '#60a5fa', marginTop: 2 }]}>
                                    Total Due: {formatKES(balance)}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.slimActionBtn, { backgroundColor: '#2563eb' }]}
                                activeOpacity={0.85}
                                onPress={onPayRent}
                            >
                                <Text style={[styles.slimActionBtnText, { color: '#fff' }]}>Pay Now →</Text>
                            </TouchableOpacity>
                        </View>
                    </LinearGradient>
                ) : (
                    /* All Paid Verified */
                    <LinearGradient
                        colors={['#064e3b', '#022c22']}
                        style={[styles.slimPenaltyCard, { borderColor: '#10b981' }]}
                    >
                        <View style={styles.slimPenaltyRow}>
                            <View style={[styles.slimWarningCircle, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                                <Text style={{ fontSize: 22 }}>🎉</Text>
                            </View>
                            <View style={styles.slimPenaltyCenter}>
                                <Text style={styles.slimPenaltyTitle}>All Rent Cleared & In Good Standing</Text>
                                <Text style={[styles.slimPenaltySub, { color: '#a7f3d0' }]}>
                                    Zero overdue balance. Thank you!
                                </Text>
                            </View>
                            <View style={[styles.slimDaysBadge, { borderColor: '#34d399' }]}>
                                <Text style={[styles.slimDaysText, { color: '#6ee7b7' }]}>✅ Verified</Text>
                            </View>
                        </View>
                    </LinearGradient>
                )}

                {/* ══════════════════════════════════════════════════════
                    3. REAL TENANT KPI CARDS (2x2 Super Ultra Sleek Grid)
                    - Monthly Rent
                    - Total Due (Rent + Penalty)
                    - Past Arrears
                    - Deposit Paid
                ══════════════════════════════════════════════════════ */}
                <View style={styles.kpiGridContainer}>
                    {/* Card 1: Monthly Rent */}
                    <View style={[styles.kpiCard, styles.kpiBorderGreen]}>
                        <View style={styles.kpiTopRow}>
                            <View style={[styles.kpiIconWrap, { backgroundColor: '#ecfdf5' }]}>
                                <Text style={{ fontSize: 16 }}>💰</Text>
                            </View>
                            <View style={[styles.kpiDot, { backgroundColor: '#10b981' }]} />
                        </View>
                        <Text style={styles.kpiValue} numberOfLines={1}>
                            {formatKES(effectiveRent || session.monthly_rent)}
                        </Text>
                        <Text style={styles.kpiLabel}>MONTHLY RENT</Text>
                    </View>

                    {/* Card 2: Total Due (Rent + Pen) */}
                    <View style={[styles.kpiCard, totalDue > 0 ? styles.kpiBorderRed : styles.kpiBorderGreen]}>
                        <View style={styles.kpiTopRow}>
                            <View style={[styles.kpiIconWrap, { backgroundColor: totalDue > 0 ? '#fef2f2' : '#ecfdf5' }]}>
                                <Text style={{ fontSize: 16 }}>{totalDue > 0 ? '⚠️' : '✅'}</Text>
                            </View>
                            <View style={[styles.kpiDot, { backgroundColor: totalDue > 0 ? '#ef4444' : '#10b981' }]} />
                        </View>
                        <Text style={[styles.kpiValue, { color: totalDue > 0 ? '#dc2626' : '#059669' }]} numberOfLines={1}>
                            {formatKES(totalDue)}
                        </Text>
                        <Text style={styles.kpiLabel}>
                            {hasPenalty ? 'TOTAL DUE (RENT+PEN)' : 'TOTAL BALANCE'}
                        </Text>
                    </View>

                    {/* Card 3: Past Arrears */}
                    <View style={[styles.kpiCard, arrearsOnly > 0 ? styles.kpiBorderAmber : styles.kpiBorderGreen]}>
                        <View style={styles.kpiTopRow}>
                            <View style={[styles.kpiIconWrap, { backgroundColor: arrearsOnly > 0 ? '#fffbeb' : '#ecfdf5' }]}>
                                <Text style={{ fontSize: 16 }}>🕐</Text>
                            </View>
                            <View style={[styles.kpiDot, { backgroundColor: arrearsOnly > 0 ? '#f59e0b' : '#10b981' }]} />
                        </View>
                        <Text style={[styles.kpiValue, { color: arrearsOnly > 0 ? '#d97706' : '#059669' }]} numberOfLines={1}>
                            {formatKES(Math.max(0, arrearsOnly))}
                        </Text>
                        <Text style={styles.kpiLabel}>PAST ARREARS</Text>
                    </View>

                    {/* Card 4: Deposit Paid */}
                    <View style={[styles.kpiCard, styles.kpiBorderPurple]}>
                        <View style={styles.kpiTopRow}>
                            <View style={[styles.kpiIconWrap, { backgroundColor: '#f5f3ff' }]}>
                                <Text style={{ fontSize: 16 }}>🔐</Text>
                            </View>
                            <View style={[styles.kpiDot, { backgroundColor: '#8b5cf6' }]} />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#7c3aed' }]} numberOfLines={1}>
                            {formatKES(session.deposit_paid || 0)}
                        </Text>
                        <Text style={styles.kpiLabel}>DEPOSIT PAID</Text>
                    </View>
                </View>

                {/* ══════════════════════════════════════════════════════
                    4. DIRECT PAY RENT & PENALTY CTA BUTTON (When Due > 0)
                ══════════════════════════════════════════════════════ */}
                {totalDue > 0 && (
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={onPayRent}
                        style={styles.payCtaContainer}
                    >
                        <LinearGradient
                            colors={['#10b981', '#059669', '#047857']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.payCtaGradient}
                        >
                            <Text style={{ fontSize: 26, marginRight: 10 }}>💳</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.payCtaTitle}>Pay Rent & Penalty Now</Text>
                                <Text style={styles.payCtaSubtitle}>
                                    Total Due: {formatKES(totalDue)}
                                    {hasPenalty ? ` (Rent: ${formatKES(balance)} + Penalty: ${formatKES(penaltyInfo.totalPenalty)})` : ' outstanding'}
                                </Text>
                            </View>
                            <Text style={styles.payCtaArrow}>→</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* ══════════════════════════════════════════════════════
                    5. ACTION QUICK BUTTONS (4 Clean Cards — Settings Removed)
                    - Pay Rent
                    - View History
                    - Messages (With live unread badge)
                    - Profile
                ══════════════════════════════════════════════════════ */}
                <View style={styles.actionRow}>
                    {/* 1. Pay Rent */}
                    <TouchableOpacity
                        style={styles.actionBtn}
                        activeOpacity={0.8}
                        onPress={onPayRent}
                    >
                        <LinearGradient colors={['#ecfdf5', '#d1fae5']} style={styles.actionBtnGrad}>
                            <View style={[styles.actionIconCircle, { backgroundColor: '#10b981' }]}>
                                <Text style={{ fontSize: 18 }}>💳</Text>
                            </View>
                            <Text style={[styles.actionBtnLabel, { color: '#065f46' }]}>Pay Rent</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* 2. View History */}
                    <TouchableOpacity
                        style={styles.actionBtn}
                        activeOpacity={0.8}
                        onPress={() => onNavigateTab?.('history')}
                    >
                        <LinearGradient colors={['#f0f9ff', '#e0f2fe']} style={styles.actionBtnGrad}>
                            <View style={[styles.actionIconCircle, { backgroundColor: '#0284c7' }]}>
                                <Text style={{ fontSize: 18 }}>🔄</Text>
                            </View>
                            <Text style={[styles.actionBtnLabel, { color: '#0369a1' }]}>View History</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* 3. Messages */}
                    <TouchableOpacity
                        style={styles.actionBtn}
                        activeOpacity={0.8}
                        onPress={() => onNavigateTab?.('chat')}
                    >
                        <LinearGradient colors={['#faf5ff', '#f3e8ff']} style={styles.actionBtnGrad}>
                            <View style={[styles.actionIconCircle, { backgroundColor: '#7c3aed' }]}>
                                <Text style={{ fontSize: 18 }}>💬</Text>
                            </View>
                            {unreadCount > 0 && (
                                <View style={styles.actionBadge}>
                                    <Text style={styles.actionBadgeText}>{unreadCount}</Text>
                                </View>
                            )}
                            <Text style={[styles.actionBtnLabel, { color: '#6b21a8' }]}>Messages</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* 4. Profile */}
                    <TouchableOpacity
                        style={styles.actionBtn}
                        activeOpacity={0.8}
                        onPress={() => onNavigateTab?.('profile')}
                    >
                        <LinearGradient colors={['#fff7ed', '#ffedd5']} style={styles.actionBtnGrad}>
                            <View style={[styles.actionIconCircle, { backgroundColor: '#ea580c' }]}>
                                <Text style={{ fontSize: 18 }}>👤</Text>
                            </View>
                            <Text style={[styles.actionBtnLabel, { color: '#9a3412' }]}>Profile</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* ══════════════════════════════════════════════════════
                    6. REAL PAYMENT TREND CARD (Live Database Data)
                ══════════════════════════════════════════════════════ */}
                <View style={styles.cardContainer}>
                    <View style={styles.chartHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 18 }}>📈</Text>
                            <Text style={styles.cardTitle}>Payment Trend</Text>
                        </View>

                        {/* 6M / 3M / 1M Timeframe Pills */}
                        <View style={styles.rangePillRow}>
                            {(['6M', '3M', '1M'] as const).map(range => {
                                const isSel = chartRange === range;
                                return (
                                    <TouchableOpacity
                                        key={range}
                                        style={[styles.rangePill, isSel && styles.rangePillActive]}
                                        onPress={() => {
                                            setChartRange(range);
                                            setSelectedMonthIndex(null);
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.rangePillText, isSel && styles.rangePillTextActive]}>
                                            {range}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Dynamic Real Area Bar Chart */}
                    <View style={styles.realChartRow}>
                        {/* Interactive Bars Column */}
                        <View style={styles.chartBarsContainer}>
                            {/* Horizontal guideline */}
                            <View style={styles.chartGuideline} />

                            <View style={styles.barsRow}>
                                {trendData.map((item, idx) => {
                                    const heightPct = Math.max(12, Math.min(100, Math.round((item.amount / maxChartAmount) * 100)));
                                    const isSelected = selectedMonthIndex === idx;
                                    const hasPaid = item.amount > 0;

                                    return (
                                        <TouchableOpacity
                                            key={item.monthKey}
                                            style={styles.barCol}
                                            activeOpacity={0.7}
                                            onPress={() => setSelectedMonthIndex(isSelected ? null : idx)}
                                        >
                                            {/* Tooltip amount if selected */}
                                            {isSelected && (
                                                <View style={styles.barTooltip}>
                                                    <Text style={styles.barTooltipText}>{formatKES(item.amount)}</Text>
                                                </View>
                                            )}

                                            {/* The glowing bar */}
                                            <View style={styles.barTrack}>
                                                <LinearGradient
                                                    colors={hasPaid ? ['#10b981', '#34d399', '#059669'] : ['#e2e8f0', '#cbd5e1']}
                                                    style={[styles.barFill, { height: `${heightPct}%` }]}
                                                >
                                                    {/* Glowing peak node */}
                                                    <View style={[styles.barPeakNode, hasPaid && styles.barPeakGlow]} />
                                                </LinearGradient>
                                            </View>

                                            {/* Month Label */}
                                            <Text style={[styles.chartMonthText, isSelected && { color: '#059669', fontWeight: '800' }]}>
                                                {item.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Right Real Total Summary & Gold Coins */}
                        <View style={styles.chartStatCol}>
                            <Text style={styles.chartStatValue}>
                                {formatKES(totalRangePayments)}
                            </Text>
                            <Text style={styles.chartStatLabel}>Total Payments</Text>
                            <Text style={styles.chartStatTrend}>
                                {totalRangePayments > 0 ? '↑ Verified Record' : 'No payments'}
                            </Text>
                            <Image
                                source={ASSETS.goldCoins}
                                style={styles.goldCoinsImg}
                                resizeMode="contain"
                            />
                        </View>
                    </View>
                </View>

                {/* ══════════════════════════════════════════════════════
                    7. UPCOMING BILLS DATAGRID (Spacious, Clean, Uncrammed)
                ══════════════════════════════════════════════════════ */}
                <View style={[styles.cardContainer, { marginBottom: 110 }]}>
                    <View style={styles.tableHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 18 }}>📅</Text>
                            <Text style={styles.cardTitle}>Upcoming Bills</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.viewAllBtn}
                            activeOpacity={0.8}
                            onPress={() => setShowAll(s => !s)}
                        >
                            <Text style={styles.viewAllText}>
                                {showAll ? 'Show Unpaid' : 'View All →'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Horizontal scroll to guarantee zero text squishing */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ minWidth: 440 }}>
                            {/* Table Column Headers */}
                            <View style={styles.tableHeadStrip}>
                                <Text style={[styles.thText, { width: 125 }]}>MONTH</Text>
                                <Text style={[styles.thText, { width: 85 }]}>RENT</Text>
                                <Text style={[styles.thText, { width: 80 }]}>PAID</Text>
                                <Text style={[styles.thText, { width: 85 }]}>BALANCE</Text>
                                <Text style={[styles.thText, { width: 65, textAlign: 'center' }]}>STATUS</Text>
                            </View>

                            {/* Table Body */}
                            {displayBills.length === 0 ? (
                                <View style={styles.emptyTableBox}>
                                    <Text style={{ fontSize: 32 }}>🎉</Text>
                                    <Text style={styles.emptyTableTitle}>No Unpaid Bills!</Text>
                                    <Text style={styles.emptyTableSub}>All rent accounts are fully cleared.</Text>
                                </View>
                            ) : (
                                displayBills.map((bill, idx) => {
                                    const isCurrent = bill.billing_month === currentMonthStr;
                                    const isOdd = idx % 2 === 1;
                                    return (
                                        <TouchableOpacity
                                            key={bill.billing_id || bill.billing_month}
                                            style={[
                                                styles.tableDataRow,
                                                isOdd && styles.tableDataRowOdd,
                                                isCurrent && styles.tableDataRowCurrent,
                                            ]}
                                            activeOpacity={bill.balance > 0 ? 0.75 : 1}
                                            onPress={() => {
                                                if (bill.balance > 0) onPayRent();
                                            }}
                                        >
                                            {/* Month */}
                                            <View style={{ width: 125, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ fontSize: 14 }}>🗓️</Text>
                                                <View>
                                                    <Text style={styles.tdMonth}>
                                                        {formatMonth(bill.billing_month)}
                                                    </Text>
                                                    {isCurrent && (
                                                        <Text style={styles.currentMonthTag}>Current</Text>
                                                    )}
                                                </View>
                                            </View>

                                            {/* Rent */}
                                            <Text style={[styles.tdCell, { width: 85 }]}>
                                                {formatKES(bill.rent_amount)}
                                            </Text>

                                            {/* Paid */}
                                            <Text style={[styles.tdCell, styles.tdPaid, { width: 80 }]}>
                                                {formatKES(bill.amount_paid)}
                                            </Text>

                                            {/* Balance */}
                                            <Text
                                                style={[
                                                    styles.tdCell,
                                                    bill.balance > 0 ? styles.tdBalanceRed : styles.tdBalanceGreen,
                                                    { width: 85 },
                                                ]}
                                            >
                                                {formatKES(bill.balance)}
                                            </Text>

                                            {/* Status Badge */}
                                            <View style={{ width: 65, alignItems: 'center' }}>
                                                <StatusBadge status={bill.status} />
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}

                            {/* Totals Row */}
                            {displayBills.length > 0 && (
                                <View style={styles.totalsRow}>
                                    <Text style={[styles.totalLabel, { width: 125 }]}>TOTAL</Text>
                                    <Text style={[styles.totalValue, { width: 85 }]}>
                                        {formatKES(displayBills.reduce((s, b) => s + (b.rent_amount || 0), 0))}
                                    </Text>
                                    <Text style={[styles.totalValueGreen, { width: 80 }]}>
                                        {formatKES(displayBills.reduce((s, b) => s + (b.amount_paid || 0), 0))}
                                    </Text>
                                    <Text style={[styles.totalValueRed, { width: 85 }]}>
                                        {formatKES(displayBills.reduce((s, b) => s + (b.balance || 0), 0))}
                                    </Text>
                                    <View style={{ width: 65 }} />
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f1f5f9',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '600',
    },
    scroll: {
        flex: 1,
    },
    content: {
        paddingBottom: 40,
    },

    // ── 1. Hero Header ──
    heroWrapper: {
        overflow: 'hidden',
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        marginBottom: 16,
        shadowColor: '#047857',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
        elevation: 10,
    },
    heroBackground: {
        paddingTop: (StatusBar.currentHeight || 36) + 10,
        paddingHorizontal: 18,
        paddingBottom: 22,
        position: 'relative',
    },
    heroVillaImage: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: SCREEN_WIDTH * 0.55,
        height: '100%',
        opacity: 0.75,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    heroLogo: {
        width: 60,
        height: 60,
        borderRadius: 18,
        marginRight: 14,
    },
    heroTenantInfo: {
        flex: 1,
    },
    heroTenantName: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    heroTenantPhone: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    heroMemberBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16,185,129,0.3)',
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.5)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
        marginTop: 5,
    },
    heroMemberText: {
        color: '#a7f3d0',
        fontSize: 11,
        fontWeight: '800',
    },
    bellBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(2,44,34,0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    bellIcon: {
        fontSize: 18,
    },
    bellBadge: {
        position: 'absolute',
        top: 3,
        right: 3,
        backgroundColor: '#ef4444',
        borderRadius: 9,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    bellBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
    },
    heroChipsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    heroChip: {
        flex: 1,
        backgroundColor: 'rgba(2,44,34,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.35)',
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 6,
        alignItems: 'center',
    },
    heroChipLabel: {
        fontSize: 10,
        color: '#a7f3d0',
        fontWeight: '600',
        marginBottom: 2,
    },
    heroChipValue: {
        fontSize: 12,
        color: '#ffffff',
        fontWeight: '800',
    },

    // ── 2. Slim Late Penalty Card (Image 3 Style) ──
    slimPenaltyCard: {
        marginHorizontal: 16,
        borderRadius: 20,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 14,
        borderWidth: 1.5,
        borderColor: '#f43f5e',
        shadowColor: '#e11d48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    slimPenaltyRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    slimWarningCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    slimPenaltyCenter: {
        flex: 1,
        justifyContent: 'center',
    },
    slimPenaltyTitle: {
        color: '#ffffff',
        fontSize: 13.5,
        fontWeight: '900',
    },
    slimPenaltySub: {
        color: '#fecdd3',
        fontSize: 10,
        fontWeight: '500',
        marginTop: 2,
        marginBottom: 4,
    },
    slimPenaltyStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    slimStatLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 10,
        fontWeight: '600',
    },
    slimStatBold: {
        color: '#ffffff',
        fontSize: 11.5,
        fontWeight: '900',
    },
    slimStatDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginHorizontal: 8,
    },
    slimPenaltyRight: {
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 56,
        marginLeft: 6,
    },
    slimDaysBadge: {
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        borderRadius: 12,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    slimDaysText: {
        color: '#ffffff',
        fontSize: 9.5,
        fontWeight: '800',
    },
    slimActionBtn: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 2,
    },
    slimActionBtnText: {
        color: '#be123c',
        fontSize: 10.5,
        fontWeight: '900',
    },

    // ── 3. Real Tenant KPI Grid (2x2 Ultra Cards) ──
    kpiGridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginHorizontal: 16,
        marginBottom: 14,
    },
    kpiCard: {
        width: (SCREEN_WIDTH - 42) / 2,
        height: 88,
        borderRadius: 20,
        padding: 12,
        backgroundColor: '#ffffff',
        justifyContent: 'space-between',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
        borderWidth: 1.2,
    },
    kpiBorderGreen: { borderColor: 'rgba(16,185,129,0.3)' },
    kpiBorderRed: { borderColor: 'rgba(239,68,68,0.35)' },
    kpiBorderAmber: { borderColor: 'rgba(245,158,11,0.3)' },
    kpiBorderPurple: { borderColor: 'rgba(139,92,246,0.3)' },
    kpiTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    kpiIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    kpiDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    kpiValue: {
        fontSize: 16,
        fontWeight: '900',
        color: '#0f172a',
        letterSpacing: 0.3,
    },
    kpiLabel: {
        fontSize: 9.5,
        fontWeight: '700',
        color: '#64748b',
        letterSpacing: 0.4,
    },

    // ── 4. Pay CTA Banner ──
    payCtaContainer: {
        marginHorizontal: 16,
        marginBottom: 14,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    payCtaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    payCtaTitle: {
        fontSize: 15,
        fontWeight: '900',
        color: '#ffffff',
    },
    payCtaSubtitle: {
        fontSize: 10.5,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 2,
    },
    payCtaArrow: {
        fontSize: 20,
        color: '#ffffff',
        fontWeight: '900',
        marginLeft: 8,
    },

    // ── 5. Action Quick Buttons (4 Clean Cards) ──
    actionRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 14,
        gap: 8,
    },
    actionBtn: {
        flex: 1,
    },
    actionBtnGrad: {
        borderRadius: 20,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.8)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
        position: 'relative',
    },
    actionIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    actionBtnLabel: {
        fontSize: 10.5,
        fontWeight: '800',
    },
    actionBadge: {
        position: 'absolute',
        top: 6,
        right: 8,
        backgroundColor: '#ef4444',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    actionBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '900',
    },

    // ── 6. Real Payment Trend Card ──
    cardContainer: {
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        borderRadius: 24,
        padding: 16,
        marginBottom: 14,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#0f172a',
    },
    rangePillRow: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderRadius: 14,
        padding: 2,
        gap: 3,
    },
    rangePill: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
    },
    rangePillActive: {
        backgroundColor: '#10b981',
    },
    rangePillText: {
        fontSize: 10.5,
        fontWeight: '700',
        color: '#64748b',
    },
    rangePillTextActive: {
        color: '#ffffff',
        fontWeight: '800',
    },
    realChartRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    chartBarsContainer: {
        flex: 1,
        height: 105,
        position: 'relative',
        justifyContent: 'flex-end',
        paddingRight: 6,
    },
    chartGuideline: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 30,
        height: 1,
        backgroundColor: '#f1f5f9',
    },
    barsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 85,
    },
    barCol: {
        alignItems: 'center',
        flex: 1,
        position: 'relative',
    },
    barTooltip: {
        position: 'absolute',
        top: -24,
        backgroundColor: '#0f172a',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        zIndex: 10,
    },
    barTooltipText: {
        color: '#fff',
        fontSize: 8.5,
        fontWeight: '800',
    },
    barTrack: {
        width: 16,
        height: 65,
        borderRadius: 8,
        backgroundColor: '#f8fafc',
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barFill: {
        width: '100%',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    barPeakNode: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ffffff',
        marginTop: 3,
    },
    barPeakGlow: {
        backgroundColor: '#ffffff',
    },
    chartMonthText: {
        fontSize: 9.5,
        fontWeight: '600',
        color: '#64748b',
        marginTop: 6,
    },
    chartStatCol: {
        width: 105,
        alignItems: 'flex-end',
        borderLeftWidth: 1,
        borderLeftColor: '#f1f5f9',
        paddingLeft: 8,
    },
    chartStatValue: {
        fontSize: 14.5,
        fontWeight: '900',
        color: '#0f172a',
    },
    chartStatLabel: {
        fontSize: 9.5,
        color: '#64748b',
        fontWeight: '600',
        marginTop: 1,
    },
    chartStatTrend: {
        fontSize: 10,
        color: '#10b981',
        fontWeight: '800',
        marginTop: 2,
    },
    goldCoinsImg: {
        width: 52,
        height: 42,
        marginTop: 6,
    },

    // ── 7. Upcoming Bills Table (Spacious) ──
    tableHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    viewAllBtn: {
        backgroundColor: '#10b981',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
    },
    viewAllText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: '800',
    },
    tableHeadStrip: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 8,
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        marginBottom: 4,
    },
    thText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748b',
        letterSpacing: 0.3,
    },
    tableDataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    tableDataRowOdd: {
        backgroundColor: '#fafafa',
    },
    tableDataRowCurrent: {
        backgroundColor: '#ecfdf5',
    },
    tdMonth: {
        fontSize: 11,
        fontWeight: '800',
        color: '#0f172a',
    },
    currentMonthTag: {
        fontSize: 8,
        fontWeight: '800',
        color: '#059669',
        backgroundColor: '#d1fae5',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginTop: 2,
    },
    tdCell: {
        fontSize: 11,
        color: '#334155',
        fontWeight: '600',
    },
    tdPaid: {
        color: '#059669',
        fontWeight: '700',
    },
    tdBalanceRed: {
        color: '#dc2626',
        fontWeight: '800',
    },
    tdBalanceGreen: {
        color: '#059669',
        fontWeight: '700',
    },
    totalsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        backgroundColor: '#f1f5f9',
        borderTopWidth: 2,
        borderTopColor: '#e2e8f0',
        marginTop: 4,
        borderRadius: 8,
    },
    totalLabel: {
        fontSize: 10.5,
        fontWeight: '900',
        color: '#0f172a',
    },
    totalValue: {
        fontSize: 10.5,
        fontWeight: '800',
        color: '#334155',
    },
    totalValueGreen: {
        fontSize: 10.5,
        fontWeight: '800',
        color: '#059669',
    },
    totalValueRed: {
        fontSize: 10.5,
        fontWeight: '900',
        color: '#dc2626',
    },

    // Badges
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    badgePaid: {
        backgroundColor: '#d1fae5',
    },
    badgeTextPaid: {
        color: '#065f46',
        fontSize: 9.5,
        fontWeight: '800',
    },
    badgePartial: {
        backgroundColor: '#fef3c7',
    },
    badgeTextPartial: {
        color: '#92400e',
        fontSize: 9.5,
        fontWeight: '800',
    },
    badgeUnpaid: {
        backgroundColor: '#fee2e2',
    },
    badgeTextUnpaid: {
        color: '#991b1b',
        fontSize: 9.5,
        fontWeight: '800',
    },

    emptyTableBox: {
        paddingVertical: 28,
        alignItems: 'center',
        gap: 6,
    },
    emptyTableTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0f172a',
    },
    emptyTableSub: {
        fontSize: 12,
        color: '#64748b',
    },
});
