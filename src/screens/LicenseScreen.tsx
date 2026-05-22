import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, ScrollView, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

// ============================================================
// ARMS Mobile — Ultra License Activation Screen
// Validates license against ARMS web API
// Permanently binds to Android device ID
// ============================================================

const ARMS_API_BASE = 'https://arms-opal.vercel.app';
const LICENSE_STORAGE_KEY = 'arms_mobile_license';

export interface MobileLicense {
    licenseKey: string;
    clientName: string;
    expiryDate: string;
    features: string[];
    deviceId: string;
    activatedAt: string;
    isValid: boolean;
    daysUntilExpiry: number;
}

interface Props {
    onActivated: (license: MobileLicense) => void;
    errorMessage?: string;
}

const COLORS = {
    bg1: '#0f172a', bg2: '#1e1b4b', bg3: '#0c1a2e',
    primary: '#6366f1', primaryDark: '#4f46e5',
    accent: '#10b981', accentDark: '#059669',
    danger: '#ef4444', gold: '#f59e0b',
    text: '#f8fafc', textMuted: '#94a3b8', textDim: '#64748b',
    card: 'rgba(255,255,255,0.05)', cardBorder: 'rgba(255,255,255,0.1)',
};

export default function LicenseScreen({ onActivated, errorMessage }: Props) {
    const [licenseKey, setLicenseKey] = useState('');
    const [activating, setActivating] = useState(false);
    const [error, setError] = useState(errorMessage || '');
    const [deviceId, setDeviceId] = useState('');

    useEffect(() => {
        // Get device ID on mount
        const getDeviceId = async () => {
            try {
                // @ts-ignore - androidId works at runtime despite TS warning
                const id = Application.androidId || Application.applicationId || 'unknown';
                setDeviceId(id);
            } catch {
                setDeviceId('unknown-device');
            }
        };
        getDeviceId();
    }, []);

    const handleActivate = async () => {
        const trimmedKey = licenseKey.trim().toUpperCase();
        if (!trimmedKey) {
            setError('Please enter your license key');
            return;
        }

        // Validate format
        const keyPattern = /^ARMS-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
        if (!keyPattern.test(trimmedKey)) {
            setError('Invalid format. Expected: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
            return;
        }

        setActivating(true);
        setError('');

        try {
            // Hash the device ID for privacy
            const deviceHash = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                deviceId + trimmedKey.slice(0, 8)
            );

            const response = await fetch(`${ARMS_API_BASE}/api/license/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    licenseKey: trimmedKey,
                    machineId: deviceHash,
                    platform: 'android',
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                setError(result.error || 'Activation failed. Please check your key and try again.');
                return;
            }

            // Calculate days until expiry
            const expiry = new Date(result.expiryDate);
            const daysUntilExpiry = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            const license: MobileLicense = {
                licenseKey: result.licenseKey,
                clientName: result.clientName,
                expiryDate: result.expiryDate,
                features: result.features || [],
                deviceId: deviceHash,
                activatedAt: result.activatedAt || new Date().toISOString(),
                isValid: true,
                daysUntilExpiry,
            };

            // Store license
            await AsyncStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license));

            Alert.alert(
                '✅ License Activated!',
                `ARMS is now licensed to:\n\n${result.clientName}\n\nExpires: ${new Date(result.expiryDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                [{ text: 'Continue', onPress: () => onActivated(license) }]
            );
        } catch (err: any) {
            setError('Connection error. Please check your internet and try again.');
        } finally {
            setActivating(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg1} />
            <LinearGradient
                colors={[COLORS.bg1, COLORS.bg2, COLORS.bg3]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Decorative glows */}
            <View style={styles.glow1} />
            <View style={styles.glow2} />

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Logo */}
                <View style={styles.logoWrap}>
                    <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.logoGrad}>
                        <Text style={styles.logoEmoji}>🏢</Text>
                    </LinearGradient>
                    <View style={styles.logoBadge}>
                        <Text style={styles.logoBadgeText}>ARMS</Text>
                    </View>
                    <Text style={styles.title}>License Activation</Text>
                    <Text style={styles.subtitle}>Alpha Rental Management System</Text>
                </View>

                {/* Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardHeaderText}>🔑 Enter License Key</Text>
                        <Text style={styles.cardHeaderSub}>This device will be permanently registered</Text>
                    </View>

                    <View style={styles.cardBody}>
                        {/* Info box */}
                        <View style={styles.infoBox}>
                            <Text style={styles.infoTitle}>🔒 Machine-Locked License</Text>
                            <Text style={styles.infoText}>
                                Once activated, this license is permanently bound to this device.
                                It cannot be transferred to another phone.
                            </Text>
                        </View>

                        {/* Input */}
                        <Text style={styles.label}>License Key</Text>
                        <TextInput
                            style={styles.input}
                            value={licenseKey}
                            onChangeText={t => setLicenseKey(t.toUpperCase())}
                            placeholder="ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                            placeholderTextColor={COLORS.textDim}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            spellCheck={false}
                        />
                        <Text style={styles.hint}>Format: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX</Text>

                        {/* Error */}
                        {error ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>❌ {error}</Text>
                            </View>
                        ) : null}

                        {/* Activate button */}
                        <TouchableOpacity
                            style={[styles.btn, activating && styles.btnDisabled]}
                            onPress={handleActivate}
                            disabled={activating}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={activating ? ['#374151', '#1f2937'] : [COLORS.accent, COLORS.accentDark]}
                                style={styles.btnGrad}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            >
                                {activating ? (
                                    <>
                                        <ActivityIndicator color="#fff" size="small" />
                                        <Text style={styles.btnText}> Activating…</Text>
                                    </>
                                ) : (
                                    <Text style={styles.btnText}>🔑 Activate License</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Contact */}
                        <Text style={styles.contactText}>
                            Don't have a license? Contact:{'\n'}
                            <Text style={styles.contactLink}>Jimhawkins Korir · 0720316175</Text>
                        </Text>
                    </View>
                </View>

                {/* Footer */}
                <Text style={styles.footer}>© 2025 Alpha Solutions · ARMS v1.1</Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg1 },
    scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    glow1: { position: 'absolute', top: -80, left: -80, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(99,102,241,0.15)' },
    glow2: { position: 'absolute', bottom: -100, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(16,185,129,0.1)' },

    logoWrap: { alignItems: 'center', marginBottom: 28 },
    logoGrad: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10 },
    logoEmoji: { fontSize: 34 },
    logoBadge: { marginTop: -10, backgroundColor: COLORS.gold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    logoBadgeText: { color: '#1f2937', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
    title: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginTop: 14, letterSpacing: 0.5 },
    subtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },

    card: { width: '100%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    cardHeader: { backgroundColor: '#1e1b4b', paddingHorizontal: 20, paddingVertical: 16 },
    cardHeaderText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    cardHeaderSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
    cardBody: { padding: 20, gap: 12 },

    infoBox: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#bfdbfe' },
    infoTitle: { fontSize: 12, fontWeight: '800', color: '#1e40af', marginBottom: 4 },
    infoText: { fontSize: 11, color: '#1d4ed8', lineHeight: 16 },

    label: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: '#f9fafb', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 12, fontFamily: 'monospace', color: '#111827', letterSpacing: 0.5 },
    hint: { fontSize: 10, color: '#9ca3af', marginTop: -8 },

    errorBox: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#fecaca' },
    errorText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },

    btn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
    btnDisabled: { opacity: 0.5 },
    btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
    btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    contactText: { fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 18 },
    contactLink: { color: COLORS.primary, fontWeight: '700' },

    footer: { marginTop: 24, fontSize: 10, color: COLORS.textDim, textAlign: 'center' },
});
