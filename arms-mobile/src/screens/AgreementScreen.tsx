import React, { useState, useRef } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator, Image,
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

function fmt(n: number) { return `KES ${(n || 0).toLocaleString()}`; }

export default function AgreementScreen({ agreement, template, tenantName, onAccepted }: AgreementScreenProps) {
    const [scrolledToBottom, setScrolledToBottom] = useState(false);
    const [signatureText, setSignatureText] = useState('');
    const [signing, setSigning] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    const handleScroll = ({ nativeEvent }: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const reached = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        if (reached) setScrolledToBottom(true);
    };

    const handleAccept = async () => {
        if (!scrolledToBottom) {
            Alert.alert('Please read the full agreement', 'Scroll to the bottom to continue.');
            return;
        }
        if (signatureText.trim().length < 3) {
            Alert.alert('Type your full name', 'Please type your full name as your digital signature to confirm acceptance.');
            return;
        }

        Alert.alert(
            'Confirm Acceptance',
            `By tapping "I Accept", you confirm:\n\n• You have read the full agreement\n• You agree to all terms and conditions\n• Your name "${signatureText}" serves as your digital signature`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'I Accept', style: 'default',
                    onPress: async () => {
                        setSigning(true);
                        try {
                            const deviceId = Application.applicationId || 'unknown';
                            const deviceInfo = `App: ${deviceId}, Platform: Mobile, Signed: ${new Date().toISOString()}`;
                            const snapshot = JSON.stringify({
                                title: template?.title,
                                content: template?.content,
                                version: template?.version,
                                signedAt: new Date().toISOString(),
                                tenantName: signatureText,
                            });
                            await signAgreement(agreement.agreement_id, signatureText.trim(), deviceInfo, snapshot);
                            Alert.alert(
                                '✅ Agreement Signed',
                                'Thank you! Your tenancy agreement has been signed successfully.',
                                [{ text: 'Continue', onPress: onAccepted }]
                            );
                        } catch (err: any) {
                            Alert.alert('Error', err.message || 'Failed to sign. Please try again.');
                        }
                        setSigning(false);
                    },
                },
            ]
        );
    };

    const content = template?.content || 'No agreement content found. Please contact your landlord.';
    const adminSigUrl = template?.admin_signature_url;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <LinearGradient colors={['#1e1b4b', '#3730a3']} style={styles.header}>
                <Text style={styles.headerEmoji}>📋</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>{template?.title || 'Tenancy Agreement'}</Text>
                    <Text style={styles.headerSub}>Please read fully before signing</Text>
                </View>
            </LinearGradient>

            {/* Scroll instruction */}
            {!scrolledToBottom && (
                <View style={styles.scrollHint}>
                    <Text style={styles.scrollHintText}>👇 Scroll to the bottom to unlock signing</Text>
                </View>
            )}

            {/* Agreement content */}
            <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator
            >
                {/* Lease details card */}
                <View style={styles.detailsCard}>
                    <Text style={styles.detailsTitle}>📄 Lease Details</Text>
                    <View style={styles.detailsGrid}>
                        {[
                            { label: 'Tenant', value: tenantName },
                            { label: 'Unit', value: agreement.unit_name || '—' },
                            { label: 'Monthly Rent', value: fmt(agreement.monthly_rent) },
                            { label: 'Deposit', value: fmt(agreement.deposit_amount) },
                            { label: 'Lease Start', value: agreement.lease_start_date || '—' },
                            { label: 'Lease End', value: agreement.lease_end_date || 'Month-to-Month' },
                            { label: 'Issued By', value: agreement.issued_by },
                        ].map(item => (
                            <View key={item.label} style={styles.detailRow}>
                                <Text style={styles.detailLabel}>{item.label}</Text>
                                <Text style={styles.detailValue}>{item.value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Agreement body */}
                <View style={styles.bodyCard}>
                    <Text style={styles.bodyText}>{content}</Text>
                </View>

                {/* Admin signature */}
                <View style={styles.signaturesRow}>
                    <View style={styles.sigBox}>
                        <Text style={styles.sigLabel}>Landlord / Manager</Text>
                        {adminSigUrl ? (
                            <Image source={{ uri: adminSigUrl }} style={styles.sigImage} resizeMode="contain" />
                        ) : (
                            <View style={styles.sigPlaceholder} />
                        )}
                        <Text style={styles.sigName}>{template?.admin_name || '—'}</Text>
                        <Text style={styles.sigTitle}>{template?.admin_title || ''}</Text>
                    </View>
                    <View style={styles.sigBox}>
                        <Text style={styles.sigLabel}>Tenant</Text>
                        <View style={styles.sigPlaceholder} />
                        <Text style={styles.sigName}>{tenantName}</Text>
                        <Text style={styles.sigTitle}>To sign below</Text>
                    </View>
                </View>

                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Signing section */}
            <View style={[styles.signSection, !scrolledToBottom && styles.signSectionLocked]}>
                {!scrolledToBottom ? (
                    <View style={styles.lockedRow}>
                        <Text style={styles.lockedText}>🔒 Keep scrolling to read the full agreement</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.signLabel}>Type your full name as digital signature:</Text>
                        <TextInput
                            value={signatureText}
                            onChangeText={setSignatureText}
                            placeholder={tenantName || 'Full Name'}
                            placeholderTextColor="#94a3b8"
                            style={styles.sigInput}
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            onPress={handleAccept}
                            disabled={signing || signatureText.trim().length < 3}
                            style={[styles.acceptBtn, (signing || signatureText.trim().length < 3) && styles.acceptBtnDisabled]}
                            activeOpacity={0.85}
                        >
                            {signing ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.acceptBtnText}>✅ I Accept This Agreement</Text>
                            )}
                        </TouchableOpacity>
                        <Text style={styles.legalText}>
                            By accepting, you confirm this serves as your legally binding digital signature.
                        </Text>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 16,
    },
    headerEmoji: { fontSize: 28 },
    headerTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
    scrollHint: {
        backgroundColor: '#fef3c7', paddingVertical: 8, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: '#fde68a',
    },
    scrollHintText: { color: '#92400e', fontSize: 12, fontWeight: '700', textAlign: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 0 },
    detailsCard: {
        backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
        shadowRadius: 8, elevation: 3,
    },
    detailsTitle: { fontSize: 13, fontWeight: '800', color: '#1e1b4b', marginBottom: 12 },
    detailsGrid: { gap: 8 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    detailLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
    detailValue: { fontSize: 12, color: '#1e293b', fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 12 },
    bodyCard: {
        backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
        shadowRadius: 8, elevation: 3,
    },
    bodyText: { fontSize: 12.5, color: '#374151', lineHeight: 20 },
    signaturesRow: {
        flexDirection: 'row', gap: 12, marginBottom: 12,
    },
    sigBox: {
        flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
        shadowRadius: 4, elevation: 2,
    },
    sigLabel: { fontSize: 10, fontWeight: '800', color: '#6366f1', marginBottom: 8, textTransform: 'uppercase' },
    sigImage: { width: '100%', height: 50, marginBottom: 8 },
    sigPlaceholder: { height: 40, borderBottomWidth: 2, borderColor: '#d1d5db', marginBottom: 8 },
    sigName: { fontSize: 11, fontWeight: '700', color: '#1e293b' },
    sigTitle: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
    bottomSpacer: { height: 24 },
    signSection: {
        backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0',
        paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 24,
    },
    signSectionLocked: { backgroundColor: '#fafafa' },
    lockedRow: { alignItems: 'center', paddingVertical: 8 },
    lockedText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
    signLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8 },
    sigInput: {
        borderWidth: 1.5, borderColor: '#c7d2fe', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
        fontWeight: '700', color: '#1e1b4b', backgroundColor: '#eef2ff',
        marginBottom: 12, fontStyle: 'italic',
    },
    acceptBtn: {
        backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14,
        alignItems: 'center', marginBottom: 8,
    },
    acceptBtnDisabled: { backgroundColor: '#e2e8f0' },
    acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    legalText: { fontSize: 10, color: '#94a3b8', textAlign: 'center', lineHeight: 15 },
});
