import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Alert,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StaffSession } from '../lib/supabase';

interface Props {
    staff: StaffSession;
    onLogout: () => void;
    onBack?: () => void;
}

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    primary: '#6366f1',
    accent: '#10b981',
    danger: '#ef4444',
    gold: '#fbbf24',
    text: '#f8fafc',
    textSub: '#94a3b8',
    textDim: '#64748b',
};

function InfoRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoEmoji}>{emoji}</Text>
            <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
            </View>
        </View>
    );
}

function PermRow({ label, allowed }: { label: string; allowed: boolean }) {
    return (
        <View style={styles.permRow}>
            <View style={[styles.permDot, { backgroundColor: allowed ? COLORS.accent : COLORS.textDim }]} />
            <Text style={[styles.permLabel, !allowed && { color: COLORS.textDim }]}>{label}</Text>
            <Text style={[styles.permStatus, { color: allowed ? COLORS.accent : COLORS.textDim }]}>
                {allowed ? 'Enabled' : 'Restricted'}
            </Text>
        </View>
    );
}

export default function StaffProfileScreen({ staff, onLogout, onBack }: Props) {
    const isCaretaker = staff.role === 'caretaker';
    const initials = staff.staff_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    const handleLogout = () => {
        Alert.alert(
            'Confirm Logout',
            `Log out of staff session for ${staff.staff_name}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: onLogout },
            ]
        );
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            {/* Pinned Top Safe Header Bar */}
            <View style={styles.pinnedHeader}>
                {onBack && (
                    <TouchableOpacity onPress={onBack} activeOpacity={0.75} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>Staff Profile</Text>
                    <Text style={styles.headerSub}>Management & session control</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} activeOpacity={0.75} style={styles.logoutSmallBtn}>
                    <Text style={styles.logoutSmallText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* Hero Card */}
                <LinearGradient
                    colors={isCaretaker ? ['#1e293b', '#0f172a'] : ['#2a1f14', '#0f172a']}
                    style={styles.heroCard}
                >
                    <View style={styles.avatarWrap}>
                        <LinearGradient
                            colors={isCaretaker ? ['#10b981', '#047857'] : ['#f59e0b', '#d97706']}
                            style={styles.avatar}
                        >
                            <Text style={styles.avatarText}>{initials}</Text>
                        </LinearGradient>
                    </View>
                    <Text style={styles.heroName}>{staff.staff_name}</Text>
                    <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>
                            {isCaretaker ? '👔 Caretaker Desk' : '🏛️ Landlord / Admin'}
                        </Text>
                    </View>
                    {staff.phone ? (
                        <Text style={styles.heroPhone}>📱 {staff.phone}</Text>
                    ) : null}
                </LinearGradient>

                {/* Staff Information */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>STAFF CREDENTIALS</Text>
                    <InfoRow emoji="🆔" label="Staff ID" value={`#${staff.staff_id}`} />
                    <InfoRow emoji="👔" label="Role" value={isCaretaker ? 'Caretaker' : 'Landlord / Admin'} />
                    {staff.location_name ? (
                        <InfoRow emoji="📍" label="Assigned Property" value={staff.location_name} />
                    ) : (
                        <InfoRow emoji="🌐" label="Access Scope" value="All Properties / Global" />
                    )}
                    <InfoRow
                        emoji="⏱️"
                        label="Session Login"
                        value={new Date(staff.loggedInAt).toLocaleString('en-KE', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    />
                </View>

                {/* Permissions */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>ACCESS PRIVILEGES</Text>
                    <PermRow label="Search Tenants Directory" allowed />
                    <PermRow label="View Payment Statements" allowed />
                    <PermRow label="Check Outstanding Balances" allowed />
                    <PermRow label="Collect Rent (STK Express)" allowed={!isCaretaker} />
                    <PermRow label="Direct Tenant Support Chat" allowed />
                </View>

                {/* Logout Button */}
                <TouchableOpacity onPress={handleLogout} activeOpacity={0.85} style={styles.logoutBtn}>
                    <Text style={styles.logoutBtnText}>🚪 Log Out of Staff Account</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
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
        marginBottom: 12,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#ffffff',
        fontSize: 26,
        fontWeight: '900',
    },
    heroName: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 6,
    },
    roleBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 8,
    },
    roleBadgeText: {
        color: COLORS.textSub,
        fontSize: 11,
        fontWeight: '700',
    },
    heroPhone: {
        color: COLORS.textSub,
        fontSize: 12,
        fontWeight: '600',
    },
    sectionCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    sectionTitle: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
        gap: 12,
    },
    infoEmoji: {
        fontSize: 17,
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
    permRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
        gap: 10,
    },
    permDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    permLabel: {
        flex: 1,
        color: COLORS.text,
        fontSize: 13,
        fontWeight: '600',
    },
    permStatus: {
        fontSize: 11,
        fontWeight: '800',
    },
    logoutBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
        marginTop: 6,
    },
    logoutBtnText: {
        color: '#f87171',
        fontSize: 14,
        fontWeight: '900',
    },
});
