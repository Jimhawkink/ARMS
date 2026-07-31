'use client';
import { useEffect } from 'react';

const QR_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=https%3A%2F%2Farms-opal.vercel.app%2Fdownload&color=1e3a5f&bgcolor=ffffff&margin=10&qzone=2&format=png';
const DOWNLOAD_URL = 'arms-opal.vercel.app/download';

export default function QRPrintPage() {
    useEffect(() => {
        // Small delay to let images load before print dialog
        const t = setTimeout(() => window.print(), 1200);
        return () => clearTimeout(t);
    }, []);

    const Card = ({ size }: { size: 'photo' | 'a5' }) => {
        const isPhoto = size === 'photo';
        return (
            <div className={isPhoto ? 'photo-card' : 'a5-card'}>
                {/* Watermark diagonal text repeated */}
                <div className="watermark-layer">
                    {Array.from({ length: 20 }).map((_, i) => (
                        <span key={i} className="wm-text">ARMS ✦ ALPHA SOLUTIONS ✦ OFFICIAL ✦ </span>
                    ))}
                </div>

                {/* Top header */}
                <div className="header">
                    <div className="logo-row">
                        <div className="logo-box">A</div>
                        <div className="brand">
                            <div className="brand-name">ARMS+</div>
                            <div className="brand-sub">Alpha Solutions</div>
                        </div>
                        <div className="official-badge">✦ OFFICIAL</div>
                    </div>
                    <div className="title-line" />
                    <h1 className="main-title">📱 Download Tenant App</h1>
                    <p className="sub-title">Scan to download on your Android phone</p>
                </div>

                {/* QR Code with overlay */}
                <div className="qr-wrapper">
                    <div className="qr-border">
                        <div className="qr-inner">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={QR_URL} alt="QR Code" className="qr-img" />
                            <div className="qr-center-logo">
                                <span>A</span>
                            </div>
                        </div>
                    </div>
                    <div className="corner tl" />
                    <div className="corner tr" />
                    <div className="corner bl" />
                    <div className="corner br" />
                </div>

                {/* Steps */}
                <div className="steps">
                    <div className="step"><span className="num">1</span><span>Scan QR code with your camera</span></div>
                    <div className="step"><span className="num">2</span><span>Download &amp; install the app</span></div>
                    <div className="step"><span className="num">3</span><span>Login with your 6-digit PIN</span></div>
                </div>

                {/* URL bar */}
                <div className="url-bar">
                    <span className="url-label">🔗 Official link:</span>
                    <span className="url-text">{DOWNLOAD_URL}</span>
                </div>

                {/* Footer */}
                <div className="footer">
                    <div className="security-note">🔒 Only download from the official link above</div>
                    <div className="size-label">{isPhoto ? '4×6 inch / 10×15cm' : 'A5 / 148×210mm'}</div>
                </div>
            </div>
        );
    };

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; background: #e5e7eb; }

                /* ── Screen preview ── */
                .page-wrap {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 40px; padding: 40px 20px;
                }
                .page-label {
                    font-size: 13px; color: #6b7280; font-weight: 600;
                    letter-spacing: 1px; text-transform: uppercase; margin-bottom: -30px;
                }
                .print-btn {
                    position: fixed; top: 20px; right: 20px; z-index: 999;
                    background: #3b82f6; color: white; border: none;
                    padding: 12px 24px; border-radius: 10px; font-size: 15px;
                    font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px rgba(59,130,246,0.4);
                    font-family: 'Inter', sans-serif;
                }
                .print-btn:hover { background: #2563eb; }

                /* ── Shared card styles ── */
                .photo-card, .a5-card {
                    position: relative; overflow: hidden;
                    background: linear-gradient(160deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                    display: flex; flex-direction: column; align-items: center;
                    padding: 0; color: white;
                }

                /* Photo: 4×6 = 10×15cm — landscape for door: we'll do portrait 6×4 */
                .photo-card {
                    width: 10cm; height: 15cm;
                    padding: 18px 16px 14px;
                    gap: 10px;
                }
                /* A5: 14.8×21cm */
                .a5-card {
                    width: 14.8cm; height: 21cm;
                    padding: 24px 22px 18px;
                    gap: 14px;
                }

                /* ── Watermark ── */
                .watermark-layer {
                    position: absolute; top: 0; left: -100%; width: 300%; height: 100%;
                    transform: rotate(-30deg);
                    display: flex; flex-wrap: wrap; gap: 12px;
                    pointer-events: none; z-index: 0; opacity: 0.04;
                }
                .wm-text {
                    font-size: 11px; font-weight: 700; color: white;
                    white-space: nowrap; letter-spacing: 2px;
                }

                /* ── Header ── */
                .header { width: 100%; z-index: 1; }
                .logo-row {
                    display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
                }
                .logo-box {
                    width: 36px; height: 36px; border-radius: 9px;
                    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 900; font-size: 18px; color: white; flex-shrink: 0;
                }
                .a5-card .logo-box { width: 44px; height: 44px; font-size: 22px; border-radius: 11px; }

                .brand { flex: 1; }
                .brand-name { font-weight: 800; font-size: 15px; color: white; }
                .brand-sub { font-size: 10px; color: rgba(255,255,255,0.45); }
                .a5-card .brand-name { font-size: 18px; }
                .a5-card .brand-sub { font-size: 11px; }

                .official-badge {
                    background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.4);
                    color: #4ade80; font-size: 9px; font-weight: 700;
                    padding: 4px 8px; border-radius: 20px; letter-spacing: 1px;
                }
                .a5-card .official-badge { font-size: 10px; padding: 5px 10px; }

                .title-line {
                    height: 1px; background: linear-gradient(90deg, transparent, rgba(59,130,246,0.6), transparent);
                    margin-bottom: 10px;
                }
                .main-title {
                    font-size: 17px; font-weight: 900; color: white;
                    text-align: center; letter-spacing: -0.3px;
                }
                .a5-card .main-title { font-size: 22px; }

                .sub-title {
                    font-size: 10px; color: rgba(255,255,255,0.5);
                    text-align: center; margin-top: 3px;
                }
                .a5-card .sub-title { font-size: 12px; }

                /* ── QR Code ── */
                .qr-wrapper {
                    position: relative; z-index: 1;
                    display: flex; align-items: center; justify-content: center;
                }
                .qr-border {
                    background: white; border-radius: 16px;
                    padding: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                }
                .photo-card .qr-border { width: 160px; height: 160px; padding: 8px; }
                .a5-card .qr-border { width: 210px; height: 210px; padding: 10px; }

                .qr-inner { position: relative; width: 100%; height: 100%; }
                .qr-img { width: 100%; height: 100%; display: block; border-radius: 6px; }

                .qr-center-logo {
                    position: absolute;
                    top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: 32px; height: 32px; border-radius: 8px;
                    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 900; font-size: 16px; color: white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    border: 2px solid white;
                }
                .a5-card .qr-center-logo { width: 40px; height: 40px; font-size: 20px; }

                /* Corner brackets */
                .corner {
                    position: absolute; width: 16px; height: 16px;
                    border-color: #3b82f6; border-style: solid;
                }
                .tl { top: -4px; left: -4px; border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
                .tr { top: -4px; right: -4px; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
                .bl { bottom: -4px; left: -4px; border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
                .br { bottom: -4px; right: -4px; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }

                /* ── Steps ── */
                .steps { width: 100%; z-index: 1; display: flex; flex-direction: column; gap: 6px; }
                .step {
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 8px; padding: 7px 10px;
                    font-size: 10px; color: rgba(255,255,255,0.75);
                }
                .a5-card .step { font-size: 12px; padding: 9px 12px; gap: 12px; }
                .num {
                    width: 20px; height: 20px; border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #6366f1);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 10px; font-weight: 700; flex-shrink: 0;
                }
                .a5-card .num { width: 24px; height: 24px; font-size: 12px; }

                /* ── URL Bar ── */
                .url-bar {
                    width: 100%; z-index: 1;
                    background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3);
                    border-radius: 8px; padding: 7px 12px;
                    display: flex; align-items: center; gap: 8px;
                }
                .url-label { font-size: 9px; color: rgba(255,255,255,0.5); white-space: nowrap; }
                .url-text { font-size: 10px; font-weight: 700; color: #60a5fa; font-family: monospace; }
                .a5-card .url-label { font-size: 11px; }
                .a5-card .url-text { font-size: 12px; }

                /* ── Footer ── */
                .footer {
                    width: 100%; z-index: 1;
                    display: flex; align-items: center; justify-content: space-between;
                    border-top: 1px solid rgba(255,255,255,0.08);
                    padding-top: 8px;
                }
                .security-note { font-size: 8px; color: rgba(255,255,255,0.35); }
                .size-label {
                    font-size: 7px; color: rgba(255,255,255,0.2);
                    font-family: monospace; letter-spacing: 0.5px;
                }
                .a5-card .security-note { font-size: 10px; }
                .a5-card .size-label { font-size: 9px; }

                /* ── PRINT STYLES ── */
                @media print {
                    body { background: white; margin: 0; padding: 0; }
                    .print-btn, .page-label { display: none !important; }
                    .page-wrap { background: white; padding: 0; gap: 0; }

                    .photo-card {
                        width: 10cm; height: 15cm;
                        border-radius: 0; box-shadow: none;
                        page-break-after: always;
                        margin: 0 auto;
                    }
                    .a5-card {
                        width: 14.8cm; height: 21cm;
                        border-radius: 0; box-shadow: none;
                        page-break-after: always;
                        margin: 0 auto;
                    }
                    @page { margin: 0; size: auto; }
                }
            `}</style>

            <div className="page-wrap">
                <button className="print-btn" onClick={() => window.print()}>🖨️ Print Both Sizes</button>

                <p className="page-label">📸 Photo Size — 4×6 inch / 10×15cm (Tenant Door Sticker)</p>
                <Card size="photo" />

                <p className="page-label">📄 A5 Size — 148×210mm (Notice Board)</p>
                <Card size="a5" />
            </div>
        </>
    );
}
