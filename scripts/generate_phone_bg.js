const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function generatePhoneBackground() {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width;  // 1024
  const H = meta.height; // 1536

  const targetW = 1024;
  const targetH = 2280;
  const topOffset = 180;

  // 1. In the source image (1024x1536), clean the top 64px status bar
  // and paint the 6 PIN dots into the desired space at Y=660:
  // Dot centers: X = 284, 375, 466, 557, 648, 739
  const sourcePatchSvg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topStatus" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="35%" stop-color="#045a42"/>
        <stop offset="70%" stop-color="#064e3b"/>
        <stop offset="100%" stop-color="#022c22"/>
      </linearGradient>
    </defs>
    <!-- Clean top status bar -->
    <rect x="0" y="0" width="${W}" height="64" fill="url(#topStatus)"/>

    <!-- 6 Clean PIN Indicator Circles in the desired space (Y=660) -->
    <circle cx="284" cy="660" r="16" fill="rgba(255,255,255,0.7)" stroke="#94a3b8" stroke-width="2.5"/>
    <circle cx="375" cy="660" r="16" fill="rgba(255,255,255,0.7)" stroke="#94a3b8" stroke-width="2.5"/>
    <circle cx="466" cy="660" r="16" fill="rgba(255,255,255,0.7)" stroke="#94a3b8" stroke-width="2.5"/>
    <circle cx="557" cy="660" r="16" fill="rgba(255,255,255,0.7)" stroke="#94a3b8" stroke-width="2.5"/>
    <circle cx="648" cy="660" r="16" fill="rgba(255,255,255,0.7)" stroke="#94a3b8" stroke-width="2.5"/>
    <circle cx="739" cy="660" r="16" fill="rgba(255,255,255,0.7)" stroke="#94a3b8" stroke-width="2.5"/>
  </svg>
  `;

  // First patch the source image with the clean status bar & 6 empty circles
  const patchedSourceBuffer = await sharp(srcPath)
    .composite([{ input: Buffer.from(sourcePatchSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // 2. Create the full-height 20:9 canvas (1024x2280) with rich emerald silk background
  const canvasSvg = `
  <svg width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fullBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="12%" stop-color="#034835"/>
        <stop offset="25%" stop-color="#022c22"/>
        <stop offset="75%" stop-color="#022c22"/>
        <stop offset="90%" stop-color="#01241c"/>
        <stop offset="100%" stop-color="#01140f"/>
      </linearGradient>
    </defs>
    <rect width="${targetW}" height="${targetH}" fill="url(#fullBg)"/>
  </svg>
  `;

  const canvasBuffer = await sharp(Buffer.from(canvasSvg)).png().toBuffer();

  // Composite the patched source onto the 20:9 canvas
  await sharp(canvasBuffer)
    .composite([{ input: patchedSourceBuffer, top: topOffset, left: 0 }])
    .png({ palette: false, quality: 100 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'login_bg_phone_20_9.png'));

  console.log('Saved assets/login/login_bg_phone_20_9.png successfully!');
}

generatePhoneBackground().catch(console.error);
