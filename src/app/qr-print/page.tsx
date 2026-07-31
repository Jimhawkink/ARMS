'use client';
import { useEffect } from 'react';

// QR points to hidden server-side redirect — APK URL never exposed
const QR = (size: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=https%3A%2F%2Farms-opal.vercel.app%2Fapi%2Fdl&color=000000&bgcolor=ffffff&margin=2&qzone=1&format=png&ecc=H`;

export default function QRPrintPage() {
    useEffect(() => {
        const t = setTimeout(() => window.print(), 2000);
        return () => clearTimeout(t);
    }, []);

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Orbitron:wght@700;900&display=swap');
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family:'Inter',sans-serif; background:#1a1a2e; display:flex; flex-direction:column; align-items:center; gap:48px; padding:40px 20px; }

                .print-btn {
                    position:fixed; top:20px; right:20px; z-index:999;
                    background:linear-gradient(135deg,#3b82f6,#6366f1);
                    color:white; border:none; padding:14px 28px;
                    border-radius:12px; font-size:15px; font-weight:700;
                    cursor:pointer; box-shadow:0 8px 24px rgba(59,130,246,0.5);
                    font-family:'Inter',sans-serif; letter-spacing:0.5px;
                }
                .size-label {
                    font-family:'Orbitron',sans-serif; font-size:11px;
                    color:rgba(255,255,255,0.4); letter-spacing:3px;
                    text-transform:uppercase; text-align:center;
                }

                /* ════════════════════════════════════
                   CARD BASE
                ════════════════════════════════════ */
                .card {
                    position:relative; overflow:hidden;
                    display:flex; flex-direction:column; align-items:center;
                    /* ultra-premium gradient */
                    background: linear-gradient(160deg,#0a0f1e 0%,#0d1f3c 30%,#0f2552 60%,#0a0f1e 100%);
                    border: 1px solid rgba(59,130,246,0.25);
                    box-shadow: 0 0 0 1px rgba(59,130,246,0.1),
                                0 30px 80px rgba(0,0,0,0.7),
                                inset 0 1px 0 rgba(255,255,255,0.07);
                }
                .photo-card { width:10cm; height:15cm; border-radius:12px; padding:16px 14px 12px; gap:8px; }
                .a5-card    { width:14.8cm; height:21cm; border-radius:14px; padding:22px 20px 16px; gap:12px; }

                /* ── SVG Laser Watermark ── */
                .wm-svg {
                    position:absolute; inset:0; width:100%; height:100%;
                    pointer-events:none; z-index:0; opacity:0.045;
                }

                /* ── Glowing edge line ── */
                .glow-line {
                    width:100%; height:2px; z-index:1;
                    background:linear-gradient(90deg,transparent 0%,#3b82f6 30%,#8b5cf6 70%,transparent 100%);
                    border-radius:2px; box-shadow:0 0 8px rgba(59,130,246,0.6);
                }

                /* ── Header ── */
                .header { width:100%; z-index:1; }
                .logo-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }

                /* ── ULTRA PREMIUM ARMS LOGO ── */
                .logo-hex {
                    height:38px; border-radius:10px; padding:0 12px;
                    background: linear-gradient(135deg,#0a0f1e 0%,#1a1a2e 100%);
                    border: 1px solid rgba(251,191,36,0.4);
                    display:flex; align-items:center; justify-content:center;
                    flex-shrink:0; white-space:nowrap; position:relative; overflow:hidden;
                    box-shadow: 0 0 0 1px rgba(251,191,36,0.15),
                                0 4px 20px rgba(251,191,36,0.2),
                                inset 0 1px 0 rgba(255,255,255,0.05);
                }
                .logo-hex::before {
                    content:''; position:absolute; inset:0;
                    background:linear-gradient(90deg,transparent 0%,rgba(251,191,36,0.07) 50%,transparent 100%);
                }
                .logo-hex span {
                    font-family:'Orbitron',sans-serif; font-weight:900;
                    font-size:13px; letter-spacing:3px;
                    background: linear-gradient(180deg,#fde68a 0%,#f59e0b 30%,#fbbf24 60%,#92400e 100%);
                    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
                    background-clip:text;
                    filter: drop-shadow(0 0 6px rgba(251,191,36,0.8));
                    position:relative; z-index:1;
                }
                .a5-card .logo-hex { height:46px; border-radius:12px; padding:0 16px; }
                .a5-card .logo-hex span { font-size:16px; letter-spacing:4px; }

                .brand-col { flex:1; }
                .brand-name {
                    font-family:'Orbitron',sans-serif; font-weight:900;
                    font-size:14px; color:white; letter-spacing:1px;
                }
                .brand-sub { font-size:9px; color:rgba(255,255,255,0.4); letter-spacing:0.5px; margin-top:1px; }
                .a5-card .brand-name { font-size:17px; }
                .a5-card .brand-sub { font-size:10px; }

                .badge {
                    display:flex; align-items:center; gap:5px;
                    background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.35);
                    border-radius:20px; padding:4px 10px;
                    font-size:8px; font-weight:700; color:#4ade80; letter-spacing:0.8px;
                }
                .badge-dot { width:6px; height:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 6px #22c55e; flex-shrink:0; }
                .a5-card .badge { font-size:9px; }

                .main-title {
                    font-family:'Orbitron',sans-serif; font-weight:900;
                    color:white; text-align:center; letter-spacing:0.5px;
                    text-shadow:0 0 20px rgba(59,130,246,0.5);
                }
                .photo-card .main-title { font-size:13px; margin-bottom:2px; }
                .a5-card .main-title { font-size:17px; margin-bottom:4px; }

                .sub-title { font-size:9px; color:rgba(255,255,255,0.45); text-align:center; }
                .a5-card .sub-title { font-size:11px; }

                /* ── QR Code Block ── */
                .qr-outer {
                    position:relative; z-index:1;
                    padding:3px;
                    background:linear-gradient(135deg,#3b82f6,#6366f1,#8b5cf6);
                    border-radius:14px;
                    box-shadow:0 0 0 1px rgba(59,130,246,0.3),
                               0 8px 32px rgba(59,130,246,0.3);
                }
                .qr-white {
                    background:white; border-radius:12px; padding:8px;
                    display:flex; align-items:center; justify-content:center;
                    position:relative;
                }
                .photo-card .qr-white { width:152px; height:152px; padding:6px; }
                .a5-card   .qr-white { width:200px; height:200px; padding:8px; }

                .qr-img { width:100%; height:100%; display:block; border-radius:4px; image-rendering:crisp-edges; }

                /* Center logo — kept small (<10% of QR) to not break scanning */
                .qr-logo {
                    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
                    background:linear-gradient(135deg,#3b82f6,#6366f1);
                    border-radius:5px; border:2px solid white;
                    display:flex; align-items:center; justify-content:center;
                    box-shadow:0 2px 8px rgba(0,0,0,0.3);
                    font-family:'Orbitron',sans-serif; font-weight:900;
                    color:white; line-height:1;
                }
                .photo-card .qr-logo { width:40px; height:17px; font-size:6.5px; border-radius:3px; letter-spacing:2px; }
                .a5-card   .qr-logo { width:50px; height:21px; font-size:8px; border-radius:4px; letter-spacing:2.5px; }
                .qr-logo {
                    background: linear-gradient(135deg,#0a0f1e,#1a1a2e) !important;
                    border: 1.5px solid rgba(251,191,36,0.6) !important;
                    box-shadow: 0 0 8px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.05) !important;
                }
                .qr-logo-text {
                    font-family:'Orbitron',sans-serif; font-weight:900;
                    background: linear-gradient(180deg,#fde68a 0%,#f59e0b 40%,#fbbf24 70%,#92400e 100%);
                    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
                    background-clip:text;
                    filter: drop-shadow(0 0 4px rgba(251,191,36,0.9));
                    letter-spacing:inherit;
                }

                /* Corner scan marks */
                .scan-mark {
                    position:absolute; width:14px; height:14px;
                    border-color:#3b82f6; border-style:solid; border-radius:2px;
                }
                .sm-tl { top:-5px; left:-5px; border-width:3px 0 0 3px; }
                .sm-tr { top:-5px; right:-5px; border-width:3px 3px 0 0; }
                .sm-bl { bottom:-5px; left:-5px; border-width:0 0 3px 3px; }
                .sm-br { bottom:-5px; right:-5px; border-width:0 3px 3px 0; }

                /* ── Steps ── */
                .steps { width:100%; z-index:1; display:flex; flex-direction:column; gap:5px; }
                .step {
                    display:flex; align-items:center; gap:9px;
                    background:rgba(255,255,255,0.04);
                    border:1px solid rgba(255,255,255,0.07);
                    border-radius:8px; padding:6px 10px;
                }
                .step-num {
                    width:18px; height:18px; border-radius:50%; flex-shrink:0;
                    background:linear-gradient(135deg,#3b82f6,#6366f1);
                    display:flex; align-items:center; justify-content:center;
                    font-size:9px; font-weight:800; color:white;
                }
                .step-txt { font-size:9px; color:rgba(255,255,255,0.7); }
                .a5-card .step { padding:8px 12px; gap:11px; }
                .a5-card .step-num { width:22px; height:22px; font-size:11px; }
                .a5-card .step-txt { font-size:11px; }

                /* URL strip removed — link hidden for security */

                /* —— Payment Mode Notice —— */
                .pay-mode {
                    width:100%; z-index:1;
                    background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.1));
                    border: 1px solid rgba(16,185,129,0.4);
                    border-radius: 8px;
                    padding: 6px 10px;
                    font-size: 8px;
                    color: rgba(255,255,255,0.75);
                    text-align: center;
                    letter-spacing: 0.3px;
                }
                .pay-mode strong {
                    color: #10b981;
                    font-weight: 800;
                    font-size: 8.5px;
                    letter-spacing: 0.5px;
                }
                .a5-card .pay-mode { font-size:10px; padding:8px 14px; border-radius:10px; }
                .a5-card .pay-mode strong { font-size:11px; }

                /* —— Notice Banner —— */
                .notice-banner {
                    width:100%; z-index:1;
                    background: linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.08));
                    border: 1px solid rgba(245,158,11,0.5);
                    border-left: 3px solid #f59e0b;
                    border-radius: 8px;
                    padding: 6px 10px;
                    font-size: 7.5px;
                    color: rgba(255,255,255,0.8);
                    line-height: 1.4;
                }
                .notice-banner .notice-title {
                    font-size: 8px; font-weight: 800;
                    color: #fbbf24; letter-spacing: 0.5px;
                    margin-bottom: 2px;
                    display: flex; align-items: center; gap: 4px;
                }
                .a5-card .notice-banner { font-size:9.5px; padding:8px 12px; }
                .a5-card .notice-banner .notice-title { font-size:10.5px; }

                /* ── Footer seal ── */
                .footer {
                    width:100%; z-index:1; border-top:1px solid rgba(255,255,255,0.07);
                    padding-top:7px; display:flex; align-items:center; justify-content:space-between;
                }
                .seal {
                    display:flex; align-items:center; gap:5px;
                    font-size:7px; color:rgba(255,255,255,0.3); letter-spacing:0.5px;
                }
                .seal-circle {
                    width:18px; height:18px; border-radius:50%;
                    border:1px solid rgba(59,130,246,0.3);
                    display:flex; align-items:center; justify-content:center;
                    font-size:6px; color:rgba(59,130,246,0.6); font-weight:700;
                }
                .size-tag { font-family:monospace; font-size:7px; color:rgba(255,255,255,0.18); }
                .a5-card .seal { font-size:9px; }
                .a5-card .seal-circle { width:22px; height:22px; font-size:7px; }
                .a5-card .size-tag { font-size:9px; }

                /* ════════════════════════════════════
                   PRINT
                ════════════════════════════════════ */
                @media print {
                    body { background:white; padding:0; gap:0; }
                    .print-btn,.size-label { display:none!important; }
                    .card { box-shadow:none; border:none; border-radius:0; }
                    .photo-card { width:10cm; height:15cm; page-break-after:always; margin:0 auto; }
                    .a5-card    { width:14.8cm; height:21cm; page-break-after:always; margin:0 auto; }
                    @page { margin:0; size:auto; }
                }
            `}</style>

            <button className="print-btn" onClick={() => window.print()}>🖨️ Print Both Sizes</button>

            {(['photo', 'a5'] as const).map(size => {
                const isPhoto = size === 'photo';
                const qrPx = isPhoto ? 900 : 1200;
                return (
                    <div key={size}>
                        <p className="size-label">{isPhoto ? '📸 PHOTO SIZE — 4×6 inch / 10×15 cm' : '📄 A5 SIZE — 148×210 mm'}</p>
                        <div className={`card ${isPhoto ? 'photo-card' : 'a5-card'}`}>

                            {/* SVG Laser watermark */}
                            <svg className="wm-svg" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <pattern id={`wm-${size}`} x="0" y="0" width="160" height="40" patternTransform="rotate(-35)" patternUnits="userSpaceOnUse">
                                        <text x="0" y="28" fontFamily="Orbitron,sans-serif" fontWeight="900" fontSize="13" fill="white" letterSpacing="6">ARMS ✦ ALPHA SOLUTIONS ✦ OFFICIAL</text>
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill={`url(#wm-${size})`} />
                            </svg>

                            {/* Top glowing line */}
                            <div className="glow-line" />

                            {/* Header */}
                            <div className="header">
                                <div className="logo-row">
                                    <div className="logo-hex"><span>ARMS</span></div>
                                    <div className="brand-col">
                                        <div className="brand-name">ARMS</div>
                                        <div className="brand-sub">Alpha Rental Management System</div>
                                    </div>
                                    <div className="badge">
                                        <div className="badge-dot" />
                                        VERIFIED
                                    </div>
                                </div>
                                <div className="main-title">📱 ARMS Mobile App</div>
                                <div className="sub-title">Scan to download — Pay rent instantly</div>
                                <div className="pay-mode">💳 Payment Mode: <strong>ARMS TENANT MOBILE APK VER.1.9.3</strong></div>
                                <div className="notice-banner">
                                    <div className="notice-title">⚠️ IMPORTANT NOTICE</div>
                                    We have changed the payment mode from <strong style={{color:'#fca5a5'}}>Bank Account</strong> to <strong style={{color:'#6ee7b7'}}>ARMS Tenant Mobile APK Ver.1.9.3</strong>. Please scan the QR code above to download the app and pay rent directly from your phone.
                                </div>
                            </div>

                            {/* QR Code */}
                            <div className="qr-outer">
                                <div className="qr-white">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={QR(qrPx)} alt="ARMS Download QR Code" className="qr-img" />
                                    <div className="qr-logo"><span className="qr-logo-text">ARMS</span></div>
                                    <div className="scan-mark sm-tl" />
                                    <div className="scan-mark sm-tr" />
                                    <div className="scan-mark sm-bl" />
                                    <div className="scan-mark sm-br" />
                                </div>
                            </div>

                            {/* Steps */}
                            <div className="steps">
                                {[
                                    ['1','Open your camera app and point at the QR code'],
                                    ['2','Download & install ARMS Mobile APK v1.9.3'],
                                    ['3','Enter your phone number & 6-digit PIN to login'],
                                ].map(([n, t]) => (
                                    <div className="step" key={n}>
                                        <div className="step-num">{n}</div>
                                        <div className="step-txt">{t}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="footer">
                                <div className="seal">
                                    <div className="seal-circle">AS</div>
                                    🔒 Official download — No Google account required
                                </div>
                                <div className="size-tag">{isPhoto ? '4×6in/10×15cm' : 'A5/148×210mm'}</div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}
