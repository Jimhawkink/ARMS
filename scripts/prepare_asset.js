const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/login_bg_premium.png';

async function prepareProductionAsset() {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width;  // 1024
  const H = meta.height; // 1536

  // 1. Clean the top status bar (Y=0..64)
  // 2. Clean the "FRANKLIN MUGAMBI" text area (X=230..530, Y=95..215)
  const cleanSvg = `
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
    <!-- Patch top 60px status bar -->
    <rect x="0" y="0" width="${W}" height="64" fill="url(#topStatus)"/>

    <!-- Patch "FRANKLIN MUGAMBI" text area -->
    <rect x="230" y="95" width="310" height="120" rx="16" fill="url(#headerSilk)"/>
  </svg>
  `;

  await sharp(srcPath)
    .composite([{ input: Buffer.from(cleanSvg), top: 0, left: 0 }])
    .png({ palette: false, quality: 100 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'login_bg_ready.png'));

  console.log('Saved 24-bit assets/login/login_bg_ready.png');
}

prepareProductionAsset().catch(console.error);
