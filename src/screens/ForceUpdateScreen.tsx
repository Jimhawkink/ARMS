import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions,
    StatusBar, TouchableOpacity, BackHandler, Alert, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

const { width, height } = Dimensions.get('window');

const APK_DOWNLOAD_URL = 'https://arms-opal.vercel.app/api/dl';

const CONFETTI_COLORS = [
    '#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6bb5',
    '#c77dff','#f9844a','#00b4d8','#f72585','#4cc9f0',
];

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

interface Props { currentVersion: string; latestVersion: string; }

type Phase = 'idle' | 'downloading' | 'installing' | 'done' | 'error';

export default function ForceUpdateScreen({ currentVersion, latestVersion }: Props) {
    const slideUp  = useRef(new Animated.Value(60)).current;
    const fadeIn   = useRef(new Animated.Value(0)).current;
    const pulse    = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    const [phase, setPhase]       = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    // Disable Android back button — cannot skip update
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => sub.remove();
    }, []);

    // Entrance animation + auto-trigger download after 1s
    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
            Animated.timing(fadeIn,  { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
        ])).start();

        // Auto-start download after 1s
        const t = setTimeout(() => startDownload(), 1000);
        return () => clearTimeout(t);
    }, []);

    // Animate progress bar
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const startDownload = async () => {
        try {
            setPhase('downloading');
            setProgress(0);
            setErrorMsg('');

            const apkPath = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'ARMSTenantApp-latest.apk';

            // Delete old cached APK if exists
            const fileInfo = await FileSystem.getInfoAsync(apkPath);
            if (fileInfo.exists) await FileSystem.deleteAsync(apkPath, { idempotent: true });

            // Download with progress tracking
            const downloadResumable = FileSystem.createDownloadResumable(
                APK_DOWNLOAD_URL,
                apkPath,
                {},
                (data) => {
                    if (data.totalBytesExpectedToWrite > 0) {
                        const pct = data.totalBytesWritten / data.totalBytesExpectedToWrite;
                        setProgress(Math.min(pct, 1));
                    }
                }
            );

            const result = await downloadResumable.downloadAsync();

            if (!result?.uri) throw new Error('Download failed — no file received');

            setProgress(1);
            setPhase('installing');

            let installed = false;

            // Try 1: IntentLauncher with content URI (preferred — shows system install dialog)
            try {
                const contentUri = await FileSystem.getContentUriAsync(result.uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: contentUri,
                    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                    type: 'application/vnd.android.package-archive',
                });
                installed = true;
            } catch (e1) {
                console.warn('[ForceUpdate] IntentLauncher failed, trying Linking with contentUri:', e1);
                // Try 2: Linking with content URI
                try {
                    const contentUri = await FileSystem.getContentUriAsync(result.uri);
                    const supported = await Linking.canOpenURL(contentUri);
                    if (supported) {
                        await Linking.openURL(contentUri);
                        installed = true;
                    }
                } catch (e2) {
                    console.warn('[ForceUpdate] Linking contentUri failed, trying file URI:', e2);
                    // Try 3: Linking with file URI directly
                    try {
                        await Linking.openURL(result.uri);
                        installed = true;
                    } catch (e3) {
                        console.warn('[ForceUpdate] All install methods failed:', e3);
                    }
                }
            }

            if (!installed) {
                throw new Error('Could not open installer. Please install the APK manually from your Downloads folder.');
            }

            setPhase('done');
        } catch (err: any) {
            console.warn('[ForceUpdate download error]', err);
            setErrorMsg(err?.message || 'Download failed. Please try again.');
            setPhase('error');
        }
    };

    if (phase === 'done') {
        return (
            <View style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0a2e1a" />
                <LinearGradient colors={['#0a2e1a','#0d4a28','#0a2e1a']} style={StyleSheet.absoluteFillObject} />
                <Confetti />
                <View style={[styles.card, styles.successCard]}>
                    <LinearGradient colors={['#22c55e','#16a34a']} style={styles.checkCircle}>
                        <Text style={styles.checkMark}>✓</Text>
                    </LinearGradient>
                    <Text style={styles.successTitle}>All Done! 🎉</Text>
                    <Text style={styles.successSub}>
                        ARMS {latestVersion} is installing.{'\n'}Follow the install prompt, then re-open the app!
                    </Text>
                </View>
            </View>
        );
    }

    const progressPercent = Math.round(progress * 100);

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

                {/* Version pills */}
                <View style={styles.versionRow}>
                    <View style={styles.versionPill}>
                        <Text style={styles.versionLabel}>YOUR VERSION</Text>
                        <Text style={styles.versionBad}>{currentVersion}</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                    <View style={[styles.versionPill, styles.versionPillGood]}>
                        <Text style={styles.versionLabel}>NEW VERSION</Text>
                        <Text style={styles.versionGood}>{latestVersion}</Text>
                    </View>
                </View>

                <View style={styles.divider} />

                {/* DOWNLOADING PHASE — progress bar */}
                {phase === 'downloading' && (
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>⬇️  Downloading update...</Text>
                            <Text style={styles.progressPct}>{progressPercent}%</Text>
                        </View>
                        <View style={styles.progressTrack}>
                            <Animated.View style={[styles.progressFill, {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                            }]} />
                        </View>
                        <Text style={styles.progressSub}>
                            Please wait — do not close the app
                        </Text>
                    </View>
                )}

                {/* INSTALLING PHASE */}
                {phase === 'installing' && (
                    <View style={styles.statusBox}>
                        <Text style={styles.statusEmoji}>📲</Text>
                        <Text style={styles.statusBig}>Install prompt opening...</Text>
                        <Text style={styles.statusSub}>
                            Tap <Text style={styles.bold}>Install</Text> when Android asks you to confirm.
                        </Text>
                    </View>
                )}

                {/* ERROR PHASE */}
                {phase === 'error' && (
                    <View style={[styles.statusBox, styles.errorBox]}>
                        <Text style={styles.statusEmoji}>⚠️</Text>
                        <Text style={[styles.statusBig, { color: '#fca5a5' }]}>Download failed</Text>
                        <Text style={[styles.statusSub, { color: '#fca5a5' }]}>{errorMsg}</Text>
                    </View>
                )}

                {/* How-to steps — only show when idle */}
                {phase === 'idle' && (
                    <View style={styles.steps}>
                        {[
                            { emoji: '⬇️', text: 'APK downloads inside the app' },
                            { emoji: '📲', text: 'Install prompt appears automatically' },
                            { emoji: '✅', text: 'Tap Install → re-open ARMS' },
                        ].map((s, i) => (
                            <View key={i} style={styles.step}>
                                <View style={styles.stepNum}>
                                    <Text style={styles.stepNumText}>{i + 1}</Text>
                                </View>
                                <Text style={styles.stepText}>{s.emoji}  {s.text}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.divider} />

                {/* Primary button */}
                {(phase === 'idle') && (
                    <Animated.View style={{ width: '100%', transform: [{ scale: pulse }] }}>
                        <TouchableOpacity onPress={startDownload} activeOpacity={0.85}>
                            <LinearGradient colors={['#6366f1','#4f46e5','#3730a3']} style={styles.btn}>
                                <Text style={styles.btnEmoji}>⬇️</Text>
                                <Text style={styles.btnText}>Download & Install Now</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* Retry button on error */}
                {phase === 'error' && (
                    <TouchableOpacity onPress={startDownload} style={styles.retryBtn}>
                        <Text style={styles.retryBtnText}>🔄 Retry Download</Text>
                    </TouchableOpacity>
                )}

                <Text style={styles.hint}>
                    🔒 Your account, rent history & data are safe.
                </Text>
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

    iconWrap:  { marginBottom:16 },
    iconGrad:  { width:72, height:72, borderRadius:22, alignItems:'center', justifyContent:'center', elevation:8 },
    iconEmoji: { fontSize:36 },

    title: { fontSize:24, fontWeight:'900', color:'#f8fafc', marginBottom:16, textAlign:'center' },

    versionRow: { flexDirection:'row', alignItems:'center', gap:12, marginBottom:20 },
    versionPill: { backgroundColor:'rgba(239,68,68,0.12)', borderRadius:12, paddingHorizontal:14, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor:'rgba(239,68,68,0.3)' },
    versionPillGood: { backgroundColor:'rgba(16,185,129,0.12)', borderColor:'rgba(16,185,129,0.3)' },
    versionLabel: { fontSize:9, color:'#64748b', fontWeight:'700', textTransform:'uppercase', marginBottom:2 },
    versionBad:   { fontSize:15, fontWeight:'900', color:'#ef4444' },
    versionGood:  { fontSize:15, fontWeight:'900', color:'#10b981' },
    arrow: { fontSize:20, color:'#475569' },

    divider: { width:'100%', height:1, backgroundColor:'#334155', marginVertical:16 },

    // Progress bar
    progressSection: { width:'100%', marginBottom:16 },
    progressHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
    progressLabel:   { fontSize:14, fontWeight:'700', color:'#a5b4fc' },
    progressPct:     { fontSize:14, fontWeight:'900', color:'#6366f1' },
    progressTrack:   { width:'100%', height:10, backgroundColor:'rgba(99,102,241,0.15)', borderRadius:5, overflow:'hidden', borderWidth:1, borderColor:'rgba(99,102,241,0.2)' },
    progressFill:    { height:'100%', backgroundColor:'#6366f1', borderRadius:5 },
    progressSub:     { fontSize:11, color:'#64748b', textAlign:'center', marginTop:8 },

    statusBox:   { width:'100%', backgroundColor:'rgba(99,102,241,0.1)', borderRadius:16, padding:16, alignItems:'center', marginBottom:16, borderWidth:1, borderColor:'rgba(99,102,241,0.2)' },
    errorBox:    { backgroundColor:'rgba(239,68,68,0.1)', borderColor:'rgba(239,68,68,0.3)' },
    statusEmoji: { fontSize:32, marginBottom:8 },
    statusBig:   { fontSize:16, fontWeight:'800', color:'#c7d2fe', textAlign:'center', marginBottom:8 },
    statusText:  { fontSize:14, fontWeight:'700', color:'#a5b4fc', textAlign:'center' },
    statusSub:   { fontSize:13, color:'#94a3b8', textAlign:'center', lineHeight:20 },
    bold:        { fontWeight:'900', color:'#c7d2fe' },

    steps:    { width:'100%', gap:10 },
    step:     { flexDirection:'row', alignItems:'center', gap:10 },
    stepNum:  { width:28, height:28, borderRadius:9, backgroundColor:'rgba(99,102,241,0.15)', borderWidth:1, borderColor:'rgba(99,102,241,0.3)', alignItems:'center', justifyContent:'center' },
    stepNumText:   { fontSize:11, fontWeight:'900', color:'#a5b4fc' },
    stepText:      { fontSize:12, color:'#cbd5e1', fontWeight:'500', flex:1 },

    btn:      { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, paddingVertical:18, borderRadius:18, width:'100%', elevation:12 },
    btnEmoji: { fontSize:22 },
    btnText:  { fontSize:17, fontWeight:'900', color:'#fff', letterSpacing:0.5 },

    retryBtn:     { width:'100%', paddingVertical:12, borderRadius:14, backgroundColor:'rgba(99,102,241,0.15)', borderWidth:1, borderColor:'rgba(99,102,241,0.3)', alignItems:'center', marginTop:8 },
    retryBtnText: { color:'#a5b4fc', fontWeight:'700', fontSize:14 },

    hint: { fontSize:11, color:'#475569', textAlign:'center', marginTop:14 },

    checkCircle: { width:100, height:100, borderRadius:50, alignItems:'center', justifyContent:'center', elevation:12, marginBottom:20 },
    checkMark:   { fontSize:52, color:'white', fontWeight:'900', lineHeight:60 },
    successTitle: { fontSize:26, fontWeight:'900', color:'#f0fdf4', textAlign:'center', marginBottom:10 },
    successSub:   { fontSize:14, color:'#86efac', textAlign:'center', lineHeight:22 },
});
