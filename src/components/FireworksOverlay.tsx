'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FireworksOverlayProps {
    onComplete?: () => void;
    durationMs?: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    alpha: number;
    color: string;
    radius: number;
    decay: number;
    friction: number;
    gravity: number;
    sparkle: boolean;
    isStar?: boolean;
}

interface Rocket {
    x: number;
    y: number;
    targetY: number;
    speed: number;
    color: string;
    trail: { x: number; y: number }[];
}

const PALETTES = [
    ['#ffd700', '#f59e0b', '#fbbf24', '#ffffff', '#fef08a'], // Golden Imperial
    ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#ffffff'], // Emerald Jade
    ['#3b82f6', '#60a5fa', '#93c5fd', '#38bdf8', '#ffffff'], // Sapphire & Cyan
    ['#ec4899', '#f472b6', '#fb7185', '#ffffff', '#fda4af'], // Neon Pink & Ruby
    ['#8b5cf6', '#a855f7', '#c084fc', '#e9d5ff', '#ffffff'], // Royal Purple
    ['#f97316', '#fb923c', '#fdba74', '#ffffff', '#fed7aa'], // Warm Amber Fire
];

export default function FireworksOverlay({ onComplete, durationMs = 9000 }: FireworksOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        const particles: Particle[] = [];
        const rockets: Rocket[] = [];
        let animationFrameId: number;
        let isSpawning = true;

        // Long-lasting, majestic particle explosion
        const explode = (x: number, y: number, paletteOverride?: string[]) => {
            const palette = paletteOverride || PALETTES[Math.floor(Math.random() * PALETTES.length)];
            const particleCount = 120;

            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.35;
                const speed = Math.random() * 8.5 + 2.5;
                const color = palette[Math.floor(Math.random() * palette.length)];

                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    alpha: 1,
                    color,
                    radius: Math.random() * 3.5 + 1.8,
                    // Slower decay so particles linger and float for 3–4+ seconds
                    decay: Math.random() * 0.0055 + 0.0035,
                    friction: 0.98,
                    gravity: 0.075, // Gentle slow-floating gravity
                    sparkle: Math.random() > 0.3,
                    isStar: Math.random() > 0.5,
                });
            }
        };

        const launchRocket = (targetX?: number, targetY?: number) => {
            const startX = targetX ?? Math.random() * (width * 0.78) + width * 0.11;
            const destY = targetY ?? Math.random() * (height * 0.42) + height * 0.12;
            const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
            rockets.push({
                x: startX,
                y: height,
                targetY: destY,
                speed: Math.random() * 5 + 17,
                color: palette[0],
                trail: [],
            });
        };

        // ═════════════════════════════════════════════════════════
        // WAVE 1: INSTANT MASSIVE 5-BURST FINALE ON LAUNCH
        // ═════════════════════════════════════════════════════════
        explode(width * 0.50, height * 0.22, PALETTES[0]); // Center Gold
        explode(width * 0.22, height * 0.28, PALETTES[1]); // Left Emerald
        explode(width * 0.78, height * 0.25, PALETTES[2]); // Right Sapphire
        explode(width * 0.36, height * 0.15, PALETTES[3]); // Top-Left Ruby
        explode(width * 0.64, height * 0.17, PALETTES[4]); // Top-Right Violet

        // ═════════════════════════════════════════════════════════
        // SUSTAINED CONTINUOUS LAUNCH LOOP (Waves every 450ms for 9s!)
        // ═════════════════════════════════════════════════════════
        let waveCount = 0;
        const waveInterval = setInterval(() => {
            if (!isSpawning) return;
            waveCount++;

            // Alternate between direct burst and rising rocket
            if (waveCount % 2 === 0) {
                const rx = Math.random() * (width * 0.7) + width * 0.15;
                const ry = Math.random() * (height * 0.35) + height * 0.12;
                explode(rx, ry);
            } else {
                launchRocket();
                if (Math.random() > 0.5) launchRocket(); // Double launch
            }
        }, 460);

        const stopSpawnTimer = setTimeout(() => {
            isSpawning = false;
            clearInterval(waveInterval);
        }, durationMs - 2200);

        const finishTimer = setTimeout(() => {
            cancelAnimationFrame(animationFrameId);
            clearInterval(waveInterval);
            onComplete?.();
        }, durationMs);

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            // ── Draw rising rockets ──
            for (let i = rockets.length - 1; i >= 0; i--) {
                const r = rockets[i];
                r.trail.push({ x: r.x, y: r.y });
                if (r.trail.length > 8) r.trail.shift();

                r.y -= r.speed;

                // Glowing fiery rocket trail
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = r.color;
                ctx.lineWidth = 3.5;
                ctx.shadowColor = r.color;
                ctx.shadowBlur = 10;
                for (let j = 0; j < r.trail.length; j++) {
                    const pt = r.trail[j];
                    if (j === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();

                // Bright incandescent rocket tip
                ctx.beginPath();
                ctx.arc(r.x, r.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.restore();

                if (r.y <= r.targetY) {
                    explode(r.x, r.y);
                    rockets.splice(i, 1);
                }
            }

            // ── Draw sparkling, slow-drifting explosion particles ──
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.vx *= p.friction;
                p.vy *= p.friction;
                p.vy += p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= p.decay;

                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.sparkle ? 14 : 6;

                ctx.beginPath();
                const r = p.sparkle ? p.radius * (Math.random() > 0.4 ? 1.35 : 0.85) : p.radius;
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();

                // Draw glittering star twinkle cross on brighter particles
                if (p.isStar && p.alpha > 0.3) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(p.x - r * 1.6, p.y);
                    ctx.lineTo(p.x + r * 1.6, p.y);
                    ctx.moveTo(p.x, p.y - r * 1.6);
                    ctx.lineTo(p.x, p.y + r * 1.6);
                    ctx.stroke();
                }

                ctx.restore();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            clearInterval(waveInterval);
            clearTimeout(stopSpawnTimer);
            clearTimeout(finishTimer);
            cancelAnimationFrame(animationFrameId);
        };
    }, [mounted, durationMs, onComplete]);

    if (!mounted) return null;

    // Direct Portal to body with maximum z-index: overlays EVERYTHING across the screen
    return createPortal(
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 2147483647,
                pointerEvents: 'none',
            }}
        />,
        document.body
    );
}
