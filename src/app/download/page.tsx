'use client';
import { useState, useEffect } from 'react';

const APK_URL = 'https://github.com/Jimhawkink/ARMS/releases/download/v1.9/ARMSTenantApp-v1.9.apk';
const APK_VERSION = '1.9';
const APK_SIZE = '63 MB';
const COMPANY = 'Alpha Solutions';
const APP_NAME = 'ARMS Tenant App';

export default function DownloadPage() {
    const [downloading, setDownloading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [qrLoaded, setQrLoaded] = useState(false);

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent('https://arms-opal.vercel.app/download')}&color=3b82f6&bgcolor=ffffff&margin=10`;

    const handleDownload = () => {
        setDownloading(true);
        setTimeout(() => setDownloading(false), 3000);
        window.open(APK_URL, '_blank');
    };

    const handleCopy = () => {
        navigator.clipboard.writeText('https://arms-opal.vercel.app/download');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>
            {/* Animated background orbs */}
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', animation: 'pulse 8s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', animation: 'pulse 10s ease-in-out infinite reverse' }} />
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.1);opacity:0.7} }
                @keyframes fadeInUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
                @keyframes spin { to{transform:rotate(360deg)} }
                @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
                .step-card { transition: transform 0.2s, box-shadow 0.2s; }
                .step-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.4) !important; }
                .download-btn:hover { transform: scale(1.03); box-shadow: 0 20px 60px rgba(59,130,246,0.5) !important; }
                .download-btn:active { transform: scale(0.98); }
                .copy-btn:hover { background: rgba(255,255,255,0.15) !important; }
            `}</style>

            {/* Header */}
            <header style={{ position: 'relative', zIndex: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: '#fff' }}>A</div>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>ARMS+</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{COMPANY}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '20px', padding: '6px 14px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
                    <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>v{APK_VERSION} Available</span>
                </div>
            </header>

            {/* Hero */}
            <main style={{ position: 'relative', zIndex: 10, maxWidth: '900px', margin: '0 auto', padding: '60px 24px 40px' }}>
                <div style={{ textAlign: 'center', animation: 'fadeInUp 0.6s ease both' }}>
                    {/* App Icon */}
                    <div style={{ width: '100px', height: '100px', borderRadius: '28px', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', margin: '0 auto 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 30px 60px rgba(59,130,246,0.4)', fontSize: '44px' }}>
                        🏠
                    </div>

                    <h1 style={{ color: '#fff', fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.1 }}>
                        {APP_NAME}
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px', margin: '0 0 12px', lineHeight: 1.6 }}>
                        Your rent, billing & payments — all in one place
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', margin: '0 0 48px' }}>
                        By {COMPANY} • Android • {APK_SIZE} • Free for tenants
                    </p>

                    {/* Download Button */}
                    <button
                        className="download-btn"
                        onClick={handleDownload}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '14px',
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            color: '#fff', border: 'none', borderRadius: '18px',
                            padding: '20px 44px', fontSize: '18px', fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: '0 12px 40px rgba(59,130,246,0.4)',
                            marginBottom: '20px'
                        }}
                    >
                        {downloading ? (
                            <div style={{ width: '22px', height: '22px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        ) : '⬇️'}
                        {downloading ? 'Starting Download...' : `Download v${APK_VERSION} APK`}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '60px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>Direct link:</span>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontFamily: 'monospace' }}>arms-opal.vercel.app/download</span>
                        <button
                            className="copy-btn"
                            onClick={handleCopy}
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '4px 10px', color: copied ? '#22c55e' : 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            {copied ? '✓ Copied' : 'Copy'}
                        </button>
                    </div>
                </div>

                {/* Two Column: Steps + QR */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '48px' }}>

                    {/* Install Steps */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', animation: 'fadeInUp 0.6s 0.1s both' }}>
                        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '22px' }}>📲</span> How to Install
                        </h2>
                        {[
                            { n: '1', icon: '⬇️', title: 'Download the APK', desc: 'Tap the download button above' },
                            { n: '2', icon: '⚙️', title: 'Allow Unknown Sources', desc: 'Go to Settings → Security → Enable "Install from Unknown Sources"' },
                            { n: '3', icon: '📂', title: 'Open the file', desc: 'Find the APK in your Downloads folder and tap it' },
                            { n: '4', icon: '✅', title: 'Install & Open', desc: 'Tap Install, then open the ARMS app' },
                            { n: '5', icon: '🔑', title: 'Enter your PIN', desc: 'Login with the 6-digit PIN given by your caretaker' },
                        ].map(s => (
                            <div key={s.n} className="step-card" style={{ display: 'flex', gap: '14px', marginBottom: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{s.icon}</div>
                                <div>
                                    <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px', marginBottom: '3px' }}>
                                        <span style={{ color: 'rgba(59,130,246,0.8)', marginRight: '6px' }}>Step {s.n}.</span>{s.title}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', lineHeight: 1.5 }}>{s.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* QR Code */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', textAlign: 'center', animation: 'fadeInUp 0.6s 0.2s both' }}>
                            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                <span>📷</span> Scan to Download
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 24px' }}>Point your phone camera at the QR code</p>
                            <div style={{ background: '#fff', borderRadius: '16px', padding: '16px', display: 'inline-block', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                                <img
                                    src={qrUrl}
                                    alt="QR Code to download ARMS Tenant App"
                                    width={220} height={220}
                                    onLoad={() => setQrLoaded(true)}
                                    style={{ display: 'block', borderRadius: '8px' }}
                                />
                            </div>
                            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', margin: '16px 0 0' }}>
                                arms-opal.vercel.app/download
                            </p>
                        </div>

                        {/* App Features */}
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '24px', animation: 'fadeInUp 0.6s 0.3s both' }}>
                            <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: '0 0 16px' }}>✨ What you can do</h2>
                            {[
                                ['💳', 'View billing & rent statements'],
                                ['📊', 'Check payment history'],
                                ['📱', 'Pay rent via M-Pesa STK Push'],
                                ['📄', 'Download monthly statements'],
                                ['🔔', 'View outstanding balance'],
                            ].map(([icon, text]) => (
                                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '16px' }}>{icon}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px' }}>{text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer note */}
                <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px', margin: 0 }}>
                        🔒 Secure access — only registered tenants can log in • {COMPANY} © {new Date().getFullYear()}
                    </p>
                </div>
            </main>
        </div>
    );
}
