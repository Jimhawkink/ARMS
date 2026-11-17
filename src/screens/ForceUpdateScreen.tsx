import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions,
    StatusBar, TouchableOpacity, BackHandler, Linking, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const { width } = Dimensions.get('window');

const APK_DOWNLOAD_URL = 'https://arms-opal.vercel.app/api/dl';
const GITHUB_DIRECT_URL = 'https://github.com/Jimhawkink/ARMS/releases/latest/download/ARMSTenantApp.apk';

const COLORS = {
    bg: '#0a0f1d',
    card: '#131b2e',
    cardBorder: '#1e293b',
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

interface Props {
    currentVersion: string;
    latestVersion: string;
}

type Phase = 'idle' | 'downloading' | 'installing' | 'done' | 'error';

export default function ForceUpdateScreen({ currentVersion, latestVersion }: Props) {
    const slideUp = useRef(new Animated.Value(40)).current;
    const fadeIn = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [downloadedMb, setDownloadedMb] = useState('0');
    const [totalMb, setTotalMb] = useState('70.0');
    const [errorMsg, setErrorMsg] = useState('');

    // Disable Android back button — mandatory update
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => sub.remove();
    }, []);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideUp, { toValue: 0, duration: 500, useNativeDriver: true }),
            Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
            ])
        ).start();

        // Auto-start download immediately
        const t = setTimeout(() => startDownload(), 600);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 150,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const startDownload = async () => {
        try {
            setPhase('downloading');
            setProgress(0);
            setErrorMsg('');

            const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            const apkPath = `${targetDir}ARMSTenantApp-v${latestVersion}.apk`;

            // Clear old APK cache if exists
            try {
                const info = await FileSystem.getInfoAsync(apkPath);
                if (info.exists) {
                    await FileSystem.deleteAsync(apkPath, { idempotent: true });
                }
            } catch {}

            const downloadResumable = FileSystem.createDownloadResumable(
                APK_DOWNLOAD_URL,
                apkPath,
                {
                    headers: { 'Cache-Control': 'no-cache' },
                },
                (data) => {
                    if (data.totalBytesExpectedToWrite > 0) {
                        const pct = data.totalBytesWritten / data.totalBytesExpectedToWrite;
                        setProgress(Math.min(pct, 1));
                        setDownloadedMb((data.totalBytesWritten / (1024 * 1024)).toFixed(1));
                        setTotalMb((data.totalBytesExpectedToWrite / (1024 * 1024)).toFixed(1));
                    }
                }
            );

            const result = await downloadResumable.downloadAsync();
            if (!result?.uri) throw new Error('Download failed — no file received');

            setProgress(1);
            setPhase('installing');

            // Immediately invoke Android Package Installer
            let installed = false;
            try {
                const contentUri = await FileSystem.getContentUriAsync(result.uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: contentUri,
                    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                    type: 'application/vnd.android.package-archive',
                });
                installed = true;
            } catch (e1) {
                console.warn('[ForceUpdate] IntentLauncher failed, trying direct Linking:', e1);
                try {
                    const contentUri = await FileSystem.getContentUriAsync(result.uri);
                    if (await Linking.canOpenURL(contentUri)) {
                        await Linking.openURL(contentUri);
                        installed = true;
                    }
                } catch (e2) {
                    console.warn('[ForceUpdate] Direct Linking failed:', e2);
                }
            }

            if (!installed) {
                // Direct fallback browser link
                await Linking.openURL(GITHUB_DIRECT_URL);
            }

            setPhase('done');
        } catch (err: any) {
            console.warn('[ForceUpdate error]', err);
            setErrorMsg(err?.message || 'Download failed. Please tap button below to update.');
            setPhase('error');
        }
    };

    const progressPercent = Math.round(progress * 100);

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" translucent={false} />

            <LinearGradient
                colors={['#0a0f1d', '#0d1527', '#080d1a']}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.ambientGlow} />

            <Animated.View
                style={[
                    styles.card,
                    { opacity: fadeIn, transform: [{ translateY: slideUp }] },
                ]}
            >
                {/* Rocket Icon with Pulse */}
                <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulse }] }]}>
                    <LinearGradient
                        colors={['#10b981', '#059669', '#047857']}
                        style={styles.iconGrad}
                    >
                        <Text style={styles.iconEmoji}>🚀</Text>
                    </LinearGradient>
                </Animated.View>

                <Text style={styles.title}>Update Required</Text>
                <Text style={styles.subtitle}>
                    A critical security and feature upgrade is available for your ARMS Tenant App.
                </Text>

                {/* Version Comparison Pills */}
                <View style={styles.versionRow}>
                    <View style={styles.versionPill}>
                        <Text style={styles.versionLabel}>INSTALLED</Text>
                        <Text style={styles.versionBad}>{currentVersion}</Text>
                    </View>
                    <Text style={styles.arrowText}>→</Text>
                    <View style={[styles.versionPill, styles.versionPillGood]}>
                        <Text style={[styles.versionLabel, { color: '#a7f3d0' }]}>NEW VERSION</Text>
                        <Text style={styles.versionGood}>{latestVersion}</Text>
                    </View>
                </View>

                {/* Progress Area */}
                {phase === 'downloading' && (
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressTitle}>Downloading Update...</Text>
                            <Text style={styles.progressPercentText}>{progressPercent}%</Text>
                        </View>

                        <View style={styles.progressTrack}>
                            <Animated.View
                                style={[
                                    styles.progressBar,
                                    {
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0%', '100%'],
                                        }),
                                    },
                                ]}
                            />
                        </View>

                        <Text style={styles.mbText}>
                            {downloadedMb} MB / {totalMb} MB
                        </Text>
                    </View>
                )}

                {phase === 'installing' && (
                    <View style={styles.statusBox}>
                        <ActivityIndicator size="small" color={COLORS.accent} />
                        <Text style={styles.statusText}>Opening Android package installer...</Text>
                    </View>
                )}

                {phase === 'done' && (
                    <View style={styles.doneBox}>
                        <Text style={styles.doneEmoji}>✅</Text>
                        <Text style={styles.doneTitle}>Download Complete!</Text>
                        <Text style={styles.doneSub}>Follow the on-screen Android prompt to complete install.</Text>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={startDownload}
                            style={styles.retryActionBtn}
                        >
                            <Text style={styles.retryActionText}>Re-open Installer</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {phase === 'error' && (
                    <View style={styles.errorSection}>
                        <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={startDownload}
                            style={styles.retryBtn}
                        >
                            <LinearGradient
                                colors={['#6366f1', '#4f46e5']}
                                style={styles.btnGrad}
                            >
                                <Text style={styles.btnText}>🔄 Retry Fast Download</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => Linking.openURL(GITHUB_DIRECT_URL)}
                            style={styles.browserLinkBtn}
                        >
                            <Text style={styles.browserLinkText}>🌐 Or Download in Browser</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* What's new bullet points */}
                <View style={styles.featuresBox}>
                    <Text style={styles.featuresTitle}>What's New in {latestVersion}:</Text>
                    <Text style={styles.featureItem}>• M-Pesa style dashboard with balance masking</Text>
                    <Text style={styles.featureItem}>• Status bar overlap fix (zero screen bleed)</Text>
                    <Text style={styles.featureItem}>• Tenant self-service PIN change in app</Text>
                    <Text style={styles.featureItem}>• Live prepayment & overpayment month breakdown</Text>
                    <Text style={styles.featureItem}>• Auto-logout protection after 15 min idle</Text>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    ambientGlow: {
        position: 'absolute',
        top: -60,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(16,185,129,0.1)',
    },
    card: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: COLORS.card,
        borderRadius: 26,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 8,
    },
    iconWrap: {
        marginBottom: 14,
    },
    iconGrad: {
        width: 68,
        height: 68,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    iconEmoji: {
        fontSize: 32,
    },
    title: {
        fontSize: 22,
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 12,
        color: COLORS.textSub,
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 17,
    },
    versionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 18,
        marginBottom: 16,
    },
    versionPill: {
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.25)',
    },
    versionPillGood: {
        backgroundColor: 'rgba(16,185,129,0.15)',
        borderColor: 'rgba(16,185,129,0.3)',
    },
    versionLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: '#f87171',
        letterSpacing: 0.5,
    },
    versionBad: {
        fontSize: 14,
        fontWeight: '900',
        color: '#f87171',
        marginTop: 1,
    },
    versionGood: {
        fontSize: 14,
        fontWeight: '900',
        color: '#34d399',
        marginTop: 1,
    },
    arrowText: {
        fontSize: 18,
        color: COLORS.textDim,
        fontWeight: '900',
    },

    // Progress
    progressSection: {
        width: '100%',
        marginTop: 8,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    progressTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: COLORS.text,
    },
    progressPercentText: {
        fontSize: 13,
        fontWeight: '900',
        color: COLORS.accent,
    },
    progressTrack: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: COLORS.accent,
        borderRadius: 4,
    },
    mbText: {
        fontSize: 11,
        color: COLORS.textDim,
        textAlign: 'right',
        marginTop: 4,
        fontWeight: '600',
    },

    // Status / Done / Error
    statusBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
    },
    statusText: {
        fontSize: 12,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    doneBox: {
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
    },
    doneEmoji: {
        fontSize: 32,
    },
    doneTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: COLORS.text,
    },
    doneSub: {
        fontSize: 11,
        color: COLORS.textSub,
        textAlign: 'center',
    },
    retryActionBtn: {
        marginTop: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    retryActionText: {
        color: COLORS.accent,
        fontSize: 12,
        fontWeight: '800',
    },
    errorSection: {
        width: '100%',
        alignItems: 'center',
        marginTop: 10,
    },
    errorText: {
        fontSize: 12,
        color: '#f87171',
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 10,
    },
    retryBtn: {
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
    },
    btnGrad: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    btnText: {
        fontSize: 13,
        fontWeight: '900',
        color: '#fff',
    },
    browserLinkBtn: {
        marginTop: 8,
        paddingVertical: 6,
    },
    browserLinkText: {
        fontSize: 11,
        color: COLORS.primaryLight,
        fontWeight: '700',
    },

    // Features
    featuresBox: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        padding: 12,
        marginTop: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    featuresTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: COLORS.textSub,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    featureItem: {
        fontSize: 11,
        color: COLORS.textDim,
        lineHeight: 17,
    },
});
