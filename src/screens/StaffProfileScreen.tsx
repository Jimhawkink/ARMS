import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StaffSession, formatKES } from '../lib/supabase';

interface Props {
    staff: StaffSession;
    onLogout: () => void;
}

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', primaryLight: '#a5b4fc',
    accent: '#10b981', danger: '#ef4444',
    gold: '#f59e0b', text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
    purple: '#8b5cf6',
};

function InfoRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
    return (
        <View style={st.infoRow}>
            <Text style={st.infoEmoji}>{emoji}</Text>
            <View style={{ flex: 1 }}>
                <Text style={st.infoLabel}>{label}</Text>
                <Text style={st.infoValue}>{value}</Text>
            </View>
        </View>
    );
}

export default function StaffProfileScreen({ staff, onLogout }: Props) {
    const isCaretaker = staff.role === 'caretaker';
    const initials = staff.staff_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const roleColor = isCaretaker ? C.primary : C.gold;
    const roleGradient: [string, string] = isCaretaker
        ? ['#4f46e5', '#7c3aed']
        : ['#b45309', '#d97706'];

    const handleLogout = () => {
        Alert.alert(
            'Confirm Logout',
            `Log out as ${staff.staff_name}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: onLogout },
            ]
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* ── Hero Card ── */}
                <LinearGradient colors={roleGradient} style={st.hero}>
                    <View style={st.heroDecor1} />
                    <View style={st.heroDecor2} />
                    <View style={st.heroAvatar}>
                        <Text style={st.heroInitials}>{initials}</Text>
                    </View>
                    <Text style={st.heroName}>{staff.staff_name}</Text>
                    <View style={st.roleBadge}>
                        <Text style={st.roleBadgeText}>
                            {isCaretaker ? '👔 Caretaker' : '🏛️ Landlord / Admin'}
                        </Text>
                    </View>
                    {staff.phone ? (
                        <Text style={st.heroPhone}>📞 {staff.phone}</Text>
                    ) : null}
                </LinearGradient>

                {/* ── Info Section ── */}
                <View style={st.section}>
                    <Text style={st.sectionTitle}>Staff Information</Text>
                    <View style={st.card}>
                        <InfoRow emoji="🆔" label="Staff ID" value={`#${staff.staff_id}`} />
                        <InfoRow emoji="👔" label="Role" value={isCaretaker ? 'Caretaker' : 'Landlord / Admin'} />
                        {staff.location_name ? (
                            <InfoRow emoji="📍" label="Assigned Location" value={staff.location_name} />
                        ) : (
                            <InfoRow emoji="🌍" label="Access" value="All Locations" />
                        )}
                        <InfoRow
                            emoji="⏰"
                            label="Session Started"
                            value={new Date(staff.loggedInAt).toLocaleString('en-KE', {
                                month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })}
                        />
                    </View>
                </View>

                {/* ── Permissions Section ── */}
                <View style={st.section}>
                    <Text style={st.sectionTitle}>Access Permissions</Text>
                    <View style={st.card}>
                        <PermRow label="Search Tenants" allowed />
                        <PermRow label="View Tenant Statements" allowed />
                        <PermRow label="View Balances" allowed />
                        <PermRow label="Collect Rent (STK Push)" allowed={!isCaretaker} />
                        <PermRow label="Modify Tenant Records" allowed={false} />
                    </View>
                </View>

                {/* ── Session Info ── */}
                <View style={st.section}>
                    <View style={st.sessionInfoBox}>
                        <Text style={st.sessionIcon}>🔐</Text>
                        <Text style={st.sessionText}>
                            Staff sessions auto-expire after 8 hours of inactivity. All actions are logged.
                        </Text>
                    </View>
                </View>

                {/* ── Logout ── */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 48, paddingTop: 8 }}>
                    <TouchableOpacity onPress={handleLogout} activeOpacity={0.85}>
                        <LinearGradient
                            colors={['#ef4444', '#dc2626']}
                            style={st.logoutBtn}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <Text style={st.logoutIcon}>🚪</Text>
                            <Text style={st.logoutText}>Logout</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    <Text style={st.logoutHint}>
                        Powered by ARMS · Alpha Solutions · Jimhawkins Korir
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

function PermRow({ label, allowed }: { label: string; allowed: boolean }) {
    return (
        <View style={st.permRow}>
            <Text style={[st.permIcon, { color: allowed ? C.accent : C.danger }]}>
                {allowed ? '✅' : '🚫'}
            </Text>
            <Text style={[st.permLabel, { color: allowed ? C.text : C.dim }]}>{label}</Text>
        </View>
    );
}

const st = StyleSheet.create({
    hero: {
        paddingTop: 56, paddingBottom: 32, paddingHorizontal: 16,
        alignItems: 'center', overflow: 'hidden',
    },
    heroDecor1: {
        position: 'absolute', top: -40, right: -40,
        width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroDecor2: {
        position: 'absolute', bottom: -30, left: -30,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    heroAvatar: {
        width: 72, height: 72, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    heroInitials: { fontSize: 28, fontWeight: '900', color: '#fff' },
    heroName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 },
    roleBadge: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
        marginBottom: 8,
    },
    roleBadgeText: { fontSize: 13, color: '#fff', fontWeight: '800' },
    heroPhone: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

    section: { paddingHorizontal: 16, paddingTop: 16 },
    sectionTitle: {
        fontSize: 12, color: C.dim, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
    },
    card: {
        backgroundColor: C.card, borderRadius: 18,
        borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    },

    infoRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 14, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    infoEmoji: { fontSize: 18, width: 28 },
    infoLabel: { fontSize: 10, color: C.dim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    infoValue: { fontSize: 14, color: C.text, fontWeight: '700' },

    permRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    permIcon: { fontSize: 16, width: 24 },
    permLabel: { fontSize: 13, fontWeight: '600' },

    sessionInfoBox: {
        flexDirection: 'row', gap: 10,
        backgroundColor: 'rgba(99,102,241,0.08)',
        borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
    },
    sessionIcon: { fontSize: 16 },
    sessionText: { flex: 1, fontSize: 11, color: C.sub, lineHeight: 17 },

    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, borderRadius: 16, paddingVertical: 16,
        shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    logoutIcon: { fontSize: 20 },
    logoutText: { fontSize: 16, fontWeight: '900', color: '#fff' },
    logoutHint: {
        fontSize: 10, color: C.dim, textAlign: 'center', marginTop: 16,
    },
});
