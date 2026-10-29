// ═════════════════════════════════════════════════════════════════════
// CELEBRATORY PAYMENT SUCCESS AUDIO ENGINE (Web Audio API)
// Crystal-clear harmonic chime & celebratory sound — 100% offline & reliable
// ═════════════════════════════════════════════════════════════════════

export function playPaymentSuccessSound() {
    if (typeof window === 'undefined') return;

    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;

        // Rich triumphant harmonic arpeggio (E major pentatonic + sparkle chime)
        const notes = [
            { freq: 523.25, time: 0.00, dur: 0.70, gain: 0.22, type: 'sine' as OscillatorType }, // C5
            { freq: 659.25, time: 0.08, dur: 0.75, gain: 0.26, type: 'sine' as OscillatorType }, // E5
            { freq: 783.99, time: 0.16, dur: 0.85, gain: 0.30, type: 'sine' as OscillatorType }, // G5
            { freq: 1046.50, time: 0.24, dur: 1.20, gain: 0.35, type: 'triangle' as OscillatorType }, // C6
            { freq: 1318.51, time: 0.34, dur: 1.50, gain: 0.32, type: 'sine' as OscillatorType }, // E6
            { freq: 1567.98, time: 0.44, dur: 1.80, gain: 0.26, type: 'triangle' as OscillatorType }, // G6
            { freq: 2093.00, time: 0.54, dur: 2.20, gain: 0.20, type: 'sine' as OscillatorType }, // C7 (golden chime)
        ];

        notes.forEach(({ freq, time, dur, gain: noteGain, type }) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + time);

            // Fast attack, smooth exponential decay for natural bell ring
            gainNode.gain.setValueAtTime(0.0001, now + time);
            gainNode.gain.exponentialRampToValueAtTime(noteGain, now + time + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start(now + time);
            osc.stop(now + time + dur + 0.1);
        });

        // Add shimmering coin sparkle high frequencies
        const sparkles = [
            { freq: 2637.02, time: 0.38, dur: 0.8 },
            { freq: 3135.96, time: 0.48, dur: 0.9 },
            { freq: 3951.07, time: 0.58, dur: 1.0 },
            { freq: 4186.01, time: 0.68, dur: 1.1 },
        ];

        sparkles.forEach(({ freq, time, dur }) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + time);

            gainNode.gain.setValueAtTime(0.0001, now + time);
            gainNode.gain.exponentialRampToValueAtTime(0.10, now + time + 0.015);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start(now + time);
            osc.stop(now + time + dur + 0.05);
        });
    } catch (e) {
        console.warn('Could not play payment sound effect:', e);
    }
}
