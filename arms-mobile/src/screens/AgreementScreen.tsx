import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator, Image,
    PanResponder, GestureResponderEvent, Platform,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TenantAgreement, AgreementTemplate, signAgreement } from '../lib/supabase';
import * as Application from 'expo-application';

interface AgreementScreenProps {
    agreement: TenantAgreement;
    template: AgreementTemplate | null;
    tenantName: string;
    onAccepted: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const PAD_W = SCREEN_W - 48;
const PAD_H = 160;

function fmt(n: number) { return `KES ${(n || 0).toLocaleString()}`; }

// ── Finger-draw Signature Pad ─────────────────────────────────
interface Point { x: number; y: number; }
interface Stroke { points: Point[]; }

function SignaturePad({
    onSigned,
    onClear,
}: {
    onSigned: (strokes: Stroke[]) => void;
    onClear: () => void;
}) {
    const [strokes, setStrokes]         = useState<Stroke[]>([]);
    const [current, setCurrent]         = useState<Point[]>([]);
    const [hasDrawn, setHasDrawn]       = useState(false);
    const containerRef                  = useRef<View>(null);
    const [padLayout, setPadLayout]     = useState<{ x: number; y: number } | null>(null);

    const getRelativePoint = (evt: GestureResponderEvent): Point => {
        const touch = evt.nativeEvent;
        const ox = padLayout?.x || 0;
        const oy = padLayout?.y || 0;
        return {
            x: Math.max(0, Math.min(PAD_W, touch.pageX - ox)),
            y: Math.max(0, Math.min(PAD_H, touch.pageY - oy)),
        };
    };

    const panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
            const pt = getRelativePoint(evt);
            setCurrent([pt]);
            setHasDrawn(true);
        },
        onPanResponderMove: (evt) => {
            const pt = getRelativePoint(evt);
            setCurrent(prev => [...prev, pt]);
        },
        onPanResponderRelease: () => {
            if (current.length > 0) {
                const newStrokes = [...strokes, { points: current }];
                setStrokes(newStrokes);
                onSigned(newStrokes);
            }
            setCurrent([]);
        },
    });

    const clearPad = () => {
        setStrokes([]);
        setCurrent([]);
        setHasDrawn(false);
        onClear();
    };

    // Convert strokes to SVG path strings for rendering
    const strokeToPath = (pts: Point[]): string => {
        if (pts.length === 0) return '';
        if (pts.length === 1) return `M${pts[0].x},${pts[0].y} L${pts[0].x + 0.1},${pts[0].y}`;
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    };

    return (
        <View style={styles.padWrapper}>
            <View style={styles.padLabelRow}>
                <Text style={styles.padLabel}>✍️ Sign with your finger below</Text>
                {hasDrawn && (
                    <TouchableOpacity onPress={clearPad} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Clear</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Signature canvas */}
            <View
                ref={containerRef}
                style={styles.padCanvas}
                onLayout={(e) => {
                    containerRef.current?.measure((x, y, w, h, px, py) => {
                        setPadLayout({ x: px, y: py });
                    });
                }}
                {...panResponder.panHandlers}
            >
                {/* Guideline */}
                <View style={styles.padGuideLine} pointerEvents="none" />
                <Text style={styles.padGuideText} pointerEvents="none">Sign here</Text>

                {/* Render completed strokes as SVG-like lines using absolute views */}
                {[...strokes, current.length > 0 ? { points: current } : null]
                    .filter(Boolean)
                    .map((stroke, si) =>
                        (stroke!.points).slice(0, -1).map((pt, pi) => {
                            const next = stroke!.points[pi + 1];
                            if (!next) return null;
                            const dx = next.x - pt.x;
                            const dy = next.y - pt.y;
                            const len = Math.sqrt(dx * dx + dy * dy);
                            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                            return (
                                <View
                                    key={`${si}-${pi}`}
                                    pointerEvents="none"
                                    style={{
                                        position: 'absolute',
                                        left: pt.x,
                                        top: pt.y - 1.5,
                                        width: len,
                                        height: 3,
                                        backgroundColor: '#1e1b4b',
                                        borderRadius: 1.5,
                                        transformOrigin: 'left center',
                                        transform: [{ rotate: `${angle}deg` }],
                                    }}
                                />
                            );
                        })
                    )}
            </View>

            {!hasDrawn && (
                <Text style={styles.padHint}>Draw your signature above with your finger</Text>
            )}
        </View>
    );
}

// ── Main AgreementScreen ─────────────────────────────────────
export default function AgreementScreen({ agreement, template, tenantName, onAccepted }: AgreementScreenProps) {
    const [scrolledToBottom, setScrolledToBottom] = useState(false);
    const [signatureStrokes, setSignatureStrokes] = useState<Stroke[]>([]);
    const [signing, setSigning] = useState(false);
    const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
    const [typedName, setTypedName] = useState('');

    const handleScroll = ({ nativeEvent }: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const reached = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        if (reached) setScrolledToBottom(true);
    };

    // Get the content — first check agreement_snapshot, then template
    const snapshotContent = (() => {
        try {
            if (!agreement.agreement_snapshot) return null;
            const s = typeof agreement.agreement_snapshot === 'string'
                ? JSON.parse(agreement.agreement_snapshot)
                : agreement.agreement_snapshot;
            return s?.content || null;
        } catch { return null; }
    })();

    const content = snapshotContent || template?.content || null;
    const adminName = (() => {
        try {
            const s = typeof agreement.agreement_snapshot === 'string'
                ? JSON.parse(agreement.agreement_snapshot || '{}')
                : (agreement.agreement_snapshot || {});
            return s?.admin_name || template?.admin_name || '—';
        } catch { return template?.admin_name || '—'; }
    })();
    const adminTitle = (() => {
        try {
            const s = typeof agreement.agreement_snapshot === 'string'
                ? JSON.parse(agreement.agreement_snapshot || '{}')
                : (agreement.agreement_snapshot || {});
            return s?.admin_title || template?.admin_title || '';
        } catch { return template?.admin_title || ''; }
    })();
    const adminSigUrl = template?.admin_signature_url;

    const hasSignature = activeTab === 'draw'
        ? signatureStrokes.length > 0
        : typedName.trim().length >= 3;

    const handleAccept = async () => {
        if (!scrolledToBottom) {
            Alert.alert('Read the full agreement', 'Please scroll all the way to the bottom first.');
            return;
        }
        if (!hasSignature) {
            Alert.alert('Signature required', activeTab === 'draw'
                ? 'Please draw your signature before accepting.'
                : 'Please type your full name before accepting.');
            return;
        }

        const sigDisplay = activeTab === 'type' ? typedName.trim() : tenantName;

        Alert.alert(
            'Confirm & Sign',
            `You are about to sign this tenancy agreement.\n\nTenant: ${tenantName}\nUnit: ${agreement.unit_name || '—'}\nRent: ${fmt(agreement.monthly_rent)}\n\nThis is legally binding.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: '✅ I Accept & Sign', style: 'default',
                    onPress: async () => {
                        setSigning(true);
                        try {
                            const deviceId = Application.applicationId || 'unknown';
                            const deviceInfo = `App: ${deviceId}, Platform: Mobile (${Platform.OS}), Signed: ${new Date().toISOString()}`;
                            const snapshot = JSON.stringify({
                                title: template?.title,
                                content: content,
                                version: template?.version,
                                signedAt: new Date().toISOString(),
                                tenantName: sigDisplay,
                                signatureMethod: activeTab,
                                strokeCount: signatureStrokes.length,
                            });
                            await signAgreement(agreement.agreement_id, sigDisplay, deviceInfo, snapshot);
                            Alert.alert(
                                '✅ Agreement Signed!',
                                'Your tenancy agreement has been signed and recorded. Welcome!',
                                [{ text: 'Continue', onPress: onAccepted }]
                            );
                        } catch (err: any) {
                            Alert.alert('Error', err.message || 'Signing failed. Please try again.');
                        }
                        setSigning(false);
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <LinearGradient colors={['#1e1b4b', '#3730a3', '#6366f1']} style={styles.header}>
                <Text style={styles.headerEmoji}>📋</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {template?.title || 'Tenancy Agreement'}
                    </Text>
                    <Text style={styles.headerSub}>Please read fully before signing</Text>
                </View>
            </LinearGradient>

            {/* Scroll banner */}
            {!scrolledToBottom && (
                <View style={styles.scrollHint}>
                    <Text style={styles.scrollHintText}>👇 Scroll to the bottom to unlock signing</Text>
                </View>
            )}

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator
            >
                {/* Lease details */}
                <View style={styles.detailsCard}>
                    <Text style={styles.detailsTitle}>📄 Lease Details</Text>
                    {[
                        { label: 'Tenant',       value: tenantName },
                        { label: 'Unit',         value: agreement.unit_name || '—' },
                        { label: 'Monthly Rent', value: fmt(agreement.monthly_rent) },
                        { label: 'Deposit',      value: fmt(agreement.deposit_amount) },
                        { label: 'Lease Start',  value: agreement.lease_start_date || '—' },
                        { label: 'Lease End',    value: agreement.lease_end_date || 'Month-to-Month' },
                        { label: 'Issued By',    value: agreement.issued_by },
                    ].map(item => (
                        <View key={item.label} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{item.label}</Text>
                            <Text style={styles.detailValue}>{item.value}</Text>
                        </View>
                    ))}
                </View>

                {/* Agreement body */}
                <View style={styles.bodyCard}>
                    {content ? (
                        <Text style={styles.bodyText}>{content}</Text>
                    ) : (
                        <View style={styles.noContentBox}>
                            <Text style={styles.noContentEmoji}>📄</Text>
                            <Text style={styles.noContentTitle}>Agreement content loading…</Text>
                            <Text style={styles.noContentSub}>
                                The agreement text will appear here once the template is set up by your landlord.
                                You can still proceed to sign using the details shown above.
                            </Text>
                        </View>
                    )}
                </View>

                {/* Signature blocks */}
                <View style={styles.signaturesRow}>
                    <View style={styles.sigBox}>
                        <Text style={styles.sigLabel}>LANDLORD / MANAGER</Text>
                        {adminSigUrl ? (
                            <Image source={{ uri: adminSigUrl }} style={styles.sigImage} resizeMode="contain" />
                        ) : (
                            <View style={styles.sigPlaceholder} />
                        )}
                        <Text style={styles.sigName}>{adminName}</Text>
                        <Text style={styles.sigTitle}>{adminTitle}</Text>
                    </View>
                    <View style={styles.sigBox}>
                        <Text style={styles.sigLabel}>TENANT</Text>
                        <View style={styles.sigPlaceholder} />
                        <Text style={styles.sigName}>{tenantName}</Text>
                        <Text style={styles.sigTitle}>To sign below</Text>
                    </View>
                </View>

                <View style={{ height: 24 }} />
            </ScrollView>

            {/* ── SIGNING SECTION ── */}
            <View style={[styles.signSection, !scrolledToBottom && styles.signSectionLocked]}>
                {!scrolledToBottom ? (
                    <View style={styles.lockedRow}>
                        <Text style={styles.lockedText}>🔒 Keep scrolling to read the full agreement</Text>
                    </View>
                ) : (
                    <>
                        {/* Tab switcher */}
                        <View style={styles.tabRow}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'draw' && styles.tabActive]}
                                onPress={() => setActiveTab('draw')}>
                                <Text style={[styles.tabText, activeTab === 'draw' && styles.tabTextActive]}>
                                    ✍️ Draw Signature
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'type' && styles.tabActive]}
                                onPress={() => setActiveTab('type')}>
                                <Text style={[styles.tabText, activeTab === 'type' && styles.tabTextActive]}>
                                    ⌨️ Type Name
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Draw pad */}
                        {activeTab === 'draw' && (
                            <SignaturePad
                                onSigned={setSignatureStrokes}
                                onClear={() => setSignatureStrokes([])}
                            />
                        )}

                        {/* Type name */}
                        {activeTab === 'type' && (
                            <View style={styles.typeSection}>
                                <Text style={styles.typeLabel}>Type your full legal name:</Text>
                                <TextInput
                                    value={typedName}
                                    onChangeText={setTypedName}
                                    placeholder={tenantName || 'Full Name'}
                                    placeholderTextColor="#94a3b8"
                                    style={styles.sigInput}
                                    autoCorrect={false}
                                    autoCapitalize="words"
                                />
                            </View>
                        )}

                        {/* Accept button */}
                        <TouchableOpacity
                            onPress={handleAccept}
                            disabled={signing || !hasSignature}
                            style={[styles.acceptBtn, (!hasSignature || signing) && styles.acceptBtnDisabled]}
                            activeOpacity={0.85}
                        >
                            {signing ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.acceptBtnText}>✅ I Accept & Sign Agreement</Text>
                            )}
                        </TouchableOpacity>
                        <Text style={styles.legalText}>
                            By accepting, you confirm this is your legally binding digital signature under Kenyan law.
                        </Text>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:       { flex: 1, backgroundColor: '#f8fafc' },
    header:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 18 },
    headerEmoji:     { fontSize: 28 },
    headerTitle:     { color: '#fff', fontSize: 15, fontWeight: '800' },
    headerSub:       { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },

    scrollHint:      { backgroundColor: '#fef3c7', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#fde68a' },
    scrollHintText:  { color: '#92400e', fontSize: 12, fontWeight: '700', textAlign: 'center' },

    scroll:          { flex: 1 },
    scrollContent:   { padding: 16, paddingBottom: 0 },

    detailsCard:     { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
    detailsTitle:    { fontSize: 13, fontWeight: '800', color: '#1e1b4b', marginBottom: 12 },
    detailRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    detailLabel:     { fontSize: 11, color: '#64748b', fontWeight: '600' },
    detailValue:     { fontSize: 12, color: '#1e293b', fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 12 },

    bodyCard:        { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
    bodyText:        { fontSize: 12.5, color: '#374151', lineHeight: 20 },

    noContentBox:    { alignItems: 'center', paddingVertical: 20 },
    noContentEmoji:  { fontSize: 36, marginBottom: 10 },
    noContentTitle:  { fontSize: 14, fontWeight: '700', color: '#475569', marginBottom: 6 },
    noContentSub:    { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 18 },

    signaturesRow:   { flexDirection: 'row', gap: 12, marginBottom: 12 },
    sigBox:          { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    sigLabel:        { fontSize: 10, fontWeight: '800', color: '#6366f1', marginBottom: 8, textTransform: 'uppercase' },
    sigImage:        { width: '100%', height: 50, marginBottom: 8 },
    sigPlaceholder:  { height: 40, borderBottomWidth: 2, borderColor: '#d1d5db', marginBottom: 8 },
    sigName:         { fontSize: 11, fontWeight: '700', color: '#1e293b' },
    sigTitle:        { fontSize: 10, color: '#94a3b8', marginTop: 2 },

    // Signing section
    signSection:     { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
    signSectionLocked: { backgroundColor: '#fafafa' },
    lockedRow:       { alignItems: 'center', paddingVertical: 8 },
    lockedText:      { color: '#64748b', fontSize: 13, fontWeight: '600' },

    // Tabs
    tabRow:          { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3, marginBottom: 12 },
    tab:             { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    tabActive:       { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
    tabText:         { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
    tabTextActive:   { color: '#6366f1', fontWeight: '800' },

    // Signature pad
    padWrapper:      { marginBottom: 12 },
    padLabelRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    padLabel:        { fontSize: 12, fontWeight: '700', color: '#374151' },
    clearBtn:        { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' },
    clearBtnText:    { fontSize: 11, fontWeight: '700', color: '#ef4444' },
    padCanvas:       {
        width: PAD_W, height: PAD_H,
        backgroundColor: '#fafafa',
        borderWidth: 2, borderColor: '#c7d2fe', borderRadius: 16,
        borderStyle: 'dashed',
        overflow: 'hidden', position: 'relative',
    },
    padGuideLine:    { position: 'absolute', bottom: 38, left: 16, right: 16, height: 1.5, backgroundColor: '#c7d2fe' },
    padGuideText:    { position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#c7d2fe', fontWeight: '600', letterSpacing: 2 },
    padHint:         { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 6, fontStyle: 'italic' },

    // Type section
    typeSection:     { marginBottom: 12 },
    typeLabel:       { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8 },
    sigInput:        { borderWidth: 1.5, borderColor: '#c7d2fe', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontWeight: '700', color: '#1e1b4b', backgroundColor: '#eef2ff', fontStyle: 'italic' },

    // Accept
    acceptBtn:       { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginBottom: 8, shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
    acceptBtnDisabled: { backgroundColor: '#e2e8f0', shadowOpacity: 0 },
    acceptBtnText:   { color: '#fff', fontSize: 15, fontWeight: '800' },
    legalText:       { fontSize: 10, color: '#94a3b8', textAlign: 'center', lineHeight: 15 },
});
