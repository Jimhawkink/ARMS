'use client';
import { useEffect, useRef, useState } from 'react';

// ── Global progress bar state ─────────────────────────────────────────────────
// Any component can call start/done to show/hide the bar.
type Listener = (active: boolean) => void;
const listeners = new Set<Listener>();
let _active = false;

export const topProgress = {
    start() {
        _active = true;
        listeners.forEach(fn => fn(true));
    },
    done() {
        _active = false;
        listeners.forEach(fn => fn(false));
    },
    isActive() { return _active; },
};

// ── The bar component — mount once in layout ──────────────────────────────────
export default function TopProgressBar() {
    const [active, setActive] = useState(false);
    const [width, setWidth] = useState(0);
    const [fading, setFading] = useState(false);
    const rafRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const listener: Listener = (isActive) => {
            if (isActive) {
                setFading(false);
                setActive(true);
                setWidth(0);
                // Animate from 0 → ~85% quickly, then slow down (like YouTube)
                let w = 0;
                const tick = () => {
                    if (w < 30) w += 4;
                    else if (w < 60) w += 2;
                    else if (w < 80) w += 0.8;
                    else if (w < 90) w += 0.2;
                    else w += 0.05;
                    if (w > 90) w = 90; // never reach 100 until done()
                    setWidth(w);
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
            } else {
                // Jump to 100%, then fade out
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                setWidth(100);
                timerRef.current = setTimeout(() => {
                    setFading(true);
                    timerRef.current = setTimeout(() => {
                        setActive(false);
                        setWidth(0);
                        setFading(false);
                    }, 300);
                }, 150);
            }
        };
        listeners.add(listener);
        // Sync with current state in case start() was called before mount
        if (_active) listener(true);
        return () => {
            listeners.delete(listener);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    if (!active && !fading) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                height: 3,
                pointerEvents: 'none',
            }}
        >
            {/* Track */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.1)' }} />
            {/* Bar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${width}%`,
                    background: 'linear-gradient(90deg, #059669, #10b981, #34d399)',
                    borderRadius: '0 2px 2px 0',
                    transition: width === 100
                        ? 'width 0.15s ease-out'
                        : 'width 0.08s linear',
                    opacity: fading ? 0 : 1,
                    transitionProperty: fading ? 'opacity' : 'width',
                    transitionDuration: fading ? '0.3s' : undefined,
                    boxShadow: '0 0 8px rgba(16,185,129,0.7), 0 0 2px rgba(16,185,129,0.5)',
                }}
            />
            {/* Glowing tip */}
            <div
                style={{
                    position: 'absolute',
                    top: -1,
                    left: `${width}%`,
                    width: 80,
                    height: 5,
                    background: 'radial-gradient(ellipse at left, rgba(52,211,153,0.9) 0%, transparent 70%)',
                    transform: 'translateX(-100%)',
                    opacity: fading ? 0 : 1,
                    transition: fading ? 'opacity 0.3s' : undefined,
                    pointerEvents: 'none',
                }}
            />
        </div>
    );
}
