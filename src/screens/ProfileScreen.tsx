import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Alert,
    Platform,
    Modal,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TenantSession, formatKES, changeTenantPin } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
    session: TenantSession;
    onLogout: () => void;
    onBack?: () => void;
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
    gold: '#fbbf24',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
};

function InfoRow({ emoji, label, value }: { emoji: string; label: string; value?: string | number | null }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>{emoji}</Text>
            <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value ?? '—'}</Text>
            </View>
        </View>
    );
}

function maskPhone(p?: string) {
    if (!p || p.length < 9) return p || '—';
    return p.slice(0, 4) + ' ••• ' + p.slice(-3);
}

export default function ProfileScreen({ session, onLogout, onBack }: Props) {
    // PIN Change state
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [savingPin, setSavingPin] = useState(false);
    const [pinError, setPinError] = useState('');

    const handleLogout = () => {
        Alert.alert(
            'Confirm Logout',
            `Are you sure you want to log out of ${session.tenant_name}'s account?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: onLogout },
            ]
        );
    };

    const handleOpenPinModal = () => {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setPinError('');
        setPinModalVisible(true);
    };

    const handleSavePin = async () => {
        // Validate inputs
        if (!currentPin || currentPin.trim().length < 4) {
            setPinError('Please enter your current PIN');
            return;
        }
        if (!/^\d{4,6}$/.test(newPin)) {
            setPinError('New PIN must be 4 to 6 numeric digits');
            return;
        }
        if (newPin !== confirmPin) {
            setPinError('New PINs do not match');
            return;
        }
        if (newPin.trim() === currentPin.trim()) {
            setPinError('New PIN must be different from your current PIN');
            return;
        }

        setSavingPin(true);
        setPinError('');

        try {
            // Use secure server-side API (uses service_role key — bypasses RLS correctly)
            const result = await changeTenantPin(
                session.tenant_id,
                currentPin.trim(),
                newPin.trim(),
                confirmPin.trim()
            );

            if (!result.success) {
                setPinError(result.error || 'Failed to change PIN. Please try again.');
                return;
            }

            // Success — close modal and auto-logout immediately when OK is tapped
            setPinModalVisible(false);
            Alert.alert(
                '🔐 PIN Changed Successfully',
                'Your login PIN has been updated. Please log in using your new PIN.',
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            AsyncStorage.removeItem('tenant_session').catch(() => {});
                            onLogout();
                        },
                    },
                ],
                {
                    cancelable: false,
                    onDismiss: () => {
                        AsyncStorage.removeItem('tenant_session').catch(() => {});
                        onLogout();
                    },
                }
            );
        } catch (err: any) {
            setPinError(err.message || 'Network error. Please check your connection.');
        } finally {
            setSavingPin(false);
        }
    };

    const initials = (session.tenant_name || 'T')
        .split(' ')
        .slice(0, 2)
        .map(w => w[0])
        .join('')
        .toUpperCase();

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
                        <Text style={styles.headerTitle}>My Profile & Security</Text>
                        <Text style={styles.headerSub}>Account management & credentials</Text>
                    </View>
                    <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={handleLogout}
                        style={styles.logoutSmallBtn}
                    >
                        <Text style={styles.logoutSmallText}>Logout</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Scrollable Profile Content */}
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* Avatar Hero Card */}
                <LinearGradient
                    colors={['#16213e', '#0f172a']}
                    style={styles.heroCard}
                >
                    <View style={styles.avatarWrap}>
                        <LinearGradient
                            colors={['#10b981', '#047857']}
                            style={styles.avatar}
                        >
                            <Text style={styles.avatarText}>{initials}</Text>
                        </LinearGradient>
                        <View style={styles.onlineDot} />
                    </View>
                    <Text style={styles.heroName}>{session.tenant_name}</Text>
                    <Text style={styles.heroSub}>Active Tenant • {session.location_name}</Text>
                    <View style={styles.heroChips}>
                        <View style={styles.chip}>
                            <Text style={styles.chipText}>🚪 {session.unit_name}</Text>
                        </View>
                        <View style={styles.chip}>
                            <Text style={styles.chipText}>📱 {maskPhone(session.phone)}</Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* Security & Login PIN Card */}
                <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>🔒 Security & Login PIN</Text>
                    <InfoRow emoji="🔑" label="Login PIN" value="•••••• (Configured)" />
                    <InfoRow emoji="🛡️" label="Access Level" value="Enterprise RLS Protected" />

                    <TouchableOpacity
                        onPress={handleOpenPinModal}
                        activeOpacity={0.85}
                        style={styles.changePinBtn}
                    >
                        <LinearGradient
                            colors={['#10b981', '#059669']}
                            style={styles.changePinGrad}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.changePinEmoji}>🔐</Text>
                            <Text style={styles.changePinText}>Change Login PIN</Text>
                            <Text style={styles.changePinArrow}>→</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* Personal Details Card */}
                <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>👤 Personal Details</Text>
                    <InfoRow emoji="📛" label="Full Name" value={session.tenant_name} />
                    <InfoRow emoji="📱" label="Phone" value={session.phone} />
                    <InfoRow emoji="🪪" label="ID Number" value={session.id_number} />
                    <InfoRow emoji="📧" label="Email" value={session.email} />
                </View>

                {/* Rental Info */}
                <View style={styles.detailsCard}>
                    <Text style={styles.sectionTitle}>🏠 Tenancy Dossier</Text>
                    <InfoRow emoji="🚪" label="Allocated Unit" value={session.unit_name} />
                    <InfoRow emoji="📍" label="Property Location" value={session.location_name} />
                    <InfoRow emoji="💰" label="Agreed Monthly Rent" value={session.monthly_rent ? formatKES(session.monthly_rent) : '—'} />
                    <InfoRow emoji="📅" label="Move-In Date" value={session.move_in_date} />
                    <InfoRow emoji="🛡️" label="Deposit Paid" value={session.deposit_paid ? formatKES(session.deposit_paid) : '—'} />
                </View>

                {/* Big Logout Button */}
                <TouchableOpacity
                    onPress={handleLogout}
                    activeOpacity={0.85}
                    style={styles.logoutBtn}
                >
                    <Text style={styles.logoutText}>🚪 Log Out of Account</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* PIN Change Modal */}
            <Modal
                visible={pinModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setPinModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Change Login PIN</Text>
                            <TouchableOpacity onPress={() => setPinModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSub}>
                            Choose a secure 6-digit PIN to use when logging in to your tenant account.
                        </Text>

                        {pinError ? (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorText}>{pinError}</Text>
                            </View>
                        ) : null}

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>CURRENT PIN</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={currentPin}
                                onChangeText={setCurrentPin}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry
                                placeholder="Enter your current PIN"
                                placeholderTextColor={COLORS.textDim}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>NEW PIN (4–6 DIGITS)</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={newPin}
                                onChangeText={setNewPin}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry
                                placeholder="Enter new PIN"
                                placeholderTextColor={COLORS.textDim}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>CONFIRM NEW PIN</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={confirmPin}
                                onChangeText={setConfirmPin}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry
                                placeholder="Re-enter new PIN"
                                placeholderTextColor={COLORS.textDim}
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                onPress={() => setPinModalVisible(false)}
                                style={styles.modalCancelBtn}
                            >
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleSavePin}
                                disabled={savingPin}
                                style={styles.modalSaveBtn}
                            >
                                {savingPin ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <Text style={styles.modalSaveText}>Save PIN</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    logoutSmallBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
    },
    logoutSmallText: {
        color: '#fca5a5',
        fontSize: 11,
        fontWeight: '800',
    },
    content: {
        padding: 16,
    },
    heroCard: {
        borderRadius: 22,
        padding: 22,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    avatarWrap: {
        position: 'relative',
        marginBottom: 12,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(16, 185, 129, 0.4)',
    },
    avatarText: {
        color: '#ffffff',
        fontSize: 26,
        fontWeight: '900',
    },
    onlineDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: COLORS.neonGreen,
        borderWidth: 2,
        borderColor: '#0f172a',
    },
    heroName: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 4,
    },
    heroSub: {
        color: COLORS.textSub,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 12,
    },
    heroChips: {
        flexDirection: 'row',
        gap: 8,
    },
    chip: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
    },
    chipText: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: '700',
    },
    detailsCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 14,
        letterSpacing: 0.2,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
        gap: 12,
    },
    infoEmoji: {
        fontSize: 18,
    },
    infoLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    infoValue: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: '700',
    },
    changePinBtn: {
        marginTop: 14,
        borderRadius: 14,
        overflow: 'hidden',
    },
    changePinGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    changePinEmoji: {
        fontSize: 16,
        marginRight: 8,
    },
    changePinText: {
        flex: 1,
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '800',
    },
    changePinArrow: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '900',
    },
    logoutBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
        marginTop: 4,
    },
    logoutText: {
        color: '#f87171',
        fontSize: 14,
        fontWeight: '900',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: {
        backgroundColor: '#131b2e',
        borderRadius: 22,
        padding: 22,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    modalTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: '900',
    },
    modalClose: {
        color: COLORS.textDim,
        fontSize: 18,
        fontWeight: '800',
        padding: 4,
    },
    modalSub: {
        color: COLORS.textSub,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 16,
    },
    errorBanner: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        marginBottom: 14,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 12,
        fontWeight: '700',
    },
    inputGroup: {
        marginBottom: 14,
    },
    inputLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    modalInput: {
        backgroundColor: '#0a0f1d',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: COLORS.text,
        fontSize: 15,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 10,
    },
    modalCancelBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
    },
    modalCancelText: {
        color: COLORS.textSub,
        fontSize: 13,
        fontWeight: '800',
    },
    modalSaveBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: COLORS.accent,
        alignItems: 'center',
    },
    modalSaveText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900',
    },
});
