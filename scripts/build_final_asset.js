const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const srcPath = 'assets/login/login_bg_premium.png';

async function buildFinalAsset() {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width;  // 1024
  const H = meta.height; // 1536

  // Biometric fingerprint SVG
  const fingerprintSvg = `
  <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 12 C30 12 18 26 18 46 C18 53 20 60 23 66" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
    <path d="M82 46 C82 32 74 20 60 15" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
    <path d="M32 46 C32 36 40 28 50 28 C60 28 68 36 68 46 C68 62 64 72 56 84" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
    <path d="M50 46 V54 C50 64 45 74 38 82" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
    <path d="M16 78 C21 86 30 92 42 94" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
    <path d="M76 60 C80 70 82 80 82 90" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
    <path d="M68 90 C66 94 62 97 56 98" stroke="#00C853" stroke-width="7" stroke-linecap="round"/>
  </svg>
  `;
  const fpBuffer = await sharp(Buffer.from(fingerprintSvg)).png().toBuffer();

  // Overlay with:
  // 1. Status bar patch (Y=0..64)
  // 2. Header silk patch for dynamic business name (X=230..530, Y=95..215)
  // 3. Numbers 1, 2, 3, 4, 5, 6, 7, 8, 9, 0
  const overlaySvg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topStatus" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="35%" stop-color="#045a42"/>
        <stop offset="70%" stop-color="#064e3b"/>
        <stop offset="100%" stop-color="#022c22"/>
      </linearGradient>
      <linearGradient id="headerSilk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#023024" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="#04533e" stop-opacity="0.92"/>
      </linearGradient>
    </defs>

    <!-- 1. Top 64px status bar patch -->
    <rect x="0" y="0" width="${W}" height="64" fill="url(#topStatus)"/>

    <!-- 2. Header silk patch for dynamic business name -->
    <rect x="230" y="95" width="310" height="120" rx="16" fill="url(#headerSilk)"/>

    <!-- 3. Keypad Numbers -->
    <style>
      .num { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 56px; font-weight: 800; fill: #0f172a; text-anchor: middle; dominant-baseline: central; }
    </style>
    <!-- Row 1 (Y=763) -->
    <text x="300" y="763" class="num">1</text>
    <text x="512" y="763" class="num">2</text>
    <text x="724" y="763" class="num">3</text>

    <!-- Row 2 (Y=883) -->
    <text x="300" y="883" class="num">4</text>
    <text x="512" y="883" class="num">5</text>
    <text x="724" y="883" class="num">6</text>

    <!-- Row 3 (Y=1003) -->
    <text x="300" y="1003" class="num">7</text>
    <text x="512" y="1003" class="num">8</text>
    <text x="724" y="1003" class="num">9</text>

    <!-- Row 4 (Y=1123) -->
    <text x="512" y="1123" class="num">0</text>
  </svg>
  `;

  const compositeOperations = [
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    // Fingerprint icon centered at (300, 1123) -> top: 1123 - 30 = 1093, left: 300 - 30 = 270
    { input: fpBuffer, top: 1093, left: 270 }
  ];

  await sharp(srcPath)
    .composite(compositeOperations)
    .png({ palette: false, quality: 100 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'login_bg_final.png'));

  console.log('Saved assets/login/login_bg_final.png successfully');
}

buildFinalAsset().catch(console.error);
