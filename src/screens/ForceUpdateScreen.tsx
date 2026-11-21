import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions,
    StatusBar, TouchableOpacity, BackHandler, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const { width } = Dimensions.get('window');

const APK_DOWNLOAD_URL = 'https://arms-opal.vercel.app/api/dl';

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
    const savedApkUriRef = useRef<string | null>(null);
    const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);

    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [downloadedMb, setDownloadedMb] = useState('0');
    const [totalMb, setTotalMb] = useState('70.0');
    const [errorMsg, setErrorMsg] = useState('');

    // Disable Android back button — mandatory update cannot be skipped
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

        // Auto-start download immediately inside the APK
        const t = setTimeout(() => startDownload(), 500);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 150,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    // Open native Android package installer directly from in-app downloaded APK
    const openInstaller = async (uriToInstall?: string) => {
        const targetUri = uriToInstall || savedApkUriRef.current;
        if (!targetUri) {
            startDownload();
            return;
        }

        setPhase('installing');
        try {
            const contentUri = await FileSystem.getContentUriAsync(targetUri);
            // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: 1 | 268435456,
                type: 'application/vnd.android.package-archive',
            });
            setPhase('done');
        } catch (err: any) {
            console.warn('[ForceUpdate] IntentLauncher error:', err);
            // Keep in done phase so user can tap install button directly
            setPhase('done');
        }
    };

    const startDownload = async (retryCount = 0) => {
        try {
            setPhase('downloading');
            setErrorMsg('');

            const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            const apkPath = `${targetDir}ARMSTenantApp-v${latestVersion}.apk`;

            // If we already have an active resumable download instance, attempt resume to preserve downloaded bytes
            if (downloadResumableRef.current) {
                try {
                    const resumed = await downloadResumableRef.current.resumeAsync();
                    if (resumed?.uri) {
                        savedApkUriRef.current = resumed.uri;
                        setProgress(1);
                        await openInstaller(resumed.uri);
                        return;
                    }
                } catch (resumeErr) {
                    console.warn('[ForceUpdate] Resume attempt failed, restarting:', resumeErr);
                }
            }

            // Fresh resumable download instance with real-time byte tracking
            downloadResumableRef.current = FileSystem.createDownloadResumable(
                APK_DOWNLOAD_URL,
                apkPath,
                {
                    headers: { 'Cache-Control': 'no-cache' },
                },
                (data) => {
                    const total = data.totalBytesExpectedToWrite > 0 ? data.totalBytesExpectedToWrite : 73417255;
                    const written = data.totalBytesWritten || 0;
                    const pct = Math.min(written / total, 0.99);
                    setProgress(pct);
                    setDownloadedMb((written / (1024 * 1024)).toFixed(1));
                    setTotalMb((total / (1024 * 1024)).toFixed(1));
                }
            );

            const result = await downloadResumableRef.current.downloadAsync();
            if (!result?.uri) throw new Error('Download failed — no update package received.');

            savedApkUriRef.current = result.uri;
            setProgress(1);

            // Automatically launch native Android installer without opening Chrome
            await openInstaller(result.uri);
        } catch (err: any) {
            console.warn('[ForceUpdate error]', err);
            // Automatic retry up to 2 times for weak internet packet drops before failing
            if (retryCount < 2) {
                console.log(`[ForceUpdate] Auto-retrying download on slow connection (attempt ${retryCount + 1}/2)...`);
                setTimeout(() => startDownload(retryCount + 1), 2000);
                return;
            }
            setErrorMsg('Slow connection detected. You can retry in-app or use your phone browser.');
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
                    A critical security and feature upgrade is required to continue using ARMS.
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

                {/* In-App Direct Download Progress */}
                {phase === 'downloading' && (
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressTitle}>Downloading Update In-App...</Text>
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

                        <View style={styles.progressFooter}>
                            <Text style={styles.fastTag}>⚡ High-Speed Direct In-App CDN</Text>
                            <Text style={styles.mbText}>
                                {downloadedMb} MB / {totalMb} MB
                            </Text>
                        </View>
                    </View>
                )}

                {/* Opening Android Installer */}
                {phase === 'installing' && (
                    <View style={styles.statusBox}>
                        <ActivityIndicator size="small" color={COLORS.accent} />
                        <Text style={styles.statusText}>Launching Android Package Installer...</Text>
                    </View>
                )}

                {/* Download Complete — One-Tap In-App Install */}
                {phase === 'done' && (
                    <View style={styles.doneBox}>
                        <Text style={styles.doneEmoji}>📦</Text>
                        <Text style={styles.doneTitle}>Download Complete (100%)</Text>
                        <Text style={styles.doneSub}>
                            The v{latestVersion} package is ready. Tap below to complete installation.
                        </Text>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => openInstaller()}
                            style={styles.installActionBtn}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669', '#047857']}
                                style={styles.installActionGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                <Text style={styles.installActionText}>🚀 Install ARMS {latestVersion} Now</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Error Section with Direct In-App Retry & Weak Internet Browser Fallback */}
                {phase === 'error' && (
                    <View style={styles.errorSection}>
                        <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => startDownload()}
                            style={styles.retryBtn}
                        >
                            <LinearGradient
                                colors={['#10b981', '#059669']}
                                style={styles.btnGrad}
                            >
                                <Text style={styles.btnText}>🔄 Retry In-App Download</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => Linking.openURL(APK_DOWNLOAD_URL).catch(() => {})}
                            style={[styles.retryBtn, { marginTop: 10, borderColor: '#3b82f6', borderWidth: 1 }]}
                        >
                            <LinearGradient
                                colors={['#1d4ed8', '#1e40af']}
                                style={styles.btnGrad}
                            >
                                <Text style={styles.btnText}>🌐 Download via Browser (Weak Internet)</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}

                {/* What's New Feature Highlights */}
                <View style={styles.featuresBox}>
                    <Text style={styles.featuresTitle}>What's New in {latestVersion}:</Text>
                    <Text style={styles.featureItem}>• Ultra-premium FinTech redesign with pinned headers</Text>
                    <Text style={styles.featureItem}>• Working back button (← Back) on all screens</Text>
                    <Text style={styles.featureItem}>• Celebratory fireworks & confetti on payment success</Text>
                    <Text style={styles.featureItem}>• Automatic 15-minute inactivity security lock</Text>
                    <Text style={styles.featureItem}>• High-speed in-app auto updates with zero browser dependency</Text>
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
        paddingHorizontal: 20,
    },
    ambientGlow: {
        position: 'absolute',
        top: '25%',
        width: width * 0.8,
        height: width * 0.8,
        borderRadius: width * 0.4,
        backgroundColor: 'rgba(16,185,129,0.08)',
    },
    card: {
        width: Math.min(width - 32, 420),
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
    progressFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
    },
    fastTag: {
        fontSize: 10,
        color: COLORS.accent,
        fontWeight: '700',
    },
    mbText: {
        fontSize: 11,
        color: COLORS.textDim,
        fontWeight: '600',
    },

    // Status / Done / Error
    statusBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 14,
    },
    statusText: {
        fontSize: 12,
        color: COLORS.textSub,
        fontWeight: '600',
    },
    doneBox: {
        width: '100%',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
    },
    doneEmoji: {
        fontSize: 34,
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
        marginBottom: 8,
    },
    installActionBtn: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 4,
    },
    installActionGrad: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    installActionText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 0.3,
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
