import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions,
    StatusBar, TouchableOpacity, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

const { width, height } = Dimensions.get('window');

const APK_BASE_URL  = 'https://arms-opal.vercel.app/ARMSTenantApp-';
const CONFETTI_COLORS = [
    '#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6bb5',
    '#c77dff','#f9844a','#00b4d8','#f72585','#4cc9f0',
];

// ── Simple confetti piece ──────────────────────────────────────────────────
function ConfettiPiece({ color, delay, startX }: { color: string; delay: number; startX: number }) {
    const translateY = useRef(new Animated.Value(-30)).current;
    const translateX = useRef(new Animated.Value(0)).current;
    const rotate     = useRef(new Animated.Value(0)).current;
    const opacity    = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const drift = (Math.random() - 0.5) * 120;
        setTimeout(() => {
            Animated.parallel([
                Animated.timing(translateY, { toValue: height * 0.85, duration: 2800, useNativeDriver: true }),
                Animated.timing(translateX, { toValue: drift,         duration: 2800, useNativeDriver: true }),
                Animated.timing(rotate,     { toValue: 8,             duration: 2800, useNativeDriver: true }),
                Animated.sequence([
                    Animated.delay(1800),
                    Animated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
                ]),
            ]).start();
        }, delay);
    }, []);

    const isRect = Math.random() > 0.5;
    return (
        <Animated.View style={{
            position: 'absolute',
            left: startX,
            top: 0,
            width:  isRect ? 8  : 6,
            height: isRect ? 14 : 6,
            borderRadius: isRect ? 2 : 3,
            backgroundColor: color,
            opacity,
            transform: [
                { translateY },
                { translateX },
                { rotate: rotate.interpolate({ inputRange: [0, 8], outputRange: ['0deg', '720deg'] }) },
            ],
        }} />
    );
}

// ── Confetti burst (60 pieces) ─────────────────────────────────────────────
function Confetti() {
    const pieces = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 600,
        startX: Math.random() * width,
    }));
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {pieces.map(p => <ConfettiPiece key={p.id} {...p} />)}
        </View>
    );
}

// ── Main screen ────────────────────────────────────────────────────────────
interface Props { currentVersion: string; latestVersion: string; }

type Phase = 'idle' | 'downloading' | 'installing' | 'done' | 'error';

export default function ForceUpdateScreen({ currentVersion, latestVersion }: Props) {
    const slideUp = useRef(new Animated.Value(60)).current;
    const fadeIn  = useRef(new Animated.Value(0)).current;
    const pulse   = useRef(new Animated.Value(1)).current;
    const checkScale = useRef(new Animated.Value(0)).current;
    const successFade = useRef(new Animated.Value(0)).current;

    const [phase,    setPhase]    = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);   // 0–1
    const [errMsg,   setErrMsg]   = useState('');

    // Entrance animation
    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
            Animated.timing(fadeIn,  { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        // Pulse button
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.04, duration: 900, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])).start();

        // Auto-start download after 1.5s
        const t = setTimeout(() => startDownload(), 1500);
        return () => clearTimeout(t);
    }, []);

    const startDownload = useCallback(async () => {
        if (phase === 'downloading' || phase === 'done') return;
        setPhase('downloading');
        setProgress(0);
        setErrMsg('');

        const apkUrl      = `${APK_BASE_URL}${latestVersion}.apk`;
        const localPath   = `${FileSystem.cacheDirectory}ARMSTenantApp-${latestVersion}.apk`;

        // Delete any previous partial download
        try { await FileSystem.deleteAsync(localPath, { idempotent: true }); } catch (_) {}

        const downloadResumable = FileSystem.createDownloadResumable(
            apkUrl,
            localPath,
            {},
            (downloadProgress) => {
                const pct = downloadProgress.totalBytesWritten /
                            downloadProgress.totalBytesExpectedToWrite;
                setProgress(isNaN(pct) ? 0 : Math.min(pct, 1));
            }
        );

        try {
            const result = await downloadResumable.downloadAsync();
            if (!result?.uri) throw new Error('Download failed — no file saved');

            setProgress(1);
            setPhase('installing');

            // Small pause to show 100%, then trigger install
            await new Promise(r => setTimeout(r, 800));
            await launchInstall(result.uri);

            // Show celebration
            setPhase('done');
            Animated.sequence([
                Animated.spring(checkScale,  { toValue: 1, useNativeDriver: true, bounciness: 15 }),
                Animated.timing(successFade, { toValue: 1, duration: 400, useNativeDriver: true }),
            ]).start();

        } catch (e: any) {
            setErrMsg(e?.message || 'Download failed. Please try again.');
            setPhase('error');
        }
    }, [phase, latestVersion]);

    const launchInstall = async (fileUri: string) => {
        if (Platform.OS !== 'android') return;
        // Convert file:// URI to content:// via IntentLauncher
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
            data: contentUri,
            flags: 1,   // FLAG_GRANT_READ_URI_PERMISSION
            type: 'application/vnd.android.package-archive',
        });
    };

    // ── PHASE: SUCCESS / CELEBRATION ──────────────────────────────────────
    if (phase === 'done') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a2e1a" />
                <LinearGradient colors={['#0a2e1a','#0d4a28','#0a2e1a']} style={StyleSheet.absoluteFillObject} />
                <Confetti />
                <Animated.View style={[styles.card, styles.successCard, { opacity: successFade }]}>
                    {/* Big animated check */}
                    <Animated.View style={[styles.checkWrap, { transform: [{ scale: checkScale }] }]}>
                        <LinearGradient colors={['#22c55e','#16a34a']} style={styles.checkCircle}>
                            <Text style={styles.checkMark}>✓</Text>
                        </LinearGradient>
                        {/* Orbit ring */}
                        <View style={styles.orbitRing} />
                    </Animated.View>

                    <Text style={styles.successTitle}>Update Successful! 🎉</Text>
                    <Text style={styles.successSub}>
                        ARMS {latestVersion} is ready.{'\n'}Complete the installation to enjoy the new version!
                    </Text>

                    <View style={styles.confettiRow}>
                        {['🎊','✨','🎆','🌟','🎉','🎇','⭐','💫'].map((e, i) => (
                            <Text key={i} style={styles.confettiEmoji}>{e}</Text>
                        ))}
                    </View>

                    <TouchableOpacity onPress={startDownload} style={styles.reinstallBtn}>
                        <Text style={styles.reinstallBtnText}>📲 Open Install Again</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        );
    }

    // ── PHASE: IDLE / DOWNLOADING / INSTALLING / ERROR ────────────────────
    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
            <LinearGradient colors={['#0f172a','#1e1b4b','#0c1a2e']} style={StyleSheet.absoluteFillObject} />
            <View style={styles.decor1} />
            <View style={styles.decor2} />

            <Animated.View style={[styles.card, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
                {/* Icon */}
                <View style={styles.iconWrap}>
                    <LinearGradient colors={['#f59e0b','#d97706']} style={styles.iconGrad}>
                        <Text style={styles.iconEmoji}>🚀</Text>
                    </LinearGradient>
                </View>

                <Text style={styles.title}>Update Required</Text>
                <Text style={styles.subtitle}>
                    {phase === 'downloading'
                        ? `Downloading ${latestVersion}… ${Math.round(progress * 100)}%`
                        : phase === 'installing'
                        ? `Installing ${latestVersion}…`
                        : phase === 'error'
                        ? '⚠️ Download failed'
                        : 'A new version is available. Downloading automatically…'}
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

                {/* ── PROGRESS BAR (shown while downloading / installing) ── */}
                {(phase === 'downloading' || phase === 'installing') && (
                    <View style={styles.progressWrap}>
                        <View style={styles.progressTrack}>
                            <Animated.View style={[
                                styles.progressFill,
                                { width: `${Math.round(progress * 100)}%` as any },
                                phase === 'installing' && styles.progressFillGreen,
                            ]} />
                        </View>
                        <View style={styles.progressRow}>
                            <Text style={styles.progressPct}>
                                {phase === 'installing' ? '✅ Installing…' : `${Math.round(progress * 100)}%`}
                            </Text>
                            <Text style={styles.progressSize}>
                                {phase === 'installing' ? '' : `${Math.round(progress * 67.3)} / 67.3 MB`}
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── DOWNLOAD BUTTON (shown when idle or error) ── */}
                {(phase === 'idle' || phase === 'error') && (
                    <Animated.View style={{ width: '100%', transform: [{ scale: pulse }] }}>
                        <TouchableOpacity onPress={startDownload} activeOpacity={0.85}>
                            <LinearGradient colors={['#6366f1','#4f46e5','#3730a3']} style={styles.downloadBtn}>
                                <Text style={styles.downloadBtnEmoji}>⬇️</Text>
                                <Text style={styles.downloadBtnText}>
                                    {phase === 'error' ? 'Retry Download' : `Download ${latestVersion} Now`}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {phase === 'error' && (
                    <Text style={styles.errMsg}>{errMsg}</Text>
                )}

                <Text style={styles.hint}>
                    {phase === 'downloading' || phase === 'installing'
                        ? 'Please keep the app open while downloading…'
                        : 'After installing, re-open ARMS to continue.'}
                </Text>

                {/* Steps */}
                <View style={styles.steps}>
                    {[
                        ['⬇️', 'Download starts automatically'],
                        ['📲', 'Install prompt appears automatically'],
                        ['✅', 'Re-open ARMS — you\'re done!'],
                    ].map(([emoji, text], i) => (
                        <View key={i} style={styles.step}>
                            <View style={[
                                styles.stepNum,
                                phase === 'downloading' && i === 0 && styles.stepNumActive,
                                phase === 'installing'  && i === 1 && styles.stepNumActive,
                            ]}>
                                <Text style={styles.stepNumText}>{i + 1}</Text>
                            </View>
                            <Text style={styles.stepText}>{emoji}  {text}</Text>
                        </View>
                    ))}
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    decor1: { position:'absolute', top:-60,  right:-60, width:220, height:220, borderRadius:110, backgroundColor:'rgba(99,102,241,0.08)' },
    decor2: { position:'absolute', bottom:-80, left:-80, width:280, height:280, borderRadius:140, backgroundColor:'rgba(245,158,11,0.06)' },

    card: {
        backgroundColor:'rgba(30,41,59,0.95)', borderRadius:28, padding:28,
        width: Math.min(width - 32, 400), alignItems:'center',
        borderWidth:1, borderColor:'rgba(99,102,241,0.3)',
        shadowColor:'#6366f1', shadowOffset:{width:0,height:12}, shadowOpacity:0.3, shadowRadius:24, elevation:16,
    },
    successCard: { borderColor:'rgba(34,197,94,0.4)', shadowColor:'#22c55e' },

    iconWrap: { marginBottom:16 },
    iconGrad: { width:72, height:72, borderRadius:22, alignItems:'center', justifyContent:'center', elevation:8 },
    iconEmoji: { fontSize:36 },

    title:    { fontSize:24, fontWeight:'900', color:'#f8fafc', marginBottom:8, textAlign:'center' },
    subtitle: { fontSize:13, color:'#94a3b8', textAlign:'center', lineHeight:20, marginBottom:20 },

    versionRow: { flexDirection:'row', alignItems:'center', gap:12, marginBottom:20 },
    versionPill: { backgroundColor:'rgba(239,68,68,0.12)', borderRadius:12, paddingHorizontal:14, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor:'rgba(239,68,68,0.3)' },
    versionPillGood: { backgroundColor:'rgba(16,185,129,0.12)', borderColor:'rgba(16,185,129,0.3)' },
    versionLabel: { fontSize:9, color:'#64748b', fontWeight:'700', textTransform:'uppercase', marginBottom:2 },
    versionBad:   { fontSize:15, fontWeight:'900', color:'#ef4444' },
    versionGood:  { fontSize:15, fontWeight:'900', color:'#10b981' },
    arrow: { fontSize:20, color:'#475569' },

    divider: { width:'100%', height:1, backgroundColor:'#334155', marginBottom:20 },

    // Progress bar
    progressWrap:  { width:'100%', marginBottom:20 },
    progressTrack: { width:'100%', height:16, backgroundColor:'rgba(255,255,255,0.08)', borderRadius:8, overflow:'hidden', marginBottom:8 },
    progressFill:  { height:'100%', backgroundColor:'#6366f1', borderRadius:8 },
    progressFillGreen: { backgroundColor:'#22c55e' },
    progressRow:   { flexDirection:'row', justifyContent:'space-between' },
    progressPct:   { fontSize:13, fontWeight:'700', color:'#a5b4fc' },
    progressSize:  { fontSize:11, color:'#64748b' },

    // Download button
    downloadBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, paddingVertical:18, borderRadius:18, width:'100%', marginBottom:12, elevation:12 },
    downloadBtnEmoji: { fontSize:22 },
    downloadBtnText:  { fontSize:17, fontWeight:'900', color:'#fff', letterSpacing:0.5 },

    errMsg: { fontSize:12, color:'#f87171', textAlign:'center', marginBottom:8 },
    hint:   { fontSize:11, color:'#64748b', textAlign:'center', marginBottom:16, lineHeight:16 },

    steps:      { width:'100%', gap:8 },
    step:       { flexDirection:'row', alignItems:'center', gap:10 },
    stepNum:    { width:26, height:26, borderRadius:8, backgroundColor:'rgba(99,102,241,0.2)', borderWidth:1, borderColor:'rgba(99,102,241,0.4)', alignItems:'center', justifyContent:'center' },
    stepNumActive: { backgroundColor:'rgba(99,102,241,0.5)', borderColor:'#6366f1' },
    stepNumText: { fontSize:11, fontWeight:'900', color:'#a5b4fc' },
    stepText:    { fontSize:12, color:'#cbd5e1', fontWeight:'500', flex:1 },

    // Success screen
    checkWrap:   { marginBottom:20, alignItems:'center', justifyContent:'center' },
    checkCircle: { width:100, height:100, borderRadius:50, alignItems:'center', justifyContent:'center', elevation:12 },
    checkMark:   { fontSize:52, color:'white', fontWeight:'900', lineHeight:60 },
    orbitRing:   { position:'absolute', width:120, height:120, borderRadius:60, borderWidth:2, borderColor:'rgba(34,197,94,0.3)', borderStyle:'dashed' },

    successTitle: { fontSize:26, fontWeight:'900', color:'#f0fdf4', textAlign:'center', marginBottom:10 },
    successSub:   { fontSize:14, color:'#86efac', textAlign:'center', lineHeight:22, marginBottom:20 },

    confettiRow: { flexDirection:'row', flexWrap:'wrap', justifyContent:'center', gap:6, marginBottom:20 },
    confettiEmoji: { fontSize:24 },

    reinstallBtn: { backgroundColor:'rgba(34,197,94,0.15)', borderWidth:1, borderColor:'rgba(34,197,94,0.4)', paddingVertical:14, paddingHorizontal:24, borderRadius:14 },
    reinstallBtnText: { color:'#4ade80', fontWeight:'700', fontSize:14 },
});
