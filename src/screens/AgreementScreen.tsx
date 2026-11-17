import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
    PanResponder,
    GestureResponderEvent,
    Platform,
    Dimensions,
    StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TenantAgreement, AgreementTemplate, signAgreement } from '../lib/supabase';
import * as Application from 'expo-application';

interface AgreementScreenProps {
    agreement: TenantAgreement;
    template: AgreementTemplate | null;
    tenantName: string;
    locationName?: string;
    onAccepted: () => void;
    onBack?: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const PAD_W = SCREEN_W - 48;
const PAD_H = 160;

function fillPlaceholders(text: string, vals: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vals[key] || `{{${key}}}`);
}

function fmt(n: number) {
    return `KES ${(n || 0).toLocaleString()}`;
}

interface Point {
    x: number;
    y: number;
}
interface Stroke {
    points: Point[];
}

function SignaturePad({
    onSigned,
    onClear,
}: {
    onSigned: (strokes: Stroke[]) => void;
    onClear: () => void;
}) {
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [current, setCurrent] = useState<Point[]>([]);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [padLayout, setPadLayout] = useState<{ x: number; y: number } | null>(null);

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
        onPanResponderGrant: evt => {
            const pt = getRelativePoint(evt);
            setCurrent([pt]);
            setHasDrawn(true);
        },
        onPanResponderMove: evt => {
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

    const handleClear = () => {
        setStrokes([]);
        setCurrent([]);
        setHasDrawn(false);
        onClear();
    };

    return (
        <View style={styles.padWrapper}>
            <View style={styles.padHeader}>
                <Text style={styles.padLabel}>DRAW YOUR SIGNATURE WITH YOUR FINGER</Text>
                {hasDrawn && (
                    <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Clear ↺</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View
                style={styles.padCanvas}
                onLayout={e => {
                    e.target.measure((x, y, width, height, pageX, pageY) => {
                        setPadLayout({ x: pageX, y: pageY });
                    });
                }}
                {...panResponder.panHandlers}
            >
                {[...strokes, { points: current }].map((stroke, si) =>
                    stroke.points.map((pt, pi) => {
                        if (pi === 0) return null;
                        const prev = stroke.points[pi - 1];
                        const dx = pt.x - prev.x;
                        const dy = pt.y - prev.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                        return (
                            <View
                                key={`${si}-${pi}`}
                                style={{
                                    position: 'absolute',
                                    left: prev.x,
                                    top: prev.y,
                                    width: len,
                                    height: 3,
                                    backgroundColor: '#10b981',
                                    borderRadius: 1.5,
                                    transform: [{ rotate: `${angle}deg` }],
                                }}
                            />
                        );
                    })
                )}
            </View>

            {!hasDrawn && (
                <Text style={styles.padHint}>Sign inside the box above using your finger</Text>
            )}
        </View>
    );
}

export default function AgreementScreen({
    agreement,
    template,
    tenantName,
    locationName,
    onAccepted,
    onBack,
}: AgreementScreenProps) {
    const [scrolledToBottom, setScrolledToBottom] = useState(false);
    const [signatureStrokes, setSignatureStrokes] = useState<Stroke[]>([]);
    const [signing, setSigning] = useState(false);
    const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
    const [typedName, setTypedName] = useState(tenantName);

    const handleScroll = (event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        if (isCloseToBottom && !scrolledToBottom) {
            setScrolledToBottom(true);
        }
    };

    const placeholderVals: Record<string, string> = {
        tenant_name: tenantName,
        tenant_phone: (agreement as any).tenant_phone || '',
        tenant_id_number: (agreement as any).tenant_id_number || '',
        unit_name: agreement.unit_name || '',
        location_name: locationName || '',
        monthly_rent: `KES ${(agreement.monthly_rent || 0).toLocaleString()}`,
        deposit_amount: `KES ${(agreement.deposit_amount || 0).toLocaleString()}`,
        admin_name: template?.admin_name || agreement.issued_by || 'Landlord',
        admin_title: template?.admin_title || 'Property Manager',
        issued_by: agreement.issued_by || 'Admin',
    };

    const rawContent = (() => {
        try {
            if (agreement.agreement_snapshot) {
                const s = typeof agreement.agreement_snapshot === 'string'
                    ? JSON.parse(agreement.agreement_snapshot)
                    : agreement.agreement_snapshot;
                if (s?.content) return s.content as string;
            }
        } catch { /* ignore */ }
        return template?.content || null;
    })();

    const content = rawContent ? fillPlaceholders(rawContent, placeholderVals) : null;
    const adminName = fillPlaceholders(template?.admin_name || agreement.issued_by || '—', placeholderVals);
    const adminTitle = template?.admin_title || 'Property Manager';
    const adminSigUrl = template?.admin_signature_url;

    const hasSignature = activeTab === 'draw'
        ? signatureStrokes.length > 0
        : typedName.trim().length >= 3;

    const handleAccept = async () => {
        if (!scrolledToBottom) {
            Alert.alert('Read Full Agreement', 'Please scroll to the bottom of the agreement first.');
            return;
        }
        if (!hasSignature) {
            Alert.alert('Signature Required', activeTab === 'draw'
                ? 'Please draw your signature before accepting.'
                : 'Please type your full legal name before accepting.');
            return;
        }

        const sigDisplay = activeTab === 'type' ? typedName.trim() : tenantName;

        Alert.alert(
            'Confirm & Legally Bind',
            `You are signing this lease agreement.\n\nTenant: ${tenantName}\nUnit: ${agreement.unit_name || '—'}\nRent: ${fmt(agreement.monthly_rent)}\n\nThis constitutes an electronic signature.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'I Accept & Sign',
                    style: 'default',
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
                                'Agreement Signed Successfully',
                                'Your tenancy agreement has been officially signed and recorded.',
                                [{ text: 'Continue', onPress: onAccepted }]
                            );
                        } catch (err: any) {
                            Alert.alert('Signing Error', err.message || 'Signing failed. Please try again.');
                        } finally {
                            setSigning(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Top Safe Header Bar */}
            <View style={styles.pinnedHeader}>
                {onBack && (
                    <TouchableOpacity onPress={onBack} activeOpacity={0.75} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {template?.title || 'Tenancy Lease Agreement'}
                    </Text>
                    <Text style={styles.headerSub}>Please review all terms before signing</Text>
                </View>
            </View>

            {/* Scroll hint banner */}
            {!scrolledToBottom && (
                <View style={styles.scrollHint}>
                    <Text style={styles.scrollHintText}>👇 Scroll to the bottom to unlock signature pad</Text>
                </View>
            )}

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator
            >
                {/* Lease Details Card */}
                <View style={styles.detailsCard}>
                    <Text style={styles.detailsTitle}>📄 Key Lease Terms</Text>
                    {[
                        { label: 'Tenant Name', value: tenantName },
                        { label: 'Unit', value: agreement.unit_name || '—' },
                        { label: 'Monthly Rent', value: fmt(agreement.monthly_rent) },
                        { label: 'Deposit Paid', value: fmt(agreement.deposit_amount) },
                        { label: 'Lease Start', value: agreement.lease_start_date || '—' },
                        { label: 'Lease End', value: agreement.lease_end_date || 'Month-to-Month' },
                        { label: 'Authorized Landlord', value: agreement.issued_by },
                    ].map(item => (
                        <View key={item.label} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{item.label}</Text>
                            <Text style={styles.detailValue}>{item.value}</Text>
                        </View>
                    ))}
                </View>

                {/* Agreement Body Text */}
                <View style={styles.bodyCard}>
                    {content ? (
                        <Text style={styles.bodyText}>{content}</Text>
                    ) : (
                        <View style={styles.noContentBox}>
                            <Text style={styles.noContentTitle}>Lease Agreement Document</Text>
                            <Text style={styles.noContentSub}>
                                The official lease terms are linked to your unit {agreement.unit_name}. Scroll down to sign and confirm acceptance.
                            </Text>
                        </View>
                    )}
                </View>

                {/* Signatures Row */}
                <View style={styles.signaturesRow}>
                    <View style={styles.sigBox}>
                        <Text style={styles.sigLabel}>LANDLORD / MANAGER</Text>
                        {adminSigUrl ? (
                            <Image source={{ uri: adminSigUrl }} style={styles.sigImage} resizeMode="contain" />
                        ) : (
                            <View style={styles.sigPlaceholder}>
                                <Text style={styles.sigPlaceholderText}>Official Seal</Text>
                            </View>
                        )}
                        <Text style={styles.sigName}>{adminName}</Text>
                        <Text style={styles.sigTitle}>{adminTitle}</Text>
                    </View>
                    <View style={styles.sigBox}>
                        <Text style={styles.sigLabel}>TENANT SIGNATURE</Text>
                        <View style={styles.sigPlaceholder}>
                            <Text style={styles.sigPlaceholderText}>{hasSignature ? '✓ Signed' : 'Pending Sign'}</Text>
                        </View>
                        <Text style={styles.sigName}>{tenantName}</Text>
                        <Text style={styles.sigTitle}>To sign below</Text>
                    </View>
                </View>

                <View style={{ height: 24 }} />
            </ScrollView>

            {/* Signature Pad Section */}
            <View style={[styles.signSection, !scrolledToBottom && styles.signSectionLocked]}>
                {!scrolledToBottom ? (
                    <View style={styles.lockedNotice}>
                        <Text style={styles.lockedText}>🔒 Scroll through the agreement above to unlock signing</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.tabToggleRow}>
                            <TouchableOpacity
                                onPress={() => setActiveTab('draw')}
                                style={[styles.tabToggleBtn, activeTab === 'draw' && styles.tabToggleBtnActive]}
                            >
                                <Text style={[styles.tabToggleText, activeTab === 'draw' && styles.tabToggleTextActive]}>
                                    ✏️ Draw Signature
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setActiveTab('type')}
                                style={[styles.tabToggleBtn, activeTab === 'type' && styles.tabToggleBtnActive]}
                            >
                                <Text style={[styles.tabToggleText, activeTab === 'type' && styles.tabToggleTextActive]}>
                                    ⌨️ Type Name
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {activeTab === 'draw' ? (
                            <SignaturePad
                                onSigned={strokes => setSignatureStrokes(strokes)}
                                onClear={() => setSignatureStrokes([])}
                            />
                        ) : (
                            <View style={styles.typeBox}>
                                <Text style={styles.typeLabel}>FULL LEGAL NAME</Text>
                                <TextInput
                                    style={styles.typeInput}
                                    value={typedName}
                                    onChangeText={setTypedName}
                                    placeholder="Enter your full name"
                                    placeholderTextColor="#64748b"
                                />
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={handleAccept}
                            disabled={signing || !hasSignature}
                            style={[styles.acceptBtn, (!hasSignature || signing) && styles.acceptBtnDisabled]}
                        >
                            {signing ? (
                                <ActivityIndicator color="#ffffff" size="small" />
                            ) : (
                                <Text style={styles.acceptBtnText}>✓ Confirm & Sign Tenancy Agreement</Text>
                            )}
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0f1d',
    },
    pinnedHeader: {
        backgroundColor: '#0d1527',
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 46,
        paddingBottom: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        flexDirection: 'row',
        alignItems: 'center',
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
    backBtnText: {
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: '800',
    },
    headerTitleWrap: {
        flex: 1,
    },
    headerTitle: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: '900',
    },
    headerSub: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },
    scrollHint: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        paddingVertical: 8,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(245, 158, 11, 0.25)',
    },
    scrollHintText: {
        color: '#fbbf24',
        fontSize: 11,
        fontWeight: '800',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    detailsCard: {
        backgroundColor: '#131b2e',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    detailsTitle: {
        color: '#f8fafc',
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 7,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    },
    detailLabel: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '600',
    },
    detailValue: {
        color: '#f8fafc',
        fontSize: 12,
        fontWeight: '800',
    },
    bodyCard: {
        backgroundColor: '#131b2e',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    bodyText: {
        color: '#cbd5e1',
        fontSize: 13,
        lineHeight: 22,
    },
    noContentBox: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    noContentTitle: {
        color: '#f8fafc',
        fontSize: 15,
        fontWeight: '900',
        marginBottom: 6,
    },
    noContentSub: {
        color: '#94a3b8',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    signaturesRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    sigBox: {
        flex: 1,
        backgroundColor: '#131b2e',
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    sigLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: '#64748b',
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    sigImage: {
        width: 100,
        height: 40,
        marginBottom: 6,
    },
    sigPlaceholder: {
        width: 100,
        height: 40,
        backgroundColor: '#0a0f1d',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    sigPlaceholderText: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '700',
    },
    sigName: {
        color: '#f8fafc',
        fontSize: 11,
        fontWeight: '800',
    },
    sigTitle: {
        color: '#64748b',
        fontSize: 10,
        fontWeight: '600',
    },
    signSection: {
        backgroundColor: '#0d1527',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
    },
    signSectionLocked: {
        opacity: 0.8,
    },
    lockedNotice: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    lockedText: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '700',
    },
    tabToggleRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    tabToggleBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#131b2e',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    tabToggleBtnActive: {
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    tabToggleText: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: '700',
    },
    tabToggleTextActive: {
        color: '#10b981',
        fontWeight: '900',
    },
    padWrapper: {
        marginBottom: 12,
    },
    padHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    padLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: '#64748b',
        letterSpacing: 0.6,
    },
    clearBtn: {
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    clearBtnText: {
        color: '#ef4444',
        fontSize: 11,
        fontWeight: '700',
    },
    padCanvas: {
        width: '100%',
        height: PAD_H,
        backgroundColor: '#0a0f1d',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        overflow: 'hidden',
    },
    padHint: {
        color: '#64748b',
        fontSize: 10,
        textAlign: 'center',
        marginTop: 4,
    },
    typeBox: {
        marginBottom: 12,
    },
    typeLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: '#64748b',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    typeInput: {
        backgroundColor: '#0a0f1d',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: '#f8fafc',
        fontSize: 14,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    acceptBtn: {
        backgroundColor: '#10b981',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    acceptBtnDisabled: {
        backgroundColor: '#1e293b',
    },
    acceptBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
});
