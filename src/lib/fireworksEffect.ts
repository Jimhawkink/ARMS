/**
 * fireworksEffect.ts
 *
 * Pure vanilla-JS fireworks — completely outside the React tree.
 * Creates a canvas directly on document.body and self-destructs after durationMs.
 * React re-renders, unmounts, prop changes — none of these can touch it.
 */

const PALETTES = [
    ['#ffd700', '#f59e0b', '#fbbf24', '#ffffff', '#fef08a'],
    ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#ffffff'],
    ['#3b82f6', '#60a5fa', '#93c5fd', '#38bdf8', '#ffffff'],
    ['#ec4899', '#f472b6', '#fb7185', '#ffffff', '#fda4af'],
    ['#8b5cf6', '#a855f7', '#c084fc', '#e9d5ff', '#ffffff'],
    ['#f97316', '#fb923c', '#fdba74', '#ffffff', '#fed7aa'],
];

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    alpha: number; color: string;
    radius: number; decay: number;
    friction: number; gravity: number;
    sparkle: boolean; isStar: boolean;
}

interface Rocket {
    x: number; y: number;
    targetY: number; speed: number;
    color: string; trail: { x: number; y: number }[];
}

export function triggerFireworks(durationMs = 9000): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Create canvas and add directly to body — React cannot touch this
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    Object.assign(canvas.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '2147483647',
        pointerEvents: 'none',
        display: 'block',
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    let width = canvas.width;
    let height = canvas.height;

    const onResize = () => {
        canvas.width = width = window.innerWidth;
        canvas.height = height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const particles: Particle[] = [];
    const rockets: Rocket[] = [];
    let animId = 0;
    let active = true;

    const explode = (x: number, y: number, palette?: string[]) => {
        const p = palette ?? PALETTES[Math.floor(Math.random() * PALETTES.length)];
        const count = 130;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const speed = Math.random() * 9 + 2.5;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                alpha: 1,
                color: p[Math.floor(Math.random() * p.length)],
                radius: Math.random() * 3.8 + 1.5,
                decay: Math.random() * 0.005 + 0.003,  // very slow fade — 3-5s visibility
                friction: 0.982,
                gravity: 0.065,
                sparkle: Math.random() > 0.3,
                isStar: Math.random() > 0.45,
            });
        }
    };

    const launchRocket = () => {
        const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
        rockets.push({
            x: Math.random() * width * 0.78 + width * 0.11,
            y: height,
            targetY: Math.random() * height * 0.42 + height * 0.1,
            speed: Math.random() * 6 + 16,
            color: palette[0],
            trail: [],
        });
    };

    // ── Immediate 5-burst opening salvo ──
    explode(width * 0.50, height * 0.22, PALETTES[0]);
    explode(width * 0.22, height * 0.28, PALETTES[1]);
    explode(width * 0.78, height * 0.25, PALETTES[2]);
    explode(width * 0.36, height * 0.15, PALETTES[3]);
    explode(width * 0.64, height * 0.18, PALETTES[4]);

    // ── Continuous waves every 450ms ──
    let waveCount = 0;
    const waveInterval = setInterval(() => {
        if (!active) return;
        waveCount++;
        if (waveCount % 2 === 0) {
            explode(
                Math.random() * width * 0.72 + width * 0.14,
                Math.random() * height * 0.38 + height * 0.1,
            );
        } else {
            launchRocket();
            if (Math.random() > 0.45) launchRocket();
        }
    }, 450);

    const render = () => {
        ctx.clearRect(0, 0, width, height);

        // Rising rockets
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            r.trail.push({ x: r.x, y: r.y });
            if (r.trail.length > 9) r.trail.shift();
            r.y -= r.speed;

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 3.5;
            ctx.shadowColor = r.color;
            ctx.shadowBlur = 12;
            for (let j = 0; j < r.trail.length; j++) {
                const pt = r.trail[j];
                if (j === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
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

        // Explosion particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;

            if (p.alpha <= 0) { particles.splice(i, 1); continue; }

            const r = p.sparkle ? p.radius * (Math.random() > 0.4 ? 1.4 : 0.8) : p.radius;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = p.sparkle ? 16 : 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();

            if (p.isStar && p.alpha > 0.25) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(p.x - r * 1.7, p.y);
                ctx.lineTo(p.x + r * 1.7, p.y);
                ctx.moveTo(p.x, p.y - r * 1.7);
                ctx.lineTo(p.x, p.y + r * 1.7);
                ctx.stroke();
            }
            ctx.restore();
        }

        animId = requestAnimationFrame(render);
    };

    render();

    // Stop spawning 2s before end so last particles can fade naturally
    setTimeout(() => {
        active = false;
        clearInterval(waveInterval);
    }, durationMs - 2000);

    // Full cleanup — remove canvas from DOM
    setTimeout(() => {
        active = false;
        clearInterval(waveInterval);
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }, durationMs);
}
