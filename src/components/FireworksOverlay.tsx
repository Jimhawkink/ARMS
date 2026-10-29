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
    ['#ffd700', '#f59e0b', '#fbbf24', '#ffffff', '#fef08a'], // Golden Glow
    ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#ffffff'], // Emerald Jade
    ['#3b82f6', '#60a5fa', '#93c5fd', '#38bdf8', '#ffffff'], // Electric Cyan & Sapphire
    ['#ec4899', '#f472b6', '#fb7185', '#ffffff', '#fda4af'], // Neon Pink & Ruby
    ['#8b5cf6', '#a855f7', '#c084fc', '#e9d5ff', '#ffffff'], // Royal Purple
    ['#f97316', '#fb923c', '#fdba74', '#ffffff', '#fed7aa'], // Warm Solar Flame
];

export default function FireworksOverlay({ onComplete, durationMs = 4500 }: FireworksOverlayProps) {
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

        // Mega explosion helper - spawns 110 sparkling particles
        const explode = (x: number, y: number, paletteOverride?: string[]) => {
            const palette = paletteOverride || PALETTES[Math.floor(Math.random() * PALETTES.length)];
            const particleCount = 110;

            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
                const speed = Math.random() * 9 + 3;
                const color = palette[Math.floor(Math.random() * palette.length)];

                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    alpha: 1,
                    color,
                    radius: Math.random() * 3.2 + 1.6,
                    decay: Math.random() * 0.016 + 0.011,
                    friction: 0.965,
                    gravity: 0.18,
                    sparkle: Math.random() > 0.35,
                    isStar: Math.random() > 0.6,
                });
            }
        };

        const launchRocket = (targetX?: number, targetY?: number) => {
            const startX = targetX ?? Math.random() * (width * 0.75) + width * 0.12;
            const destY = targetY ?? Math.random() * (height * 0.45) + height * 0.12;
            const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
            rockets.push({
                x: startX,
                y: height,
                targetY: destY,
                speed: Math.random() * 5 + 16,
                color: palette[0],
                trail: [],
            });
        };

        // ═════════════════════════════════════════════════════════
        // INSTANT MEGA BURSTS RIGHT AWAY (Frame 0 — ZERO DELAY!)
        // ═════════════════════════════════════════════════════════
        explode(width * 0.50, height * 0.22, PALETTES[0]); // Center Gold
        explode(width * 0.25, height * 0.28, PALETTES[1]); // Left Emerald
        explode(width * 0.75, height * 0.26, PALETTES[2]); // Right Sapphire
        explode(width * 0.38, height * 0.16, PALETTES[3]); // Top-Left Ruby
        explode(width * 0.62, height * 0.18, PALETTES[4]); // Top-Right Violet

        // Wave 2: Rising rockets and cascading secondary explosions
        const intervals = [
            setTimeout(() => isSpawning && explode(width * 0.30, height * 0.20), 300),
            setTimeout(() => isSpawning && explode(width * 0.70, height * 0.24), 500),
            setTimeout(() => isSpawning && launchRocket(width * 0.20, height * 0.18), 650),
            setTimeout(() => isSpawning && launchRocket(width * 0.50, height * 0.14), 850),
            setTimeout(() => isSpawning && launchRocket(width * 0.80, height * 0.20), 1050),
            setTimeout(() => isSpawning && explode(width * 0.45, height * 0.16), 1300),
            setTimeout(() => isSpawning && explode(width * 0.55, height * 0.22), 1600),
            setTimeout(() => isSpawning && launchRocket(width * 0.35, height * 0.15), 1900),
            setTimeout(() => isSpawning && launchRocket(width * 0.65, height * 0.19), 2200),
            setTimeout(() => isSpawning && explode(width * 0.50, height * 0.20, PALETTES[0]), 2600),
        ];

        const stopSpawnTimer = setTimeout(() => {
            isSpawning = false;
        }, durationMs - 1200);

        const finishTimer = setTimeout(() => {
            cancelAnimationFrame(animationFrameId);
            onComplete?.();
        }, durationMs);

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            // ── Draw rising rockets ──
            for (let i = rockets.length - 1; i >= 0; i--) {
                const r = rockets[i];
                r.trail.push({ x: r.x, y: r.y });
                if (r.trail.length > 7) r.trail.shift();

                r.y -= r.speed;

                // Draw fiery rocket trail
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = r.color;
                ctx.lineWidth = 3;
                ctx.shadowColor = r.color;
                ctx.shadowBlur = 8;
                for (let j = 0; j < r.trail.length; j++) {
                    const pt = r.trail[j];
                    if (j === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();

                // Rocket head (bright white core)
                ctx.beginPath();
                ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.restore();

                if (r.y <= r.targetY) {
                    explode(r.x, r.y);
                    rockets.splice(i, 1);
                }
            }

            // ── Draw dazzling explosion particles ──
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
                ctx.shadowBlur = p.sparkle ? 12 : 5;

                ctx.beginPath();
                const r = p.sparkle ? p.radius * (Math.random() > 0.5 ? 1.4 : 0.85) : p.radius;
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();

                // Draw sparkling star shimmer cross on select particles
                if (p.isStar && p.alpha > 0.4) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(p.x - r * 1.5, p.y);
                    ctx.lineTo(p.x + r * 1.5, p.y);
                    ctx.moveTo(p.x, p.y - r * 1.5);
                    ctx.lineTo(p.x, p.y + r * 1.5);
                    ctx.stroke();
                }

                ctx.restore();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            intervals.forEach(clearTimeout);
            clearTimeout(stopSpawnTimer);
            clearTimeout(finishTimer);
            cancelAnimationFrame(animationFrameId);
        };
    }, [mounted, durationMs, onComplete]);

    if (!mounted) return null;

    // Render directly to document.body via Portal so NO modal, backdrop, or blur can ever hide it!
    return createPortal(
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 2147483647, // Maximum 32-bit z-index: GUARANTEED ON TOP OF EVERYTHING
                pointerEvents: 'none', // Never blocks clicking or receipt interaction
            }}
        />,
        document.body
    );
}
