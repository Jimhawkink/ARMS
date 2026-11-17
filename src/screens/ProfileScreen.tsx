import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, StatusBar, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TenantSession, formatKES, maskPhone, changeTenantPin } from '../lib/supabase';
import { APP_VERSION } from '../lib/version';

interface Props {
    session: TenantSession;
    onLogout: () => void;
}

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', accent: '#10b981', danger: '#ef4444',
    text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
    warning: '#f59e0b',
};

function InfoRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
    return (
        <View style={s.infoRow}>
            <Text style={s.infoEmoji}>{emoji}</Text>
            <Text style={s.infoLabel}>{label}</Text>
            <Text style={s.infoValue}>{value || '—'}</Text>
        </View>
    );
}

export default function ProfileScreen({ session, onLogout }: Props) {
    // PIN Change Modal State
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [showPins, setShowPins] = useState(false);
    const [savingPin, setSavingPin] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: onLogout },
        ]);
    };

    const handleOpenPinModal = () => {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setPinError(null);
        setShowPins(false);
        setPinModalVisible(true);
    };

    const handleSavePin = async () => {
        setPinError(null);

        const curr = currentPin.trim();
        const next = newPin.trim();
        const conf = confirmPin.trim();

        if (!curr) {
            setPinError('Please enter your current PIN');
            return;
        }
        if (!next) {
            setPinError('Please enter a new PIN');
            return;
        }
        if (!/^\d{4,6}$/.test(next)) {
            setPinError('New PIN must be strictly 4 to 6 numeric digits');
            return;
        }
        if (next !== conf) {
            setPinError('New PIN and Confirm PIN do not match');
            return;
        }
        if (next === curr) {
            setPinError('New PIN cannot be the same as your current PIN');
            return;
        }

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

    const initials = session.tenant_name
        .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                {/* Avatar Card */}
                <LinearGradient
                    colors={['#4f46e5', '#7c3aed', '#1e40af']}
                    style={s.heroCard}
                >
                    <View style={s.heroDecor1} />
                    <View style={s.heroDecor2} />
                    <View style={s.avatarWrap}>
                        <View style={s.avatar}>
                            <Text style={s.avatarText}>{initials}</Text>
                        </View>
                        <View style={s.onlineDot} />
                    </View>
                    <Text style={s.heroName}>{session.tenant_name}</Text>
                    <Text style={s.heroSub}>Tenant • {session.location_name}</Text>
                    <View style={s.heroChips}>
                        <View style={s.chip}><Text style={s.chipText}>🏠 {session.unit_name}</Text></View>
                        <View style={s.chip}><Text style={s.chipText}>📞 {maskPhone(session.phone)}</Text></View>
                    </View>
                </LinearGradient>

                {/* Details Card */}
                <View style={s.detailsCard}>
                    <Text style={s.sectionTitle}>👤 Personal Details</Text>
                    <InfoRow emoji="📝" label="Full Name" value={session.tenant_name} />
                    <InfoRow emoji="📞" label="Phone" value={session.phone} />
                    <InfoRow emoji="🪪" label="ID Number" value={session.id_number} />
                    <InfoRow emoji="📧" label="Email" value={session.email} />
                </View>

                {/* Rental Info */}
                <View style={s.detailsCard}>
                    <Text style={s.sectionTitle}>🏠 Rental Info</Text>
                    <InfoRow emoji="🚪" label="Room" value={session.unit_name} />
                    <InfoRow emoji="📍" label="Location" value={session.location_name} />
                    <InfoRow emoji="💰" label="Monthly Rent" value={formatKES(session.monthly_rent)} />
                    <InfoRow emoji="🔐" label="Deposit Paid" value={formatKES(session.deposit_paid)} />
                    <InfoRow emoji="📅" label="Move-In Date" value={
                        session.move_in_date
                            ? new Date(session.move_in_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
                            : '—'
                    } />
                    <InfoRow emoji="⚠️" label="Outstanding" value={formatKES(session.balance)} />
                </View>

                {/* ── 🔒 Security & PIN Settings ── */}
                <View style={s.detailsCard}>
                    <Text style={s.sectionTitle}>🔒 Security & Login PIN</Text>
                    <InfoRow emoji="🔑" label="Login PIN" value="•••••• (Configured)" />
                    <InfoRow emoji="🛡️" label="Protection" value="Bcrypt + RLS Enforced" />

                    <TouchableOpacity
                        onPress={handleOpenPinModal}
                        activeOpacity={0.85}
                        style={s.changePinBtn}
                    >
                        <LinearGradient
                            colors={['#4f46e5', '#6366f1']}
                            style={s.changePinGrad}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={s.changePinEmoji}>🔐</Text>
                            <Text style={s.changePinText}>Change Login PIN</Text>
                            <Text style={s.changePinArrow}>→</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* App Info */}
                <View style={s.detailsCard}>
                    <Text style={s.sectionTitle}>ℹ️ App Info</Text>
                    <InfoRow emoji="📱" label="App Version" value={`ARMS Tenant ${APP_VERSION}`} />
                    <InfoRow emoji="🔒" label="Security" value="Encrypted API + Strict RLS" />
                    <InfoRow emoji="📞" label="Support" value="0720316175" />
                </View>

                {/* Logout */}
                <TouchableOpacity onPress={handleLogout} activeOpacity={0.85} style={s.logoutBtn}>
                    <LinearGradient colors={['#ef4444', '#dc2626']} style={s.logoutGrad}>
                        <Text style={s.logoutEmoji}>🚪</Text>
                        <Text style={s.logoutText}>Logout</Text>
                    </LinearGradient>
                </TouchableOpacity>

                {/* Footer */}
                <View style={s.footer}>
                    <Text style={s.footerTitle}>💎 Alpha Solutions</Text>
                    <Text style={s.footerDev}>Developed by Jimhawkins Korir</Text>
                    <Text style={s.footerPhone}>📞 0720316175</Text>
                    <Text style={s.footerCopy}>© {new Date().getFullYear()} ARMS Tenant App</Text>
                </View>
            </ScrollView>

            {/* ── 🔒 Change Login PIN Modal ── */}
            <Modal
                visible={pinModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => {
                    if (!savingPin) setPinModalVisible(false);
                }}
            >
                <View style={s.modalBackdrop}>
                    <View style={s.modalContent}>
                        {/* Header */}
                        <View style={s.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.modalTitle}>🔒 Change Login PIN</Text>
                                <Text style={s.modalSub}>
                                    Update your 4-6 digit numeric login PIN.
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setPinModalVisible(false)}
                                disabled={savingPin}
                                style={s.modalCloseBtn}
                            >
                                <Text style={s.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Error Alert */}
                        {pinError && (
                            <View style={s.errorBox}>
                                <Text style={s.errorText}>⚠️ {pinError}</Text>
                            </View>
                        )}

                        {/* Input 1: Current PIN */}
                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>Current PIN</Text>
                            <TextInput
                                style={s.textInput}
                                placeholder="Enter current PIN"
                                placeholderTextColor={C.dim}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry={!showPins}
                                value={currentPin}
                                onChangeText={setCurrentPin}
                            />
                        </View>

                        {/* Input 2: New PIN */}
                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>New PIN (4 to 6 Digits)</Text>
                            <TextInput
                                style={s.textInput}
                                placeholder="Enter new numeric PIN"
                                placeholderTextColor={C.dim}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry={!showPins}
                                value={newPin}
                                onChangeText={setNewPin}
                            />
                        </View>

                        {/* Input 3: Confirm PIN */}
                        <View style={s.inputGroup}>
                            <Text style={s.inputLabel}>Confirm New PIN</Text>
                            <TextInput
                                style={s.textInput}
                                placeholder="Re-enter new PIN"
                                placeholderTextColor={C.dim}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry={!showPins}
                                value={confirmPin}
                                onChangeText={setConfirmPin}
                            />
                        </View>

                        {/* Show / Hide Toggle */}
                        <TouchableOpacity
                            onPress={() => setShowPins(p => !p)}
                            style={s.toggleShowBtn}
                        >
                            <Text style={s.toggleShowText}>
                                {showPins ? '🙈 Hide Numbers' : '👁️ Show Numbers'}
                            </Text>
                        </TouchableOpacity>

                        {/* Submit Button */}
                        <TouchableOpacity
                            onPress={handleSavePin}
                            disabled={savingPin}
                            activeOpacity={0.85}
                            style={[s.submitPinBtn, savingPin && { opacity: 0.7 }]}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={s.submitPinGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {savingPin ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Text style={s.submitPinEmoji}>💾</Text>
                                        <Text style={s.submitPinText}>Update & Save PIN</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    content: { padding: 16, paddingBottom: 40 },
    heroCard: {
        borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16,
        overflow: 'hidden',
    },
    heroDecor1: { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.08)' },
    heroDecor2: { position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)' },
    avatarWrap: { position: 'relative', marginBottom: 12 },
    avatar: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 28, fontWeight: '900', color: '#fff' },
    onlineDot: {
        position: 'absolute', bottom: -2, right: -2,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: '#10b981', borderWidth: 3, borderColor: '#4f46e5',
    },
    heroName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 },
    heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 14 },
    heroChips: { flexDirection: 'row', gap: 8 },
    chip: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    chipText: { fontSize: 11, color: '#fff', fontWeight: '700' },
    detailsCard: {
        backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: C.border,
    },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 12 },
    infoRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    infoEmoji: { fontSize: 16, width: 30 },
    infoLabel: { fontSize: 12, color: C.sub, fontWeight: '600', flex: 1 },
    infoValue: { fontSize: 12, color: C.text, fontWeight: '700', textAlign: 'right', flex: 1.2 },
    changePinBtn: {
        borderRadius: 14, overflow: 'hidden', marginTop: 12,
    },
    changePinGrad: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    },
    changePinEmoji: { fontSize: 16, marginRight: 8 },
    changePinText: { fontSize: 13, fontWeight: '800', color: '#fff', flex: 1 },
    changePinArrow: { fontSize: 16, fontWeight: '900', color: '#fff' },
    logoutBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 8, marginBottom: 24 },
    logoutGrad: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, gap: 8,
    },
    logoutEmoji: { fontSize: 18 },
    logoutText: { fontSize: 16, fontWeight: '900', color: '#fff' },
    footer: { alignItems: 'center', gap: 4, paddingBottom: 20 },
    footerTitle: { fontSize: 13, color: C.sub, fontWeight: '700' },
    footerDev: { fontSize: 10, color: C.dim },
    footerPhone: { fontSize: 10, color: C.dim },
    footerCopy: { fontSize: 10, color: C.dim, marginTop: 4 },

    // Modal Styles
    modalBackdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    modalContent: {
        width: '100%', maxWidth: 360, backgroundColor: C.card,
        borderRadius: 24, padding: 20, borderWidth: 1, borderColor: C.border,
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', marginBottom: 16,
    },
    modalTitle: { fontSize: 16, fontWeight: '900', color: C.text },
    modalSub: { fontSize: 11, color: C.sub, marginTop: 2 },
    modalCloseBtn: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: C.border,
        alignItems: 'center', justifyContent: 'center',
    },
    modalCloseText: { fontSize: 14, fontWeight: '900', color: C.sub },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
        borderRadius: 12, padding: 10, marginBottom: 12,
    },
    errorText: { color: '#f87171', fontSize: 12, fontWeight: '600' },
    inputGroup: { marginBottom: 12 },
    inputLabel: { fontSize: 11, fontWeight: '700', color: C.sub, marginBottom: 6 },
    textInput: {
        backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text,
        fontWeight: '700', letterSpacing: 2,
    },
    toggleShowBtn: {
        alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 6, marginBottom: 16,
    },
    toggleShowText: { fontSize: 12, color: C.primary, fontWeight: '700' },
    submitPinBtn: {
        borderRadius: 14, overflow: 'hidden',
    },
    submitPinGrad: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 14, gap: 8,
    },
    submitPinEmoji: { fontSize: 16 },
    submitPinText: { fontSize: 14, fontWeight: '900', color: '#fff' },
});
