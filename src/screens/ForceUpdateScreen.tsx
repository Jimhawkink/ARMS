import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface Props {
    currentVersion: string;
    latestVersion: string;
}

export default function ForceUpdateScreen({ currentVersion, latestVersion }: Props) {
    const pulse = useRef(new Animated.Value(1)).current;
    const slideUp = useRef(new Animated.Value(60)).current;
    const fadeIn = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance animation
        Animated.parallel([
            Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
            Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        // Pulse QR icon
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
            ])
        ).start();
    }, []);

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

                {/* Warning Icon */}
                <View style={styles.iconWrap}>
                    <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.iconGrad}>
                        <Text style={styles.iconEmoji}>⚠️</Text>
                    </LinearGradient>
                </View>

                <Text style={styles.title}>Update Required</Text>
                <Text style={styles.subtitle}>
                    Your app is outdated and needs to be updated to continue.
                </Text>

                {/* Version pills */}
                <View style={styles.versionRow}>
                    <View style={styles.versionPill}>
                        <Text style={styles.versionLabel}>Current</Text>
                        <Text style={styles.versionBad}>{currentVersion}</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                    <View style={[styles.versionPill, styles.versionPillGood]}>
                        <Text style={styles.versionLabel}>Required</Text>
                        <Text style={styles.versionGood}>{latestVersion}</Text>
                    </View>
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Instructions */}
                <Text style={styles.instructTitle}>📲 How to Update</Text>

                {[
                    { n: '1', text: 'Open your camera app' },
                    { n: '2', text: 'Scan the QR code on your door' },
                    { n: '3', text: 'Download & install the new app' },
                    { n: '4', text: 'Login with your same PIN' },
                ].map(step => (
                    <View key={step.n} style={styles.step}>
                        <View style={styles.stepNum}>
                            <Text style={styles.stepNumText}>{step.n}</Text>
                        </View>
                        <Text style={styles.stepText}>{step.text}</Text>
                    </View>
                ))}

                {/* QR pulse indicator */}
                <Animated.View style={[styles.qrBox, { transform: [{ scale: pulse }] }]}>
                    <Text style={styles.qrEmoji}>📷</Text>
                    <Text style={styles.qrText}>Scan QR on your door to download</Text>
                </Animated.View>

                {/* Download URL hint */}
                <Text style={styles.urlHint}>arms-opal.vercel.app/api/dl</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    decor1: {
        position: 'absolute', top: -60, right: -60,
        width: 200, height: 200, borderRadius: 100,
        backgroundColor: 'rgba(245,158,11,0.06)',
    },
    decor2: {
        position: 'absolute', bottom: -40, left: -40,
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: 'rgba(99,102,241,0.06)',
    },
    card: {
        width: '100%', maxWidth: 380,
        backgroundColor: '#1e293b',
        borderRadius: 28, padding: 28,
        borderWidth: 1, borderColor: '#334155',
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4, shadowRadius: 24, elevation: 14,
    },
    iconWrap: { marginBottom: 18 },
    iconGrad: {
        width: 72, height: 72, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    },
    iconEmoji: { fontSize: 36 },
    title: {
        fontSize: 24, fontWeight: '900', color: '#f8fafc',
        marginBottom: 8, textAlign: 'center',
    },
    subtitle: {
        fontSize: 13, color: '#94a3b8', textAlign: 'center',
        lineHeight: 20, marginBottom: 20,
    },

    versionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    versionPill: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
        alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    versionPillGood: {
        backgroundColor: 'rgba(16,185,129,0.12)',
        borderColor: 'rgba(16,185,129,0.3)',
    },
    versionLabel: { fontSize: 9, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
    versionBad: { fontSize: 15, fontWeight: '900', color: '#ef4444' },
    versionGood: { fontSize: 15, fontWeight: '900', color: '#10b981' },
    arrow: { fontSize: 20, color: '#475569' },

    divider: { width: '100%', height: 1, backgroundColor: '#334155', marginBottom: 20 },

    instructTitle: {
        fontSize: 13, fontWeight: '800', color: '#a5b4fc',
        marginBottom: 14, alignSelf: 'flex-start',
    },
    step: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, alignSelf: 'flex-start' },
    stepNum: {
        width: 26, height: 26, borderRadius: 8,
        backgroundColor: 'rgba(99,102,241,0.2)',
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
        alignItems: 'center', justifyContent: 'center',
    },
    stepNumText: { fontSize: 11, fontWeight: '900', color: '#a5b4fc' },
    stepText: { fontSize: 13, color: '#cbd5e1', fontWeight: '500' },

    qrBox: {
        marginTop: 20,
        backgroundColor: 'rgba(99,102,241,0.1)',
        borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14,
        borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
        alignItems: 'center', width: '100%',
    },
    qrEmoji: { fontSize: 32, marginBottom: 6 },
    qrText: { fontSize: 12, color: '#a5b4fc', fontWeight: '700', textAlign: 'center' },

    urlHint: { marginTop: 14, fontSize: 10, color: '#475569', fontWeight: '500' },
});
