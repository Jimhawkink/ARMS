import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions,
    StatusBar, TouchableOpacity, Linking, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const DOWNLOAD_URL = 'https://arms-opal.vercel.app/api/dl';

interface Props {
    currentVersion: string;
    latestVersion: string;
}

export default function ForceUpdateScreen({ currentVersion, latestVersion }: Props) {
    const pulse    = useRef(new Animated.Value(1)).current;
    const slideUp  = useRef(new Animated.Value(60)).current;
    const fadeIn   = useRef(new Animated.Value(0)).current;
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        // Entrance animation
        Animated.parallel([
            Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
            Animated.timing(fadeIn,  { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        // Pulse download button
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.04, duration: 800, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
            ])
        ).start();

        // Auto-open download after 1.5s — no manual step needed
        const t = setTimeout(() => openDownload(), 1500);
        return () => clearTimeout(t);
    }, []);

    const openDownload = async () => {
        setDownloading(true);
        try {
            const supported = await Linking.canOpenURL(DOWNLOAD_URL);
            if (supported) {
                await Linking.openURL(DOWNLOAD_URL);
            }
        } catch (_) { /* ignore */ }
        setTimeout(() => setDownloading(false), 3000);
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
            <LinearGradient
                colors={['#0f172a', '#1e1b4b', '#0c1a2e']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Decorative circles */}
            <View style={styles.decor1} />
            <View style={styles.decor2} />

            <Animated.View style={[styles.card, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>

                {/* Icon */}
                <View style={styles.iconWrap}>
                    <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.iconGrad}>
                        <Text style={styles.iconEmoji}>🚀</Text>
                    </LinearGradient>
                </View>

                <Text style={styles.title}>Update Required</Text>
                <Text style={styles.subtitle}>
                    A new version is available. The download will start automatically.
                </Text>

                {/* Version pills */}
                <View style={styles.versionRow}>
                    <View style={styles.versionPill}>
                        <Text style={styles.versionLabel}>Your Version</Text>
                        <Text style={styles.versionBad}>{currentVersion}</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                    <View style={[styles.versionPill, styles.versionPillGood]}>
                        <Text style={styles.versionLabel}>New Version</Text>
                        <Text style={styles.versionGood}>{latestVersion}</Text>
                    </View>
                </View>

                <View style={styles.divider} />

                {/* ── BIG DOWNLOAD BUTTON ── */}
                <Animated.View style={{ width: '100%', transform: [{ scale: pulse }] }}>
                    <TouchableOpacity
                        onPress={openDownload}
                        activeOpacity={0.85}
                        disabled={downloading}
                    >
                        <LinearGradient
                            colors={['#6366f1', '#4f46e5', '#3730a3']}
                            style={styles.downloadBtn}
                        >
                            {downloading ? (
                                <>
                                    <ActivityIndicator color="#fff" size="small" />
                                    <Text style={styles.downloadBtnText}>Opening Download…</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.downloadBtnEmoji}>⬇️</Text>
                                    <Text style={styles.downloadBtnText}>Download v{latestVersion} Now</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>

                <Text style={styles.hint}>
                    After downloading, open the file to install, then re-open ARMS.
                </Text>

                {/* Step guide */}
                <View style={styles.steps}>
                    {[
                        '⬇️  Download starts automatically',
                        '📲  Open the downloaded .apk file',
                        '✅  Install & re-open ARMS',
                    ].map((s, i) => (
                        <View key={i} style={styles.step}>
                            <View style={styles.stepNum}>
                                <Text style={styles.stepNumText}>{i + 1}</Text>
                            </View>
                            <Text style={styles.stepText}>{s}</Text>
                        </View>
                    ))}
                </View>

                <Text style={styles.urlHint}>{DOWNLOAD_URL}</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    decor1: {
        position: 'absolute', top: -60, right: -60,
        width: 220, height: 220, borderRadius: 110,
        backgroundColor: 'rgba(99,102,241,0.08)',
    },
    decor2: {
        position: 'absolute', bottom: -80, left: -80,
        width: 280, height: 280, borderRadius: 140,
        backgroundColor: 'rgba(245,158,11,0.06)',
    },
    card: {
        backgroundColor: 'rgba(30,41,59,0.95)',
        borderRadius: 28, padding: 28,
        width: Math.min(width - 32, 400),
        alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
        shadowColor: '#6366f1', shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.3, shadowRadius: 24, elevation: 16,
    },
    iconWrap:  { marginBottom: 16 },
    iconGrad:  {
        width: 72, height: 72, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    },
    iconEmoji: { fontSize: 36 },
    title: { fontSize: 24, fontWeight: '900', color: '#f8fafc', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },

    versionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    versionPill: {
        backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    versionPillGood: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' },
    versionLabel: { fontSize: 9, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
    versionBad:   { fontSize: 15, fontWeight: '900', color: '#ef4444' },
    versionGood:  { fontSize: 15, fontWeight: '900', color: '#10b981' },
    arrow:        { fontSize: 20, color: '#475569' },

    divider: { width: '100%', height: 1, backgroundColor: '#334155', marginBottom: 20 },

    // ── Download button ──
    downloadBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 18, borderRadius: 18,
        width: '100%', marginBottom: 12,
        shadowColor: '#6366f1', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
    },
    downloadBtnEmoji: { fontSize: 22 },
    downloadBtnText:  { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },

    hint: { fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 16, lineHeight: 16 },

    steps:      { width: '100%', gap: 8, marginBottom: 16 },
    step:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepNum:    {
        width: 26, height: 26, borderRadius: 8,
        backgroundColor: 'rgba(99,102,241,0.2)',
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
        alignItems: 'center', justifyContent: 'center',
    },
    stepNumText: { fontSize: 11, fontWeight: '900', color: '#a5b4fc' },
    stepText:    { fontSize: 12, color: '#cbd5e1', fontWeight: '500', flex: 1 },

    urlHint: { marginTop: 4, fontSize: 10, color: '#334155', fontWeight: '500' },
});
