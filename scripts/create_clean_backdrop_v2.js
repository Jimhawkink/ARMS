const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/login_bg_premium.png';

async function createCleanBackdrop() {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width;  // 1024
  const H = meta.height; // 1536

  // In this script, we preserve:
  // 1. Top Right: Luxury modern villa (X=520..1024, Y=0..450)
  // 2. Left silk ribbon: (X=0..120, Y=0..1536)
  // 3. Bottom Left: Tropical monstera leaves & "Your Property, Our Priority!" (X=0..260, Y=950..1536)
  // 4. Bottom Right: Neon green wave (X=750..1024, Y=1200..1536)
  // 5. Clean top status bar (Y=0..70)
  // 6. Smooth out the center where the card floats (X=140..880, Y=350..1400) into rich emerald silk
  // 7. Smooth out the header text area (X=200..550, Y=80..320) so React Native header renders cleanly!

  const cleanSvg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Deep emerald silk radial gradient matching background canvas -->
      <radialGradient id="centerSilk" cx="50%" cy="55%" r="48%">
        <stop offset="0%" stop-color="#023024" stop-opacity="0.98"/>
        <stop offset="65%" stop-color="#022a1f" stop-opacity="0.94"/>
        <stop offset="85%" stop-color="#034834" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="#047857" stop-opacity="0"/>
      </radialGradient>
      <!-- Clean top status bar gradient -->
      <linearGradient id="topStatus" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="35%" stop-color="#045a42"/>
        <stop offset="70%" stop-color="#064e3b"/>
        <stop offset="100%" stop-color="#022c22"/>
      </linearGradient>
      <!-- Clean header box gradient -->
      <linearGradient id="headerSilk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#023024" stop-opacity="0.97"/>
        <stop offset="100%" stop-color="#034b37" stop-opacity="0.95"/>
      </linearGradient>
    </defs>

    <!-- Top status bar patch -->
    <rect x="0" y="0" width="${W}" height="68" fill="url(#topStatus)"/>

    <!-- Header text area patch (X=0..520, Y=68..340) so React Native logo + dynamic company name renders crisply -->
    <rect x="0" y="68" width="520" height="280" fill="url(#headerSilk)"/>

    <!-- Smooth center ellipse covering the baked card area so React Native curvy card floats cleanly -->
    <ellipse cx="512" cy="900" rx="410" ry="580" fill="url(#centerSilk)"/>
  </svg>
  `;

  await sharp(srcPath)
    .composite([{ input: Buffer.from(cleanSvg), top: 0, left: 0 }])
    .png({ palette: false, quality: 100 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'login_backdrop_clean.png'));

  console.log('Saved assets/login/login_backdrop_clean.png successfully');
}

createCleanBackdrop().catch(console.error);
