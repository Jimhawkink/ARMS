'use client';

import { useEffect, useRef } from 'react';

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
}

interface Firework {
    x: number;
    y: number;
    targetY: number;
    speed: number;
    color: string;
    exploded: boolean;
    trail: { x: number; y: number }[];
}

const PALETTES = [
    ['#ffd700', '#f59e0b', '#fbbf24', '#ffffff'], // Golden Sparkle
    ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'], // Emerald Jade
    ['#3b82f6', '#60a5fa', '#93c5fd', '#ffffff'], // Diamond Sapphire
    ['#ec4899', '#f472b6', '#fbcfe8', '#ffffff'], // Neon Ruby
    ['#8b5cf6', '#a78bfa', '#c4b5fd', '#f3e8ff'], // Royal Violet
    ['#06b6d4', '#22d3ee', '#67e8f9', '#ffffff'], // Electric Cyan
];

export default function FireworksOverlay({ onComplete, durationMs = 4000 }: FireworksOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
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
        const fireworks: Firework[] = [];
        let animationFrameId: number;
        const startTime = Date.now();
        let isSpawning = true;

        const createExplosion = (x: number, y: number, baseColorPalette: string[]) => {
            const count = 90;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
                const speed = Math.random() * 8 + 2;
                const color = baseColorPalette[Math.floor(Math.random() * baseColorPalette.length)];
                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    alpha: 1,
                    color,
                    radius: Math.random() * 2.8 + 1.2,
                    decay: Math.random() * 0.015 + 0.012,
                    friction: 0.965,
                    gravity: 0.16,
                    sparkle: Math.random() > 0.4,
                });
            }
        };

        const launchFirework = (x?: number, targetY?: number) => {
            const startX = x ?? Math.random() * (width * 0.7) + width * 0.15;
            const destY = targetY ?? Math.random() * (height * 0.4) + height * 0.12;
            const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
            fireworks.push({
                x: startX,
                y: height,
                targetY: destY,
                speed: Math.random() * 4 + 11,
                color: palette[0],
                exploded: false,
                trail: [],
            });
        };

        // Initial burst staggered across screen
        launchFirework(width * 0.25, height * 0.28);
        launchFirework(width * 0.50, height * 0.18);
        launchFirework(width * 0.75, height * 0.26);

        // Schedule additional bursts
        const intervals = [
            setTimeout(() => isSpawning && launchFirework(width * 0.35, height * 0.22), 350),
            setTimeout(() => isSpawning && launchFirework(width * 0.65, height * 0.20), 650),
            setTimeout(() => isSpawning && launchFirework(width * 0.48, height * 0.14), 1050),
            setTimeout(() => isSpawning && launchFirework(width * 0.20, height * 0.25), 1450),
            setTimeout(() => isSpawning && launchFirework(width * 0.80, height * 0.22), 1750),
            setTimeout(() => isSpawning && launchFirework(width * 0.52, height * 0.16), 2100),
        ];

        const stopTimeout = setTimeout(() => {
            isSpawning = false;
        }, durationMs - 1200);

        const endTimeout = setTimeout(() => {
            cancelAnimationFrame(animationFrameId);
            onComplete?.();
        }, durationMs);

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            // Update & draw rising fireworks
            for (let i = fireworks.length - 1; i >= 0; i--) {
                const fw = fireworks[i];
                fw.trail.push({ x: fw.x, y: fw.y });
                if (fw.trail.length > 6) fw.trail.shift();

                fw.y -= fw.speed;

                // Draw rocket trail
                ctx.beginPath();
                ctx.strokeStyle = fw.color;
                ctx.lineWidth = 2.5;
                for (let j = 0; j < fw.trail.length; j++) {
                    const pt = fw.trail[j];
                    if (j === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();

                // Rocket head
                ctx.beginPath();
                ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                if (fw.y <= fw.targetY) {
                    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
                    createExplosion(fw.x, fw.y, palette);
                    fireworks.splice(i, 1);
                }
            }

            // Update & draw explosion particles
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
                ctx.shadowBlur = p.sparkle ? 10 : 4;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.sparkle ? p.radius * (Math.random() > 0.5 ? 1.4 : 0.8) : p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            intervals.forEach(clearTimeout);
            clearTimeout(stopTimeout);
            clearTimeout(endTimeout);
            cancelAnimationFrame(animationFrameId);
        };
    }, [durationMs, onComplete]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[99999]"
            style={{ width: '100vw', height: '100vh' }}
        />
    );
}
