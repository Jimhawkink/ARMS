import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TenantSession, formatKES, maskPhone } from '../lib/supabase';

interface Props {
    session: TenantSession;
    onLogout: () => void;
}

const C = {
    bg: '#0f172a', card: '#1e293b', border: '#334155',
    primary: '#6366f1', accent: '#10b981', danger: '#ef4444',
    text: '#f8fafc', sub: '#94a3b8', dim: '#64748b',
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
    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: onLogout },
        ]);
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

                {/* App Info */}
                <View style={s.detailsCard}>
                    <Text style={s.sectionTitle}>ℹ️ App Info</Text>
                    <InfoRow emoji="📱" label="App Version" value="ARMS Tenant v1.0" />
                    <InfoRow emoji="🔒" label="Security" value="PIN + HTTPS Encrypted" />
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
});
